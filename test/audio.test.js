import test from "node:test";
import assert from "node:assert/strict";
import { bitrateForQuality, safeBaseName, validateAttachment } from "../src/audio.js";

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
  }), /Format input tidak disokong/);
});

test("bitrateForQuality maps supported presets", () => {
  assert.equal(bitrateForQuality("compact"), "128k");
  assert.equal(bitrateForQuality("standard"), "160k");
  assert.equal(bitrateForQuality("high"), "192k");
  assert.throws(() => bitrateForQuality("extreme"), /kualiti tidak sah/);
});
