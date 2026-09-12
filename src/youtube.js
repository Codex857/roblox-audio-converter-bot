import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const MAX_DURATION_SECONDS = 7 * 60;
const MAX_MP3_BYTES = 25 * 1024 * 1024;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export function normalizeYouTubeUrl(value) {
  let url;
  try {
    url = new URL(String(value || "").trim());
  } catch {
    throw new Error("Invalid YouTube link.");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) {
    throw new Error("Use a normal HTTPS YouTube link.");
  }

  const host = url.hostname.toLowerCase();
  let videoId;
  if (host === "youtu.be" || host === "www.youtu.be") {
    videoId = url.pathname.split("/").filter(Boolean)[0];
  } else if (["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"].includes(host)) {
    if (url.pathname === "/watch") videoId = url.searchParams.get("v");
    else {
      const match = /^\/(?:shorts|live|embed)\/([^/]+)$/.exec(url.pathname.replace(/\/$/, ""));
      videoId = match?.[1];
    }
  } else if (["youtube-nocookie.com", "www.youtube-nocookie.com"].includes(host)) {
    videoId = /^\/embed\/([^/]+)$/.exec(url.pathname.replace(/\/$/, ""))?.[1];
  }

  if (!VIDEO_ID.test(videoId || "")) {
    throw new Error("The link must point to one YouTube video, not a playlist or channel.");
  }
  return `https://www.youtube.com/watch?v=${videoId}`;
}

function baseArgs() {
  return [
    "--no-config",
    "--no-playlist",
    "--no-warnings",
    "--no-progress",
    "--extractor-retries", "0",
    "--js-runtimes", "node"
  ];
}

export function friendlyYouTubeError(error) {
  return classifyYouTubeError(error).message;
}

export function classifyYouTubeError(error) {
  const detail = String(error?.stderr || error?.stdout || error?.message || "")
    .split(/\r?\n/).filter(line => !/^\s*\[debug\]/i.test(line)).join("\n");
  const result = (code, message) => ({ code, message });
  if (/\bHTTP(?:\s+Error|\s+status(?:\s+code)?)?\s*[:=]?\s*429\b|too many requests|This content isn.t available, try again later/i.test(detail)) {
    return result("RATE_LIMIT", "YouTube rate-limited this server. Please wait before trying again.");
  }
  if (/sign in to confirm (?:you.re|you are) not a bot|confirm you.re not a bot/i.test(detail)) {
    return result("BOT_BLOCK", "YouTube blocked this cloud server request with a bot verification challenge.");
  }
  if (/confirm your age|age.restricted|inappropriate for some users/i.test(detail)) {
    return result("AGE_RESTRICTED", "This YouTube video requires age verification. Upload your original audio file instead.");
  }
  if (/not available in your country|not made this video available in your country|geo.restricted|region.restricted/i.test(detail)) {
    return result("REGION_RESTRICTED", "This YouTube video is unavailable in the server's region. Upload your authorized original audio file instead.");
  }
  if (/ffmpeg.*(?:not found|not installed|does not exist)|ffprobe.*(?:not found|not installed)/i.test(detail)) {
    return result("FFMPEG_MISSING", "FFmpeg is unavailable on the server. Please contact the bot administrator.");
  }
  if (/private video|members.only|video unavailable/i.test(detail)) {
    return result("UNAVAILABLE", "The YouTube video is not publicly available.");
  }
  if (/sign in|login required|cookies/i.test(detail)) {
    return result("LOGIN_REQUIRED", "This YouTube request requires login. The bot does not accept account cookies.");
  }
  if (/\bHTTP(?:\s+Error|\s+status(?:\s+code)?)?\s*[:=]?\s*403\b|forbidden/i.test(detail)) {
    return result("ACCESS_DENIED", "YouTube denied access (403). This alone does not confirm an IP block.");
  }
  if (error?.code === "ENOENT") {
    return result("TOOL_MISSING", "The YouTube downloader is not installed on the server.");
  }
  if (/copyright|drm|encrypted/i.test(detail)) {
    return result("PROTECTED", "This audio is protected and cannot be downloaded by the bot.");
  }
  if (/max-filesize|larger than|max filesize/i.test(detail)) {
    return result("TOO_LARGE", "The YouTube audio is too large for the bot to process.");
  }
  if (error?.killed || /timed out|timeout/i.test(detail)) {
    return result("TIMEOUT", "The YouTube connection timed out. Try again shortly.");
  }
  return result("DOWNLOAD_FAILED", "Failed to fetch audio from YouTube. Make sure the video is public and the link is still active.");
}

