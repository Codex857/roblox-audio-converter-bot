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

test("quick upload only asks for one required file", () => {
  const quick = allCommands.map((item) => item.toJSON()).find((command) => command.name === "upload");
  assert.ok(quick);
  assert.deepEqual(quick.options.map((option) => ({ name: option.name, required: option.required })), [
    { name: "file", required: true },
    { name: "speed", required: false }
  ]);
});

test("YouTube upload asks once for the link and rights confirmation", () => {
  const youtube = allCommands.map((item) => item.toJSON()).find((command) => command.name === "yt");
  assert.ok(youtube);
  assert.deepEqual(youtube.options.map((option) => ({ name: option.name, required: option.required })), [
    { name: "link", required: true },
    { name: "rights_confirm", required: true },
    { name: "speed", required: false }
  ]);
});

test("Roblox account command is available without options", () => {
  const account = allCommands.map((item) => item.toJSON()).find((command) => command.name === "roblox-account");
  assert.ok(account);
  assert.deepEqual(account.options || [], []);
});

test("upload commands expose supported speed choices", () => {
  for (const name of ["upload", "yt", "roblox-upload", "roblox-audio"]) {
    const command = allCommands.map((item) => item.toJSON()).find((item) => item.name === name);
    const speed = command.options.find((option) => option.name === "speed");
    assert.deepEqual(speed.choices.map((choice) => choice.value), ["1", "1.5", "2"]);
  }
});
