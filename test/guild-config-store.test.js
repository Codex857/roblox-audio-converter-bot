import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GuildConfigStore, normalizeCreatorConfig } from "../src/guild-config-store.js";

const GUILD_ID = "123456789012345678";

test("creator config validates Roblox creator type and ID", () => {
  assert.deepEqual(normalizeCreatorConfig({ creatorType: "Group", creatorId: "123" }), {
    creatorType: "Group",
    creatorId: "123"
  });
  assert.throws(() => normalizeCreatorConfig({ creatorType: "Game", creatorId: "123" }), /creator_type/);
  assert.throws(() => normalizeCreatorConfig({ creatorType: "Group", creatorId: "abc" }), /creator_id/);
});

test("guild config store saves, reloads and deletes server creator config", async () => {
  const dir = await mkdtemp(join(tmpdir(), "guild-config-test-"));
  try {
    const store = await new GuildConfigStore({ directory: dir }).init();
    await store.set(GUILD_ID, { creatorType: "Group", creatorId: "987", updatedBy: "111" });
    assert.equal(store.get(GUILD_ID).creatorId, "987");

    const reloaded = await new GuildConfigStore({ directory: dir }).init();
    assert.equal(reloaded.get(GUILD_ID).creatorType, "Group");
    assert.equal(reloaded.size, 1);

    await reloaded.delete(GUILD_ID);
    assert.equal(reloaded.get(GUILD_ID), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
