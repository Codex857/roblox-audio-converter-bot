import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import {
  assetDisplayName,
  audioFilterForOptions,
  bitrateForQuality,
  convertAudio,
  inspectConvertedAudio,
  analyzeAudioHealth,
  generateWaveform,
  normalizeAudioPreset,
  normalizeAudioSpeed,
  normalizeAudioTrim,
  safeBaseName,
  validateAttachment
} from "../src/audio.js";

const execFileAsync = promisify(execFile);

test("safeBaseName produces a portable output name", () => {
  assert.equal(safeBaseName("Lagu Saya (Final).mp3"), "Lagu-Saya-Final");
  assert.equal(safeBaseName("..."), "audio");
});

test("validateAttachment accepts Discord CDN audio", () => {
  assert.doesNotThrow(() => validateAttachment({
    name: "track.wav",
    size: 1024,
    url: "https://cdn.discordapp.com/attachments/1/2/track.wav"
  }));
});

test("validateAttachment rejects unsupported files", () => {
  assert.throws(() => validateAttachment({
    name: "track.exe",
    size: 1024,
    url: "https://cdn.discordapp.com/attachments/1/2/track.exe"
  }), /Unsupported input format/);
});

test("bitrateForQuality maps supported presets", () => {
  assert.equal(bitrateForQuality("compact"), "128k");
  assert.equal(bitrateForQuality("standard"), "160k");
  assert.equal(bitrateForQuality("high"), "192k");
  assert.throws(() => bitrateForQuality("extreme"), /Invalid quality option/);
});

test("speed options are normalized and included in the audio filter", () => {
  assert.equal(normalizeAudioSpeed("0.75"), 0.75);
  assert.equal(normalizeAudioSpeed("1"), 1);
  assert.equal(normalizeAudioSpeed("1.25"), 1.25);
  assert.equal(normalizeAudioSpeed("1.5"), 1.5);
  assert.equal(normalizeAudioSpeed("2"), 2);
  assert.throws(() => normalizeAudioSpeed("1.75"), /Audio speed/);
  assert.match(audioFilterForOptions({ speed: 1.5, normalize: true }), /atempo=1\.5/);
  assert.doesNotMatch(audioFilterForOptions({ speed: 1, normalize: true }), /atempo=/);
});

test("audio presets preserve the mix or add focused EQ", () => {
  assert.equal(normalizeAudioPreset(), "preserve");
  assert.match(audioFilterForOptions({ preset: "bass" }), /bass=g=5/);
  assert.match(audioFilterForOptions({ preset: "vocal" }), /equalizer=f=2500/);
  assert.doesNotMatch(audioFilterForOptions({ preset: "preserve" }), /bass=|equalizer=/);
  assert.throws(() => normalizeAudioPreset("destroy"), /Invalid audio preset/);
});

test("audio trim accepts a safe start-end range", () => {
  assert.deepEqual(normalizeAudioTrim("30-90"), { start: 30, end: 90, duration: 60 });
  assert.equal(normalizeAudioTrim(""), null);
  assert.throws(() => normalizeAudioTrim("90-30"), /greater than/);
  assert.throws(() => normalizeAudioTrim("hello"), /start-end seconds/);
});

test("assetDisplayName keeps readable Unicode names", () => {
  assert.equal(assetDisplayName("Lagu_Baru-Final.mp3"), "Lagu Baru Final");
  assert.equal(assetDisplayName("音乐_akhir.ogg"), "音乐 akhir");
  assert.equal(assetDisplayName("---.wav"), "Audio");
  assert.equal(assetDisplayName("Mix v1.2", { stripExtension: false }), "Mix v1.2");
});

test("converted output is verified as Roblox-compatible OGG", async () => {
  const workDir = await mkdtemp(join(tmpdir(), "audio-test-"));
  const input = join(workDir, "input.wav");
  const output = join(workDir, "output.ogg");
  try {
    await execFileAsync(ffmpegPath, [
      "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=0.25",
      "-ar", "44100", "-ac", "1", input
    ]);
    await convertAudio(ffmpegPath, input, output, { quality: "high", normalize: true, speed: 2, trim: "0.05-0.20" });
    const info = await inspectConvertedAudio(ffprobeStatic.path, output);
    assert.equal(info.codec, "vorbis");
    assert.equal(info.sampleRate, 48000);
    assert.equal(info.channels, 2);
    assert.ok(info.size > 0);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
});

test("audio health check reports technical measurements and a bounded score", async () => {
  const directory = await mkdtemp(join(tmpdir(), "audio-health-test-"));
  const input = join(directory, "healthy.wav");
  try {
    await execFileAsync(ffmpegPath, [
      "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=0.2",
      "-ar", "44100", "-ac", "2", input
    ]);
    const report = await analyzeAudioHealth(ffmpegPath, ffprobeStatic.path, input);
    assert.equal(report.codec, "pcm_s16le");
    assert.equal(report.sampleRate, 44100);
    assert.equal(report.channels, 2);
    assert.ok(report.score >= 0 && report.score <= 100);
    assert.ok(Number.isFinite(report.meanVolume));
    assert.ok(Number.isFinite(report.maxVolume));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("waveform generator creates a valid PNG preview", async () => {
  const directory = await mkdtemp(join(tmpdir(), "waveform-test-"));
  const input = join(directory, "input.wav");
  const output = join(directory, "waveform.png");
  try {
    await execFileAsync(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=220:duration=0.2", input]);
    await generateWaveform(ffmpegPath, input, output);
    const { readFile } = await import("node:fs/promises");
    const png = await readFile(output);
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
