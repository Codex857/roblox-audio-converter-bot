import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { UploadHistoryStore } from "../src/upload-history-store.js";

test("upload history is isolated per server and bounded", async () => {
  const directory = await mkdtemp(join(tmpdir(), "upload-history-"));
  try {
    const store = await new UploadHistoryStore({ directory, maxPerGuild: 2 }).init();
    const base = { userId: "111111111111111111", source: "file", moderationState: "MODERATION_STATE_APPROVED" };
    await store.add("222222222222222222", { ...base, id: "1", name: "First", assetId: "101" });
    await store.add("222222222222222222", { ...base, id: "2", name: "Second", assetId: "102" });
    await store.add("222222222222222222", { ...base, id: "3", name: "Third", assetId: "103" });
    assert.deepEqual((await store.list("222222222222222222")).map((item) => item.name), ["Third", "Second"]);
    assert.deepEqual(await store.list("333333333333333333"), []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
