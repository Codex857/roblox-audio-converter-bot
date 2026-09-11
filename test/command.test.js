import test from "node:test";
import assert from "node:assert/strict";
import { allCommands } from "../src/command.js";

test("required Discord options precede optional options", () => {
  for (const command of allCommands.map((item) => item.toJSON())) {
    let optionalSeen = false;
    for (const option of command.options || []) {
      if (option.required !== true) optionalSeen = true;
      assert.equal(optionalSeen && option.required === true, false, `${command.name}: ${option.name}`);
    }
  }
});

test("direct upload accepts up to five attachments", () => {
  const upload = allCommands.map((item) => item.toJSON()).find((command) => command.name === "roblox-upload");
  const attachmentNames = upload.options
    .filter((option) => option.type === 11)
    .map((option) => option.name);
  assert.deepEqual(attachmentNames, ["file", "file_2", "file_3", "file_4", "file_5"]);
});

test("help command is available without options", () => {
  const help = allCommands.map((item) => item.toJSON()).find((command) => command.name === "roblox-help");
  assert.ok(help);
  assert.deepEqual(help.options || [], []);
});

test("menu command is available without options", () => {
  const menu = allCommands.map((item) => item.toJSON()).find((command) => command.name === "menu");
  assert.ok(menu);
  assert.deepEqual(menu.options || [], []);
});

test("history command is available without options", () => {
  const history = allCommands.map((item) => item.toJSON()).find((command) => command.name === "history");
  assert.ok(history);
  assert.deepEqual(history.options || [], []);
});

test("AI music command exposes safe generation controls", () => {
  const command = allCommands.map((item) => item.toJSON()).find((item) => item.name === "generate-music");
  assert.ok(command);
  assert.deepEqual(command.options.map((option) => option.name), [
    "prompt", "rights_confirm", "genre", "mode", "duration", "bpm", "seamless_loop", "upload_to_roblox"
  ]);
  assert.deepEqual(command.options.find((option) => option.name === "duration").choices.map((choice) => choice.value), [30, 60, 120]);
});

test("AI status command is available without options", () => {
  const command = allCommands.map((item) => item.toJSON()).find((item) => item.name === "ai-status");
  assert.ok(command);
  assert.deepEqual(command.options || [], []);
});

test("audio check and permanent panel commands are registered", () => {
  const commands = allCommands.map((item) => item.toJSON());
  const check = commands.find((item) => item.name === "audio-check");
  const panel = commands.find((item) => item.name === "panel");
  assert.ok(check);
  assert.deepEqual(check.options.map((option) => ({ name: option.name, required: option.required })), [{ name: "file", required: true }]);
  assert.ok(panel);
  assert.deepEqual(panel.options || [], []);
  assert.ok(panel.default_member_permissions);
});

test("Lua sound command exposes safe templates", () => {
  const command = allCommands.map((item) => item.toJSON()).find((item) => item.name === "lua-sound");
  assert.ok(command);
  assert.deepEqual(command.options.map((option) => option.name), ["asset_ids", "template"]);
  assert.deepEqual(command.options[1].choices.map((choice) => choice.value), ["single", "playlist", "random", "crossfade"]);
});

test("quick upload only asks for one required file", () => {
  const quick = allCommands.map((item) => item.toJSON()).find((command) => command.name === "upload");
  assert.ok(quick);
  assert.deepEqual(quick.options.map((option) => ({ name: option.name, required: option.required })), [
    { name: "file", required: true },
    { name: "speed", required: false },
    { name: "preset", required: false },
    { name: "trim", required: false }
  ]);
});

test("YouTube upload asks once for the link and rights confirmation", () => {
  const youtube = allCommands.map((item) => item.toJSON()).find((command) => command.name === "yt");
  assert.ok(youtube);
  assert.deepEqual(youtube.options.map((option) => ({ name: option.name, required: option.required })), [
    { name: "link", required: true },
    { name: "rights_confirm", required: true },
    { name: "speed", required: false },
    { name: "preset", required: false },
    { name: "trim", required: false }
  ]);
});

test("Roblox account command is available without options", () => {
  const account = allCommands.map((item) => item.toJSON()).find((command) => command.name === "roblox-account");
  assert.ok(account);
  assert.deepEqual(account.options || [], []);
});

test("Roblox server command exposes admin setup subcommands", () => {
  const server = allCommands.map((item) => item.toJSON()).find((command) => command.name === "roblox-server");
  assert.ok(server);
  assert.deepEqual(server.options.map((option) => option.name), [
    "set", "status", "role-add", "role-remove", "roles", "roles-clear", "audit-channel", "audit-clear", "clear"
  ]);
  const set = server.options.find((option) => option.name === "set");
  assert.deepEqual(set.options.map((option) => option.name), ["creator_type", "creator_id"]);
  assert.deepEqual(server.options.find((option) => option.name === "role-add").options.map((option) => option.name), ["role"]);
  assert.deepEqual(server.options.find((option) => option.name === "audit-channel").options.map((option) => option.name), ["channel"]);
});

test("upload commands expose supported speed choices", () => {
  for (const name of ["upload", "yt", "roblox-upload", "roblox-audio"]) {
    const command = allCommands.map((item) => item.toJSON()).find((item) => item.name === name);
    const speed = command.options.find((option) => option.name === "speed");
    assert.deepEqual(speed.choices.map((choice) => choice.value), ["0.75", "1", "1.25", "1.5", "2"]);
    const preset = command.options.find((option) => option.name === "preset");
    assert.deepEqual(preset.choices.map((choice) => choice.value), ["preserve", "balanced", "bass", "vocal"]);
    assert.ok(command.options.find((option) => option.name === "trim"));
  }
});
