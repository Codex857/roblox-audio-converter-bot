import test from "node:test";
import assert from "node:assert/strict";
import { friendlyYouTubeError, normalizeYouTubeUrl, classifyYouTubeError, createYouTubeGuard, YouTubeError } from "../src/youtube.js";

test("YouTube links normalize to one canonical public video URL", () => {
  const expected = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
  assert.equal(normalizeYouTubeUrl("https://youtu.be/dQw4w9WgXcQ?t=30"), expected);
  assert.equal(normalizeYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=abc"), expected);
  assert.equal(normalizeYouTubeUrl("https://youtube.com/shorts/dQw4w9WgXcQ"), expected);
});

test("YouTube errors distinguish restrictions and redact upstream details", () => {
  const cases = [
    ["Sign in to confirm you're not a bot. Use --cookies", "BOT_BLOCK"],
    ["Sign in to confirm your age. Use --cookies", "AGE_RESTRICTED"],
    ["Private video. Sign in. Use --cookies", "UNAVAILABLE"],
    ["HTTP Error 429: Too Many Requests", "RATE_LIMIT"],
    ["This content isn't available, try again later", "RATE_LIMIT"],
    ["HTTP Error 403: Forbidden", "ACCESS_DENIED"],
    ["Login required", "LOGIN_REQUIRED"],
    ["Connection timed out", "TIMEOUT"],
    ["copyright protected", "PROTECTED"],
    ["max-filesize exceeded", "TOO_LARGE"],
    ["secret token abc123", "DOWNLOAD_FAILED"]
  ];
  for (const [stderr, code] of cases) {
    assert.equal(classifyYouTubeError({ stderr }).code, code);
    assert.doesNotMatch(friendlyYouTubeError({ stderr }), /abc123|--cookies/);
  }
  assert.equal(classifyYouTubeError({ killed: true }).code, "TIMEOUT");
  assert.equal(classifyYouTubeError({ code: "ENOENT" }).code, "TOOL_MISSING");
});

test("YouTube guard blocks repeat calls and allows recovery after cooldown", async () => {
  let clock = 0;
  let calls = 0;
  const guard = createYouTubeGuard({ now: () => clock });
  await assert.rejects(guard.run(async () => {
    calls++;
    throw new YouTubeError("RATE_LIMIT", "limited");
  }), { code: "RATE_LIMIT" });
  assert.equal(guard.status().cooldownSeconds, 900);
  await assert.rejects(guard.run(async () => calls++), { code: "COOLDOWN" });
  assert.equal(calls, 1);
  clock = 900_000;
  assert.equal(await guard.run(async () => "ok"), "ok");
  assert.equal(guard.status().lastErrorCode, null);
});

test("YouTube guard uses short pauses for non-bot errors and spaces successes", async () => {
  for (const [code, seconds] of [["BOT_BLOCK", 900], ["ACCESS_DENIED", 60], ["AGE_RESTRICTED", 10], ["TIMEOUT", 10]]) {
    const guard = createYouTubeGuard({ now: () => 0 });
    await assert.rejects(guard.run(async () => { throw new YouTubeError(code, "safe"); }));
    assert.equal(guard.status().cooldownSeconds, seconds);
  }
  const guard = createYouTubeGuard({ now: () => 0 });
  await guard.run(async () => true);
  await assert.rejects(guard.run(async () => true), { code: "COOLDOWN" });
});

test("YouTube validation rejects playlists, redirects and unrelated hosts", () => {
  assert.throws(() => normalizeYouTubeUrl("https://youtube.com/playlist?list=abc"), /one YouTube video/);
  assert.throws(() => normalizeYouTubeUrl("https://youtube.com/redirect?q=https://example.com"), /one YouTube video/);
  assert.throws(() => normalizeYouTubeUrl("https://example.com/watch?v=dQw4w9WgXcQ"), /one YouTube video/);
  assert.throws(() => normalizeYouTubeUrl("http://youtu.be/dQw4w9WgXcQ"), /HTTPS/);
});

test("YouTube downloader errors are safe and useful", () => {
  assert.match(friendlyYouTubeError({ stderr: "Sign in to confirm you're not a bot" }), /cloud server/);
  assert.match(friendlyYouTubeError({ stderr: "Private video" }), /public/);
  assert.doesNotMatch(friendlyYouTubeError({ stderr: "secret internal detail" }), /secret internal detail/);
});

test("debug numbers and video IDs cannot masquerade as HTTP status codes", () => {
  assert.equal(classifyYouTubeError({ stderr: "[debug] build abc429def403\nERROR: Sign in to confirm you're not a bot" }).code, "BOT_BLOCK");
  assert.equal(classifyYouTubeError({ stderr: "ERROR: [youtube] abc429defgh: extraction failed" }).code, "DOWNLOAD_FAILED");
  assert.equal(classifyYouTubeError({ stderr: "HTTP status code: 403" }).code, "ACCESS_DENIED");
  assert.equal(classifyYouTubeError({ stderr: "Video unavailable. Not available in your country" }).code, "REGION_RESTRICTED");
  assert.equal(classifyYouTubeError({ stderr: "ffmpeg not found. Please install" }).code, "FFMPEG_MISSING");
});

test("guard prevents overlapping downloads even after the spacing interval", async () => {
  let clock = 0;
  let finish;
  const guard = createYouTubeGuard({ now: () => clock });
  const first = guard.run(() => new Promise(resolve => { finish = resolve; }));
  clock = 20_000;
  await assert.rejects(guard.run(async () => true), { code: "BUSY" });
  finish("done");
  assert.equal(await first, "done");
  assert.equal(await guard.run(async () => "next"), "next");
});

test("guard releases active slot after a rejected download", async () => {
  let clock = 0;
  const guard = createYouTubeGuard({ now: () => clock });
  await assert.rejects(guard.run(async () => { throw new Error("failure"); }));
  clock = 10_000;
  assert.equal(await guard.run(async () => true), true);
});
