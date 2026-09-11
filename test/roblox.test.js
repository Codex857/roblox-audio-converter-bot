import test from "node:test";
import assert from "node:assert/strict";
import {
  assetIdFromOperation,
  canUseRobloxUpload,
  createRobloxUploader,
  normalizeOperationPath,
  robloxApiError,
  validateRobloxCreator
} from "../src/roblox.js";

test("Roblox uploader stays disabled without all credentials", () => {
  assert.equal(createRobloxUploader({}).configured, false);
  assert.equal(createRobloxUploader({ apiKey: "secret", creatorType: "Group", creatorId: "123" }).configured, true);
  assert.equal(createRobloxUploader({ accessTokenProvider: () => "token", creatorType: "User", creatorId: "123" }).configured, true);
  assert.equal(createRobloxUploader({ apiKey: "secret", creatorType: "Invalid", creatorId: "123" }).configured, false);
});

test("direct upload access is restricted by guild and role", () => {
  const base = { user: { id: "user-1" }, guildId: "guild-1" };
  assert.equal(canUseRobloxUpload(base, { guildId: "guild-1" }), true);
  assert.equal(canUseRobloxUpload(base, { guildId: "guild-2" }), false);
  assert.equal(canUseRobloxUpload({ ...base, member: { roles: ["role-1"] } }, {
    guildId: "guild-1", roleId: "role-1"
  }), true);
  assert.equal(canUseRobloxUpload(base, { guildId: "guild-1", roleId: "role-1" }), false);
  assert.equal(canUseRobloxUpload(base, { guildId: "guild-1", roleId: "guild-1" }), true);
  assert.equal(canUseRobloxUpload(base, { userIds: "user-1" }), true);
});

test("direct upload supports multiple allowlisted guilds and roles", () => {
  const first = { user: { id: "user-1" }, guildId: "guild-1" };
  const second = { user: { id: "user-2" }, guildId: "guild-2" };
  const third = { user: { id: "user-3" }, guildId: "guild-3" };

  assert.equal(canUseRobloxUpload(second, {
    guildId: "guild-1",
    guildIds: "guild-2, guild-3",
    roleId: "guild-1"
  }), true);
  assert.equal(canUseRobloxUpload(third, {
    guildIds: "guild-1,guild-2",
    roleIds: "*"
  }), false);
  assert.equal(canUseRobloxUpload({ ...second, member: { roles: ["role-2"] } }, {
    guildIds: "guild-1,guild-2",
    roleIds: "role-1,role-2"
  }), true);
  assert.equal(canUseRobloxUpload(first, {
    guildIds: "guild-1,guild-2",
    roleIds: "role-1,role-2"
  }), false);
});

test("operation paths and asset IDs accept supported Roblox response shapes", () => {
  assert.equal(normalizeOperationPath("operations/abc"), "operations/abc");
  assert.equal(normalizeOperationPath("assets/v1/operations/abc"), "operations/abc");
  assert.equal(
    normalizeOperationPath("https://apis.roblox.com/assets/v1/operations/abc"),
    "operations/abc"
  );
  assert.equal(assetIdFromOperation({ response: { assetId: "123" } }), "123");
  assert.equal(assetIdFromOperation({ response: { asset: { assetId: "456" } } }), "456");
});

test("Roblox API failures use useful messages", () => {
  assert.match(robloxApiError(413), /too large/);
  assert.match(robloxApiError(429, { error: { message: "quota reached" } }), /quota reached/);
});

test("Roblox creator validation confirms the selected user or group", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return new Response(JSON.stringify({ name: "Eclipse Creator" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  assert.deepEqual(await validateRobloxCreator({ creatorType: "Group", creatorId: "526037126", fetchImpl }), {
    creatorType: "Group",
    creatorId: "526037126",
    name: "Eclipse Creator"
  });
  assert.equal(calls[0], "https://groups.roblox.com/v1/groups/526037126");
});

test("Roblox creator validation rejects missing creator IDs", async () => {
  await assert.rejects(
    validateRobloxCreator({
      creatorType: "User",
      creatorId: "404",
      fetchImpl: async () => new Response("{}", { status: 404 })
    }),
    /does not exist/
  );
});

test("asset polling retries a temporary Roblox failure", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) {
      return new Response(JSON.stringify({ message: "temporarily unavailable" }), {
        status: 503,
        headers: { "content-type": "application/json" }
      });
    }
    return new Response(JSON.stringify({ done: true, response: { assetId: "789" } }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  try {
    const uploader = createRobloxUploader({ apiKey: "secret", creatorType: "Group", creatorId: "123" });
    assert.equal(await uploader.waitForAsset("operations/test", { attempts: 2, intervalMs: 0 }), "789");
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("OAuth uploader uses a Bearer token for Roblox requests", async () => {
  const originalFetch = globalThis.fetch;
  let authHeader = "";
  globalThis.fetch = async (_url, options) => {
    authHeader = options.headers.authorization;
    return new Response(JSON.stringify({ done: true, response: { assetId: "321" } }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  try {
    const uploader = createRobloxUploader({
      accessTokenProvider: async () => "oauth-access",
      creatorType: "User",
      creatorId: "123"
    });
    assert.equal(await uploader.waitForAsset("operations/test", { attempts: 1, intervalMs: 0 }), "321");
    assert.equal(authHeader, "Bearer oauth-access");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
