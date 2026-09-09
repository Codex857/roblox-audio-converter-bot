import test from "node:test";
import assert from "node:assert/strict";
import { friendlyYouTubeError, normalizeYouTubeUrl } from "../src/youtube.js";

test("YouTube links normalize to one canonical public video URL", () => {
  const expected = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
  assert.equal(normalizeYouTubeUrl("https://youtu.be/dQw4w9WgXcQ?t=30"), expected);
  assert.equal(normalizeYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=abc"), expected);
  assert.equal(normalizeYouTubeUrl("https://youtube.com/shorts/dQw4w9WgXcQ"), expected);
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
