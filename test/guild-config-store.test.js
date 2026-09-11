import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  GuildConfigStore,
  canUseConfiguredUploadRoles,
  normalizeCreatorConfig,
  normalizeRobloxApiKey,
  normalizeUploadRoleIds
} from "../src/guild-config-store.js";

const GUILD_ID = "123456789012345678";
const OTHER_GUILD_ID = "987654321098765432";
const API_KEY = "roblox-open-cloud-api-key-secret-123";

test("creator config validates Roblox creator type and ID", () => {
  assert.deepEqual(normalizeCreatorConfig({ creatorType: "Group", creatorId: "123" }), {
    creatorType: "Group",
    creatorId: "123"
  });
  assert.deepEqual(normalizeCreatorConfig({ creatorType: "group", creatorId: "123" }), {
    creatorType: "Group",
    creatorId: "123"
  });
  assert.throws(() => normalizeCreatorConfig({ creatorType: "Game", creatorId: "123" }), /Group or User/);
  assert.throws(() => normalizeCreatorConfig({ creatorType: "Group", creatorId: "abc" }), /numbers only/);
});

test("API keys are normalized without accepting weak or malformed values", () => {
  assert.equal(normalizeRobloxApiKey(`  ${API_KEY}  `), API_KEY);
  assert.throws(() => normalizeRobloxApiKey("short"), /valid Roblox Open Cloud API key/);
  assert.throws(() => normalizeRobloxApiKey("roblox open cloud api key with spaces"), /spaces or line breaks/);
});

test("configured upload roles default to everyone and allow admins", () => {
  assert.deepEqual(normalizeUploadRoleIds(["123456789012345678", "123456789012345678"]), ["123456789012345678"]);
  assert.equal(canUseConfiguredUploadRoles({ uploadRoleIds: [] }, [], false), true);
  assert.equal(canUseConfiguredUploadRoles({ uploadRoleIds: ["123456789012345678"] }, ["123456789012345678"], false), true);
  assert.equal(canUseConfiguredUploadRoles({ uploadRoleIds: ["123456789012345678"] }, ["987654321098765432"], false), false);
  assert.equal(canUseConfiguredUploadRoles({ uploadRoleIds: ["123456789012345678"] }, [], true), true);
});

test("guild config store saves, reloads and deletes server creator config", async () => {
  const dir = await mkdtemp(join(tmpdir(), "guild-config-test-"));
  try {
    const store = await new GuildConfigStore({ directory: dir, secret: "server-secret" }).init();
    await store.set(GUILD_ID, {
      creatorType: "Group",
      creatorId: "987",
      apiKey: API_KEY,
      updatedBy: "111"
    });
    assert.equal(store.get(GUILD_ID).creatorId, "987");
    assert.equal(store.get(GUILD_ID).apiKeyConfigured, true);
    assert.equal(store.get(GUILD_ID).apiKey, undefined);
    assert.match(store.get(GUILD_ID).apiKeyFingerprint, /^[a-f0-9]{8}$/);
    assert.equal(store.getUploadConfig(GUILD_ID).apiKey, API_KEY);
    await store.setUploadRoles(GUILD_ID, ["222222222222222222"], "111");
    assert.deepEqual(store.get(GUILD_ID).uploadRoleIds, ["222222222222222222"]);
    const raw = await readFile(join(dir, `${GUILD_ID}.json`), "utf8");
    assert.doesNotMatch(raw, new RegExp(API_KEY));

    const reloaded = await new GuildConfigStore({ directory: dir, secret: "server-secret" }).init();
    assert.equal(reloaded.get(GUILD_ID).creatorType, "Group");
    assert.equal(reloaded.getUploadConfig(GUILD_ID).apiKey, API_KEY);
    assert.equal(reloaded.size, 1);

    await reloaded.delete(GUILD_ID);
    assert.equal(reloaded.get(GUILD_ID), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("encrypted credentials are bound to one Discord server", async () => {
  const dir = await mkdtemp(join(tmpdir(), "guild-boundary-test-"));
  try {
    const store = await new GuildConfigStore({ directory: dir, secret: "server-secret" }).init();
    await store.set(GUILD_ID, { creatorType: "Group", creatorId: "987", apiKey: API_KEY });
    assert.equal(store.getUploadConfig(OTHER_GUILD_ID), null);

    const source = await readFile(join(dir, `${GUILD_ID}.json`), "utf8");
    const { writeFile } = await import("node:fs/promises");
    await writeFile(join(dir, `${OTHER_GUILD_ID}.json`), source);
    const reloaded = await new GuildConfigStore({ directory: dir, secret: "server-secret" }).init();
    assert.equal(reloaded.getUploadConfig(OTHER_GUILD_ID), null);
    assert.equal(reloaded.corruptFiles, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
