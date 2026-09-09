import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GuildConfigStore, normalizeCreatorConfig } from "../src/guild-config-store.js";

const GUILD_ID = "123456789012345678";

test("creator config validates Roblox creator type and ID", () => {
  assert.deepEqual(normalizeCreatorConfig({ creatorType: "Group", creatorId: "123" }), {
    creatorType: "Group",
    creatorId: "123"
  });
  assert.deepEqual(normalizeCreatorConfig({ creatorType: "group", creatorId: "123" }), {
    creatorType: "Group",
    creatorId: "123"
  });
  assert.throws(() => normalizeCreatorConfig({ creatorType: "Game", creatorId: "123" }), /Group atau User/);
  assert.throws(() => normalizeCreatorConfig({ creatorType: "Group", creatorId: "abc" }), /nombor ID/);
});

test("guild config store saves, reloads and deletes server creator config", async () => {
  const dir = await mkdtemp(join(tmpdir(), "guild-config-test-"));
  try {
    const store = await new GuildConfigStore({ directory: dir, secret: "server-secret" }).init();
    await store.set(GUILD_ID, {
      creatorType: "Group",
      creatorId: "987",
      apiKey: "roblox-api-key-secret",
      updatedBy: "111"
    });
    assert.equal(store.get(GUILD_ID).creatorId, "987");
    assert.equal(store.get(GUILD_ID).apiKeyConfigured, true);
    assert.equal(store.get(GUILD_ID).apiKey, undefined);
    assert.equal(store.getUploadConfig(GUILD_ID).apiKey, "roblox-api-key-secret");
    const raw = await readFile(join(dir, `${GUILD_ID}.json`), "utf8");
    assert.doesNotMatch(raw, /roblox-api-key-secret/);

    const reloaded = await new GuildConfigStore({ directory: dir, secret: "server-secret" }).init();
    assert.equal(reloaded.get(GUILD_ID).creatorType, "Group");
    assert.equal(reloaded.getUploadConfig(GUILD_ID).apiKey, "roblox-api-key-secret");
    assert.equal(reloaded.size, 1);

    await reloaded.delete(GUILD_ID);
    assert.equal(reloaded.get(GUILD_ID), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
