import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { stat } from "node:fs/promises";
const exec = promisify(execFile);
export class MediaError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
export async function checkMediaRuntime(ffmpeg, ffprobe) {
  for (const [name, path] of [["ffmpeg", ffmpeg], ["ffprobe", ffprobe]]) {
    try { await exec(path, ["-version"], { timeout: 10000, maxBuffer: 65536, windowsHide: true }); }
    catch { throw new MediaError(`${name.toUpperCase()}_NOT_FOUND`, `${name} runtime check failed.`); }
  }
  return { ffmpeg: true, ffprobe: true };
}
export async function convertToMp3({ ffmpegPath, ffprobePath, inputPath, outputPath }) {
  try {
    await exec(ffmpegPath, ["-nostdin", "-v", "error", "-y", "-protocol_whitelist", "file,pipe",
      "-i", inputPath, "-map", "0:a:0", "-vn", "-map_metadata", "-1", "-c:a", "libmp3lame",
      "-b:a", "192k", "-t", "420", "-fs", String(25 * 1024 * 1024), outputPath],
    { timeout: 120000, maxBuffer: 65536, windowsHide: true });
  } catch (error) {
    throw new MediaError(error.code === "ENOENT" ? "FFMPEG_NOT_FOUND" : error.killed ? "DOWNLOAD_TIMEOUT" : "CONVERSION_FAILED", "MP3 conversion failed.");
  }
  try {
    const file = await stat(outputPath);
    if (!file.size || file.size >= 25 * 1024 * 1024) throw new MediaError("FILE_TOO_LARGE", "MP3 is empty or reaches the size limit.");
    const { stdout } = await exec(ffprobePath, ["-v", "error", "-show_streams", "-show_format", "-of", "json", outputPath],
      { timeout: 15000, maxBuffer: 65536, windowsHide: true });
    const info = JSON.parse(stdout);
    if (!info.streams?.some(s => s.codec_name === "mp3") || !(Number(info.format?.duration) > 0)) throw new Error("Invalid MP3");
    return { bytes: file.size, duration: Number(info.format.duration), bitrate: "192k" };
  } catch (error) {
    if (error instanceof MediaError) throw error;
    throw new MediaError("CONVERSION_FAILED", "MP3 verification failed.");
  }
}
