import { createHash, timingSafeEqual } from "node:crypto";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { downloadYouTubeMp3, normalizeYouTubeUrl, YouTubeError } from "./youtube.js";

const digest = value => createHash("sha256").update(value).digest();
function fail(res, status, code, message) {
  if (res.destroyed || res.headersSent) return;
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify({ success: false, data: null, error: { code, message } }));
}

export function createYouTubeApi({ apiKey = "", ytDlpPath, ffmpegPath,
  download = downloadYouTubeMp3, tempRoot = tmpdir(), now = Date.now }) {
  if (apiKey && apiKey.length < 32) throw new Error("YOUTUBE_API_KEY must contain at least 32 characters.");
  let active = false;
  let nextRequest = 0;
  return async (req, res) => {
    if (!apiKey) return fail(res, 404, "DISABLED", "API is disabled.");
    if (!timingSafeEqual(digest(req.headers.authorization || ""), digest(`Bearer ${apiKey}`))) {
      return fail(res, 401, "UNAUTHORIZED", "A valid API key is required.");
    }
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return fail(res, 405, "METHOD_NOT_ALLOWED", "Use POST.");
    }
    if (active || now() < nextRequest) {
      res.setHeader("Retry-After", "10");
      return fail(res, 429, "BUSY", "Wait before submitting another request.");
    }
    if (req.headers["content-type"]?.split(";")[0].trim() !== "application/json") {
      return fail(res, 415, "CONTENT_TYPE", "Use application/json.");
    }
    active = true;
    let folder;
    const timer = setTimeout(() => req.destroy(), 10_000);
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 4096) return fail(res, 413, "BODY_TOO_LARGE", "Request exceeds 4 KB.");
        chunks.push(chunk);
      }
      clearTimeout(timer);
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
      catch { return fail(res, 400, "INVALID_JSON", "Invalid JSON body."); }
      if (!body || body.rights_confirm !== true || typeof body.url !== "string") {
        return fail(res, 400, "INVALID_REQUEST", "Provide url and rights_confirm: true for audio you own or may download.");
      }
      let url;
      try { url = normalizeYouTubeUrl(body.url); }
      catch { return fail(res, 400, "INVALID_URL", "Provide a single HTTPS YouTube video link."); }
      folder = await mkdtemp(join(tempRoot, "eclipse-api-"));
      const result = await download({ ytDlpPath, ffmpegPath, url, outputPath: join(folder, "audio.mp3") });
      if (res.destroyed) return;
      const file = await stat(result.path);
      if (!file.isFile() || file.size <= 0 || file.size > 25 * 1024 * 1024) {
        return fail(res, 413, "FILE_TOO_LARGE", "Audio is empty or exceeds 25 MB.");
      }
      res.writeHead(200, { "content-type": "audio/mpeg", "content-length": file.size,
        "content-disposition": 'attachment; filename="audio.mp3"', "cache-control": "no-store",
        "x-content-type-options": "nosniff" });
      res.setTimeout(60_000, () => res.destroy());
      await pipeline(createReadStream(result.path), res);
    } catch (error) {
      const known = error instanceof YouTubeError;
      const status = known && ["BUSY", "COOLDOWN", "RATE_LIMIT"].includes(error.code) ? 429 : 502;
      fail(res, status, known ? error.code : "DOWNLOAD_FAILED",
        known ? error.message : "Audio could not be downloaded. Try your original audio file.");
    } finally {
      clearTimeout(timer);
      try { if (folder) await rm(folder, { recursive: true, force: true }); }
      catch { console.error(JSON.stringify({ event: "youtube_api_cleanup_failed" })); }
      active = false;
      nextRequest = now() + 10_000;
    }
  };
}
