import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LinkLibrary, libraryTitle } from "../src/link-library.js";
import { normalizeAudioTrim } from "../src/audio.js";

test("normalized trim survives the library upload pipeline", () => {
  assert.deepEqual(normalizeAudioTrim(normalizeAudioTrim("10-20")), { start: 10, end: 20, duration: 10 });
  assert.throws(() => normalizeAudioTrim({ start: -1, end: 3 }));
  assert.throws(() => normalizeAudioTrim({ start: 0, end: Infinity }));
});

test("library keeps original titles across restart and supports legacy metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "library-test-"));
  try {
    const url = "https://youtu.be/dQw4w9WgXcQ";
    await new LinkLibrary(root).add("123", url, path => writeFile(path, "audio"), { title: "Lagu Saya.wav" });
    const store = new LinkLibrary(root);
    const destination = join(root, "copy");
    assert.equal((await store.copy("123", url, destination, { withTitle: true })).title, "Lagu Saya");
    const metadata = join(root, "123", "dQw4w9WgXcQ", "metadata.json");
    await writeFile(metadata, "broken JSON");
    assert.equal((await store.copy("123", url, destination, { withTitle: true })).title, "Library dQw4w9WgXcQ");
    await rm(metadata);
    assert.equal((await store.copy("123", url, destination, { withTitle: true })).title, "Library dQw4w9WgXcQ");
    assert.equal(await store.copy("456", url, destination, { withTitle: true }), false);
    assert.equal(libraryTitle("../../Lagu\u0000.mp3", "fallback"), "Lagu");
    assert.equal(libraryTitle(null, "fallback"), "fallback");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("library enforces capacity and excludes concurrent writes", async () => {
  const root = await mkdtemp(join(tmpdir(), "library-test-"));
  try {
    const store = new LinkLibrary(root);
    for (let i = 0; i < 20; i++) await store.add("123", `https://youtu.be/${String(i).padStart(11, "0")}`, path => writeFile(path, "audio"));
    await assert.rejects(store.add("123", "https://youtu.be/dQw4w9WgXcQ", () => {}), /full/);
    let release;
    const pending = store.locked("456", () => new Promise(resolve => { release = resolve; }));
    await assert.rejects(store.locked("456", async () => {}), /busy/);
    release(); await pending;
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("library persists, isolates servers, copies and deletes originals", async () => {
  const root = await mkdtemp(join(tmpdir(), "library-test-"));
  try {
    const store = new LinkLibrary(root);
    const url = "https://youtu.be/dQw4w9WgXcQ";
    await store.add("123", url, path => writeFile(path, "audio"));
    assert.deepEqual(await new LinkLibrary(root).list("123"), ["dQw4w9WgXcQ"]);
    assert.equal(await store.copy("456", url, join(root, "copy")), false);
    assert.equal(await store.copy("123", url, join(root, "copy")), true);
    assert.equal(await readFile(join(root, "copy"), "utf8"), "audio");
    await assert.rejects(store.add("123", url, () => {}), /already saved/);
    await store.remove("123", url);
    assert.deepEqual(await store.list("123"), []);
    assert.throws(() => store.location("../escape", url), /server/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("failed and empty saves leave no staged files", async () => {
  const root = await mkdtemp(join(tmpdir(), "library-test-"));
  try {
    const store = new LinkLibrary(root);
    const url = "https://youtu.be/dQw4w9WgXcQ";
    await assert.rejects(store.add("123", url, async path => { await writeFile(path, "partial"); throw new Error("download failed"); }));
    await assert.rejects(store.add("123", url, path => writeFile(path, "")), /nonempty/);
    assert.deepEqual(await readdir(join(root, "123")), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});
