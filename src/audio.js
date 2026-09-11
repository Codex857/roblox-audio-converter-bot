import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const ROBLOX_MAX_SECONDS = 7 * 60;
export const ROBLOX_MAX_BYTES = 20 * 1024 * 1024;
export const DOWNLOAD_MAX_BYTES = 25 * 1024 * 1024;
export const DISCORD_SAFE_MAX_BYTES = Math.floor(9.5 * 1024 * 1024);

const QUALITY_BITRATES = Object.freeze({
  compact: "128k",
  standard: "160k",
  high: "192k"
});
const AUDIO_SPEEDS = new Set([0.75, 1, 1.25, 1.5, 2]);
const AUDIO_PRESETS = new Set(["preserve", "balanced", "bass", "vocal"]);

export function bitrateForQuality(quality = "standard") {
  const bitrate = QUALITY_BITRATES[quality];
  if (!bitrate) throw new Error("Invalid quality option.");
  return bitrate;
}

export function normalizeAudioSpeed(value = 1) {
  const speed = Number(value);
  if (!AUDIO_SPEEDS.has(speed)) throw new Error("Audio speed must be 0.75x, 1x, 1.25x, 1.5x, or 2x.");
  return speed;
}

export function normalizeAudioPreset(value = "preserve") {
  const preset = String(value || "preserve").trim().toLowerCase();
  if (!AUDIO_PRESETS.has(preset)) throw new Error("Invalid audio preset.");
  return preset;
}

export function normalizeAudioTrim(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const match = /^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/.exec(text);
  if (!match) throw new Error("Trim must use start-end seconds, for example 30-90.");
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (end <= start) throw new Error("Trim end must be greater than trim start.");
  if (end - start > ROBLOX_MAX_SECONDS * 2) throw new Error("The selected trim range is too long.");
  return { start, end, duration: end - start };
}

export function audioFilterForOptions(options = {}) {
  const speed = normalizeAudioSpeed(options.speed ?? 1);
  const preset = normalizeAudioPreset(options.preset);
  const filters = ["aresample=48000"];
  if (speed !== 1) filters.push(`atempo=${speed}`);
  if (preset === "bass") filters.push("bass=g=5:f=100:w=0.7");
  if (preset === "vocal") filters.push("equalizer=f=2500:t=q:w=1:g=3");
  filters.push(options.normalize === true
    ? "loudnorm=I=-14:TP=-1.5:LRA=11"
    : "alimiter=limit=0.95:attack=5:release=50");
  return filters.join(",");
}