export class YouTubeError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "YouTubeError";
    this.code = code;
  }
}

// Shared by YouTube jobs only. Do not delay file or direct-link uploads.
export function createYouTubeGuard({ now = Date.now } = {}) {
  let until = 0;
  let lastErrorCode = null;
  let active = false;
  return {
    status: () => ({ cooldownSeconds: Math.max(0, Math.ceil((until - now()) / 1000)), lastErrorCode }),
    async run(task) {
      if (active) throw new YouTubeError("BUSY", "A YouTube download is already running. Please try again after it finishes.");
      if (now() < until) {
        throw new YouTubeError("COOLDOWN", `YouTube requests are paused. Try again in ${Math.ceil((until - now()) / 1000)} seconds, or upload your original audio file now.`);
      }
      until = now() + 10_000;
      active = true;
      try {
        const value = await task();
        lastErrorCode = null;
        return value;
      } catch (error) {
        lastErrorCode = error instanceof YouTubeError ? error.code : "DOWNLOAD_FAILED";
        const delay = { RATE_LIMIT: 15 * 60_000, BOT_BLOCK: 15 * 60_000, ACCESS_DENIED: 60_000 }[lastErrorCode] || 10_000;
        until = Math.max(until, now() + delay);
        throw error;
      } finally {
        active = false;
      }
    }
  };
}

const youtubeGuard = createYouTubeGuard();
export const youtubeRequestStatus = () => youtubeGuard.status();

async function runYtDlp(ytDlpPath, args, options = {}) {
  try {
    return await execFileAsync(ytDlpPath, args, {
      timeout: options.timeout || 60_000,
      maxBuffer: options.maxBuffer || 16 * 1024 * 1024,
      windowsHide: true
    });
  } catch (error) {
    const classified = classifyYouTubeError(error);
    throw new YouTubeError(classified.code, classified.message);
  }
}

export async function checkYouTubeTool(ytDlpPath) {
  const { stdout } = await runYtDlp(ytDlpPath, ["--version"], { timeout: 15_000, maxBuffer: 1024 * 1024 });
  const version = stdout.trim();
  if (!version) throw new Error("yt-dlp did not return a version.");
  return version;
}

export async function downloadYouTubeMp3(options) {
  normalizeYouTubeUrl(options.url);
  return youtubeGuard.run(() => downloadYouTubeMp3Unchecked(options));
}

async function downloadYouTubeMp3Unchecked({ ytDlpPath, ffmpegPath, url, outputPath }) {
  const normalizedUrl = normalizeYouTubeUrl(url);
  const { stdout } = await runYtDlp(ytDlpPath, [
    ...baseArgs(),
    "--dump-single-json",
    "--skip-download",
    "--",
    normalizedUrl
  ]);

  let metadata;
  try {
    metadata = JSON.parse(stdout);
  } catch {
    throw new Error("YouTube returned unreadable metadata.");
  }
  const duration = Number(metadata.duration);
  const isLive = metadata.is_live || ["is_live", "is_upcoming"].includes(metadata.live_status);
  if (metadata._type === "playlist" || Array.isArray(metadata.entries)) {
    throw new Error("Playlists are not supported. Use a single video link only.");
  }
  if (isLive) throw new Error("Live streams are not supported.");
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("The video duration could not be read.");
  if (duration > MAX_DURATION_SECONDS) throw new Error("YouTube audio exceeds Roblox's 7-minute limit.");

  const outputTemplate = join(dirname(outputPath), "youtube-source.%(ext)s");
  await runYtDlp(ytDlpPath, [
    ...baseArgs(),
    "--format", "bestaudio/best",
    "--extract-audio",
    "--audio-format", "mp3",
    "--audio-quality", "0",
    "--ffmpeg-location", ffmpegPath,
    "--max-filesize", "25M",
    "--socket-timeout", "20",
    "--retries", "0",
    "--fragment-retries", "0",
    "--output", outputTemplate,
    "--",
    normalizedUrl
  ], { timeout: 5 * 60_000 });

  const sourcePath = join(dirname(outputPath), "youtube-source.mp3");
  let fileInfo;
  try {
    fileInfo = await stat(sourcePath);
  } catch {
    throw new Error("YouTube did not produce a usable MP3 file.");
  }
  if (fileInfo.size <= 0 || fileInfo.size > MAX_MP3_BYTES) {
    throw new Error("The YouTube MP3 is empty or exceeds the bot's 25 MB limit.");
  }

  return {
    path: sourcePath,
    title: String(metadata.title || "YouTube Audio").trim().slice(0, 100),
    duration
  };
}
