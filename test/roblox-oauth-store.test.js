import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RobloxOAuthProfileStore } from "../src/roblox-oauth-store.js";

const DISCORD_ID = "123456789012345678";

function profile(overrides = {}) {
  return {
    robloxUserId: "987654321",
    username: "Builder",
    accessToken: "access-token-secret",
    refreshToken: "refresh-token-secret",
    expiresAt: Date.now() + 600_000,
    ...overrides
  };
}

test("OAuth profile store encrypts profiles on disk and reloads them", async () => {
  const dir = await mkdtemp(join(tmpdir(), "oauth-store-test-"));
  try {
    const store = await new RobloxOAuthProfileStore({ directory: dir, secret: "secret-one" }).init();
    await store.set(DISCORD_ID, profile());
    const raw = await readFile(join(dir, `${DISCORD_ID}.json`), "utf8");
    assert.doesNotMatch(raw, /access-token-secret/);
    assert.doesNotMatch(raw, /refresh-token-secret/);

    const reloaded = await new RobloxOAuthProfileStore({ directory: dir, secret: "secret-one" }).init();
    assert.equal(reloaded.get(DISCORD_ID).robloxUserId, "987654321");
    assert.equal(reloaded.findDiscordIdByRobloxUserId("987654321"), DISCORD_ID);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("OAuth profile store delete removes the saved profile", async () => {
  const dir = await mkdtemp(join(tmpdir(), "oauth-store-test-"));
  try {
    const store = await new RobloxOAuthProfileStore({ directory: dir, secret: "secret-one" }).init();
    await store.set(DISCORD_ID, profile());
    await store.delete(DISCORD_ID);
    assert.equal(store.get(DISCORD_ID), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
