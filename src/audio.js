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

export function bitrateForQuality(quality = "standard") {
  const bitrate = QUALITY_BITRATES[quality];
  if (!bitrate) throw new Error("Pilihan kualiti tidak sah.");
  return bitrate;
}

export function validateAttachment(attachment) {
  const extension = attachment.name?.split(".").pop()?.toLowerCase();
  const allowedExtensions = new Set(["mp3", "ogg", "wav", "flac", "m4a", "aac"]);
  const url = new URL(attachment.url);

  if (!allowedExtensions.has(extension)) {
    throw new Error("Format input tidak disokong. Gunakan MP3, OGG, WAV, FLAC, M4A, atau AAC.");
  }

  const isDiscordHost = ["discordapp.com", "discordapp.net"].some(
    (domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`)
  );
  if (!isDiscordHost) {
    throw new Error("Lampiran mesti datang terus daripada Discord.");
  }

  if (attachment.size > DOWNLOAD_MAX_BYTES) {
    throw new Error("Fail input terlalu besar. Had bot ialah 25 MB.");
  }
}

export async function downloadAttachment(attachment, destination) {
  validateAttachment(attachment);
  const response = await fetch(attachment.url, { signal: AbortSignal.timeout(60_000) });

  if (!response.ok || !response.body) {
    throw new Error(`Gagal memuat turun fail (HTTP ${response.status}).`);
  }

  const declaredSize = Number(response.headers.get("content-length") || 0);
  if (declaredSize > DOWNLOAD_MAX_BYTES) {
    throw new Error("Fail input melebihi had 25 MB.");
  }

  const { createWriteStream } = await import("node:fs");
  const { Readable, Transform } = await import("node:stream");
  const { pipeline } = await import("node:stream/promises");
  let received = 0;

  const sizeGuard = new Transform({
    transform(chunk, _encoding, callback) {
      received += chunk.length;
      if (received > DOWNLOAD_MAX_BYTES) callback(new Error("Fail input melebihi had 25 MB."));
      else callback(null, chunk);
    }
  });

  await pipeline(Readable.fromWeb(response.body), sizeGuard, createWriteStream(destination));
}

export async function inspectAudio(ffprobePath, inputPath) {
  const { stdout } = await execFileAsync(
    ffprobePath,
    ["-v", "error", "-show_entries", "format=duration", "-of", "json", inputPath],
    { timeout: 30_000, maxBuffer: 1024 * 1024 }
  );
  const duration = Number(JSON.parse(stdout).format?.duration);

  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("Audio tidak sah atau durasinya tidak dapat dibaca.");
  }
  if (duration > ROBLOX_MAX_SECONDS) {
    throw new Error("Audio melebihi had Roblox 7 minit.");
  }

  return { duration };
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
    throw new Error("Fail OGG yang dihasilkan tidak sah.");
  }
  if (duration > ROBLOX_MAX_SECONDS + 0.25) {
    throw new Error("Fail OGG yang dihasilkan melebihi had Roblox 7 minit.");
  }
  if (size >= ROBLOX_MAX_BYTES) {
    throw new Error("Fail OGG yang dihasilkan melebihi had Roblox 20 MB.");
  }
  if (stream.codec_name !== "vorbis" || sampleRate !== 48_000 || channels !== 2) {
    throw new Error("Fail output bukan OGG Vorbis stereo 48 kHz yang sah.");
  }

  return { duration, size, sampleRate, channels, codec: stream.codec_name };
}

export async function convertAudio(ffmpegPath, inputPath, outputPath, options = {}) {
  const quality = options.quality || "standard";
  const normalize = options.normalize === true;
  const bitrate = bitrateForQuality(quality);
  // Preserve mode only resamples and catches peaks. Loudness normalization is
  // opt-in because it deliberately changes the dynamics of the original mix.
  const audioFilter = normalize
    ? "aresample=48000,loudnorm=I=-14:LRA=11:TP=-1.0"
    : "aresample=48000,alimiter=limit=0.95:attack=5:release=50";
  const args = [
    "-hide_banner", "-loglevel", "error", "-y", "-i", inputPath,
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
