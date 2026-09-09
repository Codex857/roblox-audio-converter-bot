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
    "--extractor-retries", "3",
    "--retry-sleep", "extractor:1",
    "--js-runtimes", "node"
  ];
}

export function friendlyYouTubeError(error) {
  const detail = String(error?.stderr || error?.stdout || error?.message || "");
  if (error?.code === "ENOENT") {
    return "The YouTube downloader is not installed on the server.";
  }
  if (/sign in to confirm|cookies/i.test(detail)) {
    return "YouTube is asking for login or blocking the cloud server address.";
  }
  if (/private video|members-only|video unavailable/i.test(detail)) {
    return "The YouTube video is not publicly available.";
  }
  if (/copyright|drm|encrypted/i.test(detail)) {
    return "This audio is protected and cannot be downloaded by the bot.";
  }
  if (/max-filesize|larger than|max filesize/i.test(detail)) {
    return "The YouTube audio is too large for the bot to process.";
  }
  if (/timed out|timeout/i.test(detail)) {
    return "The YouTube connection timed out. Try again shortly.";
  }
  return "Failed to fetch audio from YouTube. Make sure the video is public and the link is still active.";
}

async function runYtDlp(ytDlpPath, args, options = {}) {
  try {
    return await execFileAsync(ytDlpPath, args, {
      timeout: options.timeout || 60_000,
      maxBuffer: options.maxBuffer || 16 * 1024 * 1024,
      windowsHide: true
    });
  } catch (error) {
    throw new Error(friendlyYouTubeError(error));
  }
}

export async function checkYouTubeTool(ytDlpPath) {
  const { stdout } = await runYtDlp(ytDlpPath, ["--version"], { timeout: 15_000, maxBuffer: 1024 * 1024 });
  const version = stdout.trim();
  if (!version) throw new Error("yt-dlp did not return a version.");
  return version;
}

export async function downloadYouTubeMp3({ ytDlpPath, ffmpegPath, url, outputPath }) {
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
    "--retries", "3",
    "--fragment-retries", "3",
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
