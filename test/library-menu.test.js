import test from "node:test";
import assert from "node:assert/strict";
import { createLibraryMenuHandler, libraryButtons, libraryModal } from "../src/library-menu.js";

function fake(action, { allowed = true, guild = true, confirm = true, modal = false } = {}) {
  const replies = [];
  return { replies, customId: `library:${action}`, guildId: "123", inGuild: () => guild,
    memberPermissions: { has: () => allowed }, isButton: () => !modal, isModalSubmit: () => modal,
    reply: async value => replies.push(value), deferReply: async () => {}, editReply: async value => replies.push(value),
    showModal: async value => replies.push(value.toJSON()),
    fields: { getCheckbox: () => confirm, getTextInputValue: () => "https://youtu.be/dQw4w9WgXcQ", getUploadedFiles: () => new Map([["1", { name: "Original.mp3" }]]) }
  };
}

test("library UI has valid buttons and explicit unchecked confirmations", () => {
  assert.equal(libraryButtons()[0].toJSON().components.length, 3);
  const add = libraryModal("add").toJSON();
  assert.equal(add.components.length, 3);
  assert.equal(add.components[1].component.max_values, 1);
  assert.equal(add.components[2].component.default, false);
  assert.equal(libraryModal("delete").toJSON().components.length, 2);
});

test("permissions are enforced on both buttons and modal submissions", async () => {
  const handler = createLibraryMenuHandler({ store: {}, saveAudio: () => assert.fail("must not save") });
  for (const options of [{ allowed: false }, { guild: false }, { allowed: false, modal: true }]) {
    const interaction = fake("add-modal", options);
    assert.equal(await handler(interaction), true);
    assert.match(interaction.replies[0].content, /Manage Server/);
  }
});

test("add modal saves only after rights confirmation and reports no Roblox upload", async () => {
  let count = 0;
  const handler = createLibraryMenuHandler({ store: {}, saveAudio: async (guild, url, file) => {
    assert.equal(guild, "123"); assert.equal(file.name, "Original.mp3"); assert.match(url, /youtube.com/); count++;
  } });
  await handler(fake("add-modal", { modal: true, confirm: false }));
  assert.equal(count, 0);
  const interaction = fake("add-modal", { modal: true });
  await handler(interaction);
  assert.equal(count, 1);
  assert.match(interaction.replies[0].content, /not been uploaded to Roblox/);
});

test("delete requires confirmation and list is scoped to server", async () => {
  let removed = 0;
  const handler = createLibraryMenuHandler({ store: {
    remove: async guild => { assert.equal(guild, "123"); removed++; },
    list: async guild => { assert.equal(guild, "123"); return []; }
  } });
  await handler(fake("delete-modal", { modal: true, confirm: false }));
  assert.equal(removed, 0);
  await handler(fake("delete-modal", { modal: true }));
  assert.equal(removed, 1);
  const interaction = fake("list"); await handler(interaction);
  assert.match(interaction.replies[0].content, /empty/);
});

test("storage failures do not expose internal paths", async () => {
  const handler = createLibraryMenuHandler({ store: { list: async () => { throw Object.assign(new Error("/secret/path"), { code: "EACCES" }); } } });
  const interaction = fake("list"); await handler(interaction);
  assert.doesNotMatch(interaction.replies[0].content, /secret/);
});
