import test from "node:test";
import assert from "node:assert/strict";
import { createMusicGenerator, normalizeMusicRequest } from "../src/music-generation.js";

test("music request builds a safe Roblox soundtrack prompt", () => {
  const request = normalizeMusicRequest({ prompt: "Dark futuristic racing music", genre: "synthwave", duration: 60, bpm: 128, seamlessLoop: true });
  assert.equal(request.duration, 60);
  assert.match(request.modelPrompt, /128 BPM/);
  assert.match(request.modelPrompt, /Instrumental only/);
  assert.match(request.modelPrompt, /seamless loop/);
  assert.throws(() => normalizeMusicRequest({ prompt: "short" }), /at least 10/);
});

test("music generator parses Lyria audio without exposing its API key", async () => {
  let headers;
  const generator = createMusicGenerator({
    apiKey: "test-secret-key",
    fetchImpl: async (_url, options) => {
      headers = options.headers;
      return new Response(JSON.stringify({ steps: [{ type: "model_output", content: [
        { type: "text", text: "Generated lyrics" },
        { type: "audio", mime_type: "audio/mpeg", data: Buffer.from("music").toString("base64") }
      ] }] }), { status: 200 });
    }
  });
  const result = await generator.generate({ prompt: "Bright original obby soundtrack" });
  assert.equal(result.audio.toString(), "music");
  assert.equal(result.lyrics, "Generated lyrics");
  assert.equal(headers["x-goog-api-key"], "test-secret-key");
});

test("music generator stays safely disabled without configuration", async () => {
  const generator = createMusicGenerator();
  assert.equal(generator.configured, false);
  await assert.rejects(() => generator.generate({ prompt: "Original game soundtrack" }), /GEMINI_API_KEY/);
});
