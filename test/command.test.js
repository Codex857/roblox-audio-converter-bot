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

test("quick upload only asks for one required file", () => {
  const quick = allCommands.map((item) => item.toJSON()).find((command) => command.name === "upload");
  assert.ok(quick);
  assert.deepEqual(quick.options.map((option) => ({ name: option.name, required: option.required })), [
    { name: "file", required: true }
  ]);
});

test("YouTube upload only asks for one required link", () => {
  const youtube = allCommands.map((item) => item.toJSON()).find((command) => command.name === "yt");
  assert.ok(youtube);
  assert.deepEqual(youtube.options.map((option) => ({ name: option.name, required: option.required })), [
    { name: "link", required: true }
  ]);
});
