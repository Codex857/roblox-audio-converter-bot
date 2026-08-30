import test from "node:test";
import assert from "node:assert/strict";
import { canUseRobloxUpload, createRobloxUploader } from "../src/roblox.js";

test("Roblox uploader stays disabled without all credentials", () => {
  assert.equal(createRobloxUploader({}).configured, false);
  assert.equal(createRobloxUploader({ apiKey: "secret", creatorType: "Group", creatorId: "123" }).configured, true);
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
  assert.equal(canUseRobloxUpload(base, { userIds: "user-1" }), true);
});