export function validateAttachment(attachment) {
  const extension = attachment.name?.split(".").pop()?.toLowerCase();
  const allowedExtensions = new Set(["mp3", "ogg", "wav", "flac", "m4a", "aac"]);
  const url = new URL(attachment.url);

  if (!allowedExtensions.has(extension)) {
    throw new Error("Unsupported input format. Use MP3, OGG, WAV, FLAC, M4A, or AAC.");
  }

  const isDiscordHost = ["discordapp.com", "discordapp.net"].some(
    (domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`)
  );
  if (!isDiscordHost) {
    throw new Error("Attachments must come directly from Discord.");
  }

  if (attachment.size > DOWNLOAD_MAX_BYTES) {
    throw new Error("Input file is too large. The bot limit is 25 MB.");
  }
}

export async function downloadAttachment(attachment, destination) {
  validateAttachment(attachment);
  const response = await fetch(attachment.url, { signal: AbortSignal.timeout(60_000) });

  if (!response.ok || !response.body) {
    throw new Error(`Failed to download file (HTTP ${response.status}).`);
  }

  const declaredSize = Number(response.headers.get("content-length") || 0);
  if (declaredSize > DOWNLOAD_MAX_BYTES) {
    throw new Error("Input file exceeds the 25 MB limit.");
  }

  const { createWriteStream } = await import("node:fs");
  const { Readable, Transform } = await import("node:stream");
  const { pipeline } = await import("node:stream/promises");
  let received = 0;

  const sizeGuard = new Transform({
    transform(chunk, _encoding, callback) {
      received += chunk.length;
      if (received > DOWNLOAD_MAX_BYTES) callback(new Error("Input file exceeds the 25 MB limit."));
      else callback(null, chunk);
    }
  });

  await pipeline(Readable.fromWeb(response.body), sizeGuard, createWriteStream(destination));
}

export async function inspectAudio(ffprobePath, inputPath, options = {}) {
  const { stdout } = await execFileAsync(
    ffprobePath,
    ["-v", "error", "-show_entries", "format=duration", "-of", "json", inputPath],
    { timeout: 30_000, maxBuffer: 1024 * 1024 }
  );
  const duration = Number(JSON.parse(stdout).format?.duration);

  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("Invalid audio, or the duration could not be read.");
  }
  const speed = normalizeAudioSpeed(options.speed ?? 1);
  const trim = normalizeAudioTrim(options.trim);
  if (trim && trim.start >= duration) throw new Error("Trim start is after the end of the audio.");
  const selectedDuration = trim ? Math.min(duration, trim.end) - trim.start : duration;
  if (selectedDuration / speed > ROBLOX_MAX_SECONDS) {
    throw new Error("Audio is still over Roblox's 7-minute limit after the selected speed.");
  }

  return { duration, selectedDuration, trim };
}

export async function inspectConvertedAudio(ffprobePath, outputPath) {
  const { stdout } = await execFileAsync(
    ffprobePath,
    [
      "-v", "error", "-select_streams", "a:0",
      "-show_entries", "stream=codec_name,sample_rate,channels:format=duration,size",
      "-of", "json", outputPath
    ],
    { timeout: 30_000, maxBuffer: 1024 * 1024 }
  );
  const probe = JSON.parse(stdout);
  const stream = probe.streams?.[0];
  const duration = Number(probe.format?.duration);
  const size = Number(probe.format?.size);
  const sampleRate = Number(stream?.sample_rate);
  const channels = Number(stream?.channels);

  if (!stream || !Number.isFinite(duration) || duration <= 0 || !Number.isFinite(size) || size <= 0) {
    throw new Error("The generated OGG file is invalid.");
  }
  if (duration > ROBLOX_MAX_SECONDS + 0.25) {
    throw new Error("The generated OGG file exceeds Roblox's 7-minute limit.");
  }
  if (size >= ROBLOX_MAX_BYTES) {
    throw new Error("The generated OGG file exceeds Roblox's 20 MB limit.");
  }
  if (stream.codec_name !== "vorbis" || sampleRate !== 48_000 || channels !== 2) {
    throw new Error("The output file is not a valid 48 kHz stereo OGG Vorbis file.");
  }

  return { duration, size, sampleRate, channels, codec: stream.codec_name };
}

export async function analyzeAudioHealth(ffmpegPath, ffprobePath, inputPath) {
  const { stdout } = await execFileAsync(ffprobePath, [
    "-v", "error", "-select_streams", "a:0",
    "-show_entries", "stream=codec_name,sample_rate,channels,bit_rate:format=duration,size,bit_rate",
    "-of", "json", inputPath
  ], { timeout: 30_000, maxBuffer: 1024 * 1024, windowsHide: true });
  const probe = JSON.parse(stdout);
  const stream = probe.streams?.[0];
  if (!stream) throw new Error("No readable audio stream was found.");
  const duration = Number(probe.format?.duration);
  const size = Number(probe.format?.size);
  const sampleRate = Number(stream.sample_rate);
  const channels = Number(stream.channels);
  if (![duration, size, sampleRate, channels].every(Number.isFinite)) throw new Error("Audio metadata is incomplete or invalid.");

  const { stderr } = await execFileAsync(ffmpegPath, [
    "-hide_banner", "-nostats", "-i", inputPath, "-map", "0:a:0", "-af", "volumedetect", "-f", "null", "-"
  ], { timeout: 3 * 60_000, maxBuffer: 4 * 1024 * 1024, windowsHide: true });
  const meanVolume = Number(/mean_volume:\s*(-?[\d.]+) dB/i.exec(stderr)?.[1]);
  const maxVolume = Number(/max_volume:\s*(-?[\d.]+) dB/i.exec(stderr)?.[1]);
  let score = 100;
  const issues = [];
  const recommendations = [];

  if (duration >= ROBLOX_MAX_SECONDS) { score -= 30; issues.push("Duration reaches/exceeds Roblox's 7-minute limit."); recommendations.push("Trim the audio or increase speed."); }
  if (size >= ROBLOX_MAX_BYTES) { score -= 25; issues.push("File reaches/exceeds Roblox's 20 MB limit."); recommendations.push("Use the bot's OGG conversion."); }
  if (sampleRate > 48_000) { score -= 10; issues.push("Sample rate exceeds 48 kHz."); recommendations.push("Resample to 48 kHz."); }
  if (![1, 2].includes(channels)) { score -= 5; issues.push(`${channels}-channel audio will be converted to stereo.`); }
  if (Number.isFinite(maxVolume) && maxVolume >= -0.1) { score -= 20; issues.push("Peak level is at 0 dB and may be clipping."); recommendations.push("Apply peak limiting or normalization."); }
  else if (Number.isFinite(maxVolume) && maxVolume > -1) { score -= 8; issues.push("Very little peak headroom remains."); }
  if (Number.isFinite(meanVolume) && meanVolume < -32) { score -= 12; issues.push("Average volume is very quiet."); recommendations.push("Use Balanced Loudness."); }
  if (Number.isFinite(meanVolume) && meanVolume > -10) { score -= 8; issues.push("Average volume is unusually loud."); recommendations.push("Use Balanced Loudness to reduce listener fatigue."); }
  score = Math.max(0, Math.min(100, score));
  return {
    score,
    grade: score >= 90 ? "Excellent" : score >= 75 ? "Good" : score >= 55 ? "Needs attention" : "Poor",
    duration, size, sampleRate, channels,
    codec: String(stream.codec_name || "unknown"),
    bitRate: Number(stream.bit_rate || probe.format?.bit_rate) || null,
    meanVolume: Number.isFinite(meanVolume) ? meanVolume : null,
    maxVolume: Number.isFinite(maxVolume) ? maxVolume : null,
    issues,
    recommendations: [...new Set(recommendations)]
  };
}

export async function generateWaveform(ffmpegPath, inputPath, outputPath) {
  await execFileAsync(ffmpegPath, [
    "-hide_banner", "-loglevel", "error", "-y", "-i", inputPath,
    "-filter_complex", "aformat=channel_layouts=mono,showwavespic=s=1200x320:colors=0x67e8f9",
    "-frames:v", "1", outputPath
  ], { timeout: 60_000, maxBuffer: 2 * 1024 * 1024, windowsHide: true });
}

export async function convertAudio(ffmpegPath, inputPath, outputPath, options = {}) {
  const quality = options.quality || "standard";
  const normalize = options.normalize === true;
  const bitrate = bitrateForQuality(quality);
  const trim = normalizeAudioTrim(options.trim);
  // Preserve mode only resamples and catches peaks. Loudness normalization is
  // opt-in because it deliberately changes the dynamics of the original mix.
  const audioFilter = audioFilterForOptions({ normalize, speed: options.speed, preset: options.preset });
  const args = [
    "-hide_banner", "-loglevel", "error", "-y",
    ...(trim ? ["-ss", String(trim.start), "-t", String(trim.duration)] : []),
    "-i", inputPath,
    "-map", "0:a:0", "-vn", "-sn", "-dn",
    "-af", audioFilter,
    "-ar", "48000", "-ac", "2", "-c:a", "libvorbis", "-b:a", bitrate,
    outputPath
  ];

  await execFileAsync(ffmpegPath, args, {
    timeout: 3 * 60_000,
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true
  });
}

export function safeBaseName(name = "audio") {
  const withoutExtension = name.replace(/\.[^.]+$/, "");
  const cleaned = withoutExtension.normalize("NFKD").replace(/[^a-zA-Z0-9_-]+/g, "-");
  return cleaned.replace(/^-+|-+$/g, "").slice(0, 60) || "audio";
}

export function assetDisplayName(name = "Audio", { stripExtension = true } = {}) {
  const source = String(name);
  const withoutExtension = stripExtension ? source.replace(/\.[^.]+$/, "") : source;
  const cleaned = withoutExtension
    .normalize("NFKC")
    .replace(/[_-]+/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || "Audio").slice(0, 50);
}
