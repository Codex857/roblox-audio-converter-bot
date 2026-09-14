import "dotenv/config";
import ffmpegPath from "ffmpeg-static";
import probe from "ffprobe-static";
import { readFileSync } from "node:fs";
import { checkMediaRuntime } from "./media-runtime.js";
import { checkYouTubeTool } from "./youtube.js";
import { createYouTubeApi } from "./youtube-api.js";
import { startServer } from "./server.js";
const apiKey = process.env.API_KEY?.trim() || process.env.YOUTUBE_API_KEY?.trim();
if (!apiKey) throw new Error("API_KEY is required for the standalone API.");
const ytDlpPath = process.env.YT_DLP_PATH?.trim() || "yt-dlp";
const runtime = await checkMediaRuntime(ffmpegPath, probe.path);
const downloaderVersion = await checkYouTubeTool(ytDlpPath);
const version = JSON.parse(readFileSync(new URL("../package.json", import.meta.url))).version;
const server = startServer({ port: Number(process.env.PORT || 3000),
  getStatus: () => ({ status: "ok", version, ...runtime, yt_dlp: true, downloaderVersion }),
  handleYouTubeApi: createYouTubeApi({ apiKey, ytDlpPath, ffmpegPath }) });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close());
