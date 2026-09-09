import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { downloadDirectAudio, normalizeDirectAudioUrl } from "../src/direct-audio.js";

const publicLookup = async () => [{ address: "8.8.8.8", family: 4 }];

test("direct audio links support approved public file services", () => {
  assert.equal(
    normalizeDirectAudioUrl("https://cdn.discordapp.com/attachments/1/2/song.mp3"),
    "https://cdn.discordapp.com/attachments/1/2/song.mp3"
  );

  const dropbox = new URL(normalizeDirectAudioUrl(
    "https://www.dropbox.com/scl/fi/abc123/song.wav?rlkey=secret&dl=0"
  ));
  assert.equal(dropbox.searchParams.get("raw"), "1");
  assert.equal(dropbox.searchParams.get("dl"), null);
  assert.equal(dropbox.searchParams.get("rlkey"), "secret");

  const drive = new URL(normalizeDirectAudioUrl(
    "https://drive.google.com/file/d/1AbCdEfGhIjKlMn/view?usp=sharing"
  ));
  assert.equal(drive.hostname, "drive.usercontent.google.com");
  assert.equal(drive.searchParams.get("id"), "1AbCdEfGhIjKlMn");

  assert.equal(
    normalizeDirectAudioUrl("https://bucket.example.r2.dev/music/track.ogg"),
    "https://bucket.example.r2.dev/music/track.ogg"
  );
  assert.equal(
    normalizeDirectAudioUrl("https://bucket.s3.ap-southeast-1.amazonaws.com/music/track.m4a"),
    "https://bucket.s3.ap-southeast-1.amazonaws.com/music/track.m4a"
  );
});

test("direct audio link validation blocks unsafe or unsupported targets", () => {
  assert.throws(() => normalizeDirectAudioUrl("http://cdn.discordapp.com/song.mp3"), /HTTPS/);
  assert.throws(() => normalizeDirectAudioUrl("https://user:pass@cdn.discordapp.com/song.mp3"), /HTTPS/);
  assert.throws(() => normalizeDirectAudioUrl("https://cdn.discordapp.com:444/song.mp3"), /HTTPS/);
  assert.throws(() => normalizeDirectAudioUrl("https://127.0.0.1/song.mp3"), /Internal hosts|IP/);
  assert.throws(() => normalizeDirectAudioUrl("https://localhost/song.mp3"), /Internal hosts|IP/);
  assert.throws(() => normalizeDirectAudioUrl("https://youtu.be/dQw4w9WgXcQ"), /Unsupported link host/);
  assert.throws(() => normalizeDirectAudioUrl("https://example.com/song.mp3"), /Unsupported link host/);
  assert.throws(() => normalizeDirectAudioUrl("https://cdn.discordapp.com/file.exe"), /MP3/);
});

test("direct audio downloader follows only safe redirects and stores valid audio", async () => {
  const directory = await mkdtemp(join(tmpdir(), "direct-audio-test-"));
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url.toString());
    if (url.hostname === "www.dropbox.com") {
      return new Response(null, {
        status: 302,
        headers: { location: "https://dl.dropboxusercontent.com/scl/fi/abc123/song.mp3" }
      });
    }
    return new Response(new Uint8Array([1, 2, 3, 4]), {
      status: 200,
      headers: {
        "content-type": "audio/mpeg",
        "content-length": "4",
        "content-disposition": "attachment; filename*=UTF-8''My%20Song.mp3"
      }
    });
  };

  try {
    const result = await downloadDirectAudio({
      url: "https://www.dropbox.com/scl/fi/abc123/song.mp3?dl=0",
      directory,
      fetchImpl,
      lookupImpl: publicLookup
    });
    assert.equal(result.name, "My Song.mp3");
    assert.equal(result.size, 4);
    assert.equal(result.host, "dl.dropboxusercontent.com");
    assert.deepEqual([...await readFile(result.path)], [1, 2, 3, 4]);
    assert.equal(calls.length, 2);
    assert.match(calls[0], /raw=1/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("direct audio downloader rejects unsafe redirects, private DNS and web pages", async () => {
  const directory = await mkdtemp(join(tmpdir(), "direct-audio-reject-test-"));
  try {
    await assert.rejects(
      downloadDirectAudio({
        url: "https://cdn.discordapp.com/song.mp3",
        directory,
        lookupImpl: publicLookup,
        fetchImpl: async () => new Response(null, {
          status: 302,
          headers: { location: "https://evil.example/song.mp3" }
        })
      }),
      /Unsupported link host/
    );

    await assert.rejects(
      downloadDirectAudio({
        url: "https://cdn.discordapp.com/song.mp3",
        directory,
        lookupImpl: async () => [{ address: "127.0.0.1", family: 4 }],
        fetchImpl: async () => { throw new Error("fetch must not run"); }
      }),
      /internal network/
    );

    await assert.rejects(
      downloadDirectAudio({
        url: "https://cdn.discordapp.com/song.mp3",
        directory,
        lookupImpl: publicLookup,
        fetchImpl: async () => new Response("<html>login</html>", {
          status: 200,
          headers: { "content-type": "text/html" }
        })
      }),
      /web page/
    );

    await assert.rejects(
      downloadDirectAudio({
        url: "https://cdn.discordapp.com/song.mp3",
        directory,
        lookupImpl: publicLookup,
        fetchImpl: async () => new Response(new Uint8Array([1]), {
          status: 200,
          headers: { "content-type": "audio/mpeg", "content-length": String(26 * 1024 * 1024) }
        })
      }),
      /25 MB/
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
