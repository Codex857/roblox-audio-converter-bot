import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, readdir, rm, writeFile, truncate } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "../src/server.js";
import { createYouTubeApi } from "../src/youtube-api.js";
import { YouTubeError } from "../src/youtube.js";

const key = "test-only-".repeat(4);
const payload = { url: "https://youtu.be/dQw4w9WgXcQ", rights_confirm: true };
async function fixture(t, download, apiKey = key) {
  const root = await mkdtemp(join(tmpdir(), "api-test-"));
  const server = startServer({ port: 0, getStatus: () => ({}),
    handleYouTubeApi: createYouTubeApi({ apiKey, download, tempRoot: root }) });
  await once(server, "listening");
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(root, { recursive: true, force: true }); });
  const url = `http://127.0.0.1:${server.address().port}/api/youtube/mp3`;
  const request = (body = payload, auth = key) => fetch(url, { method: "POST",
    headers: { authorization: `Bearer ${auth}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  return { request, root, url };
}
async function cleaned(root) {
  for (let i = 0; i < 30; i++) {
    if ((await readdir(root)).length === 0) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.deepEqual(await readdir(root), []);
}
test("MP3 API requires explicit configuration and strong key", async t => {
  assert.throws(() => createYouTubeApi({ apiKey: "short" }), /32/);
  const f = await fixture(t, () => assert.fail("must not download"), "");
  assert.equal((await f.request()).status, 404);
});
test("MP3 API rejects unauthorized requests before downloading", async t => {
  const f = await fixture(t, () => assert.fail("must not download"));
  assert.equal((await f.request(payload, "wrong")).status, 401);
});
test("MP3 API streams output and cleans temporary files", async t => {
  const f = await fixture(t, async ({ url, outputPath }) => {
    assert.equal(url, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    await writeFile(outputPath, "fixture-audio");
    return { path: outputPath };
  });
  const response = await f.request();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "audio/mpeg");
  assert.equal(await response.text(), "fixture-audio");
  await cleaned(f.root);
  assert.equal((await f.request()).status, 429);
});
test("MP3 API cleans failures and reports upstream block without secrets", async t => {
  const f = await fixture(t, async ({ outputPath }) => {
    await writeFile(outputPath, "partial");
    throw new YouTubeError("BOT_BLOCK", "YouTube blocked the request.");
  });
  const response = await f.request();
  assert.equal(response.status, 422);
  assert.equal((await response.json()).error.code, "BOT_BLOCK");
  await cleaned(f.root);
});
test("MP3 API hides unexpected internal exceptions", async t => {
  const f = await fixture(t, async () => { throw new Error("secret-token-and-path"); });
  const response = await f.request();
  assert.equal(response.status, 502);
  assert.doesNotMatch(await response.text(), /secret-token/);
  await cleaned(f.root);
});
for (const body of [{ ...payload, rights_confirm: false }, { ...payload, url: "http://127.0.0.1/" }, null]) {
  test(`MP3 API rejects invalid input ${JSON.stringify(body)}`, async t => {
    const f = await fixture(t, () => assert.fail("must not download"));
    assert.equal((await f.request(body)).status, 400);
  });
}
test("MP3 API prevents overlapping conversions", async t => {
  let release;
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  const f = await fixture(t, async () => {
    started();
    await new Promise(resolve => { release = resolve; });
    throw new Error("fixture failure");
  });
  const first = f.request();
  await ready;
  try { assert.equal((await f.request()).status, 429); }
  finally { release(); }
  await first;
  await cleaned(f.root);
});

test("MP3 API rejects oversized output and cleans it", async t => {
  const f = await fixture(t, async ({ outputPath }) => {
    await writeFile(outputPath, "");
    await truncate(outputPath, 25 * 1024 * 1024 + 1);
    return { path: outputPath };
  });
  assert.equal((await f.request()).status, 413);
  await cleaned(f.root);
});

for (const [body, expected] of [["{", 400], ["x".repeat(5000), 413]]) {
  test(`MP3 API validates JSON body with status ${expected}`, async t => {
    const f = await fixture(t, () => assert.fail("must not download"));
    const response = await fetch(f.url, { method: "POST", headers: {
      authorization: `Bearer ${key}`, "content-type": "application/json"
    }, body });
    assert.equal(response.status, expected);
    assert.equal((await response.json()).success, false);
  });
}

test("MP3 API enforces method and content type", async t => {
  const f = await fixture(t, () => assert.fail("must not download"));
  const headers = { authorization: `Bearer ${key}` };
  assert.equal((await fetch(f.url, { headers })).status, 405);
  assert.equal((await fetch(f.url, { method: "POST", headers, body: "text" })).status, 415);
});
