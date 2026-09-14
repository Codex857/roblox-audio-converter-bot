import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import ffmpegPath from "ffmpeg-static";
import probe from "ffprobe-static";
import { checkMediaRuntime, convertToMp3 } from "../src/media-runtime.js";
const exec = promisify(execFile);
test("real FFmpeg and ffprobe runtime checks", async () => {
  assert.deepEqual(await checkMediaRuntime(ffmpegPath, probe.path), { ffmpeg: true, ffprobe: true });
  await assert.rejects(checkMediaRuntime("missing-executable-for-test", probe.path), { code: "FFMPEG_NOT_FOUND" });
  await assert.rejects(checkMediaRuntime(ffmpegPath, "missing-executable-for-test"), { code: "FFPROBE_NOT_FOUND" });
});
test("real synthetic audio converts to verified 192k MP3 and invalid media fails", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mp3-test-"));
  try {
    const inputPath = join(dir, "source.wav");
    const outputPath = join(dir, "out.mp3");
    await exec(ffmpegPath, ["-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", inputPath]);
    const result = await convertToMp3({ ffmpegPath, ffprobePath: probe.path, inputPath, outputPath });
    assert.ok(result.bytes > 0);
    assert.ok(result.duration >= 1);
    assert.equal(result.bitrate, "192k");
    await writeFile(inputPath, "invalid audio");
    await assert.rejects(convertToMp3({ ffmpegPath, ffprobePath: probe.path, inputPath, outputPath }), { code: "CONVERSION_FAILED" });
  } finally { await rm(dir, { recursive: true, force: true }); }
});
