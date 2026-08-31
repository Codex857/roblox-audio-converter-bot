import test from "node:test";
import assert from "node:assert/strict";
import { buildUploadExports } from "../src/upload-results.js";

test("upload exports include JSON and safe Lua IDs", () => {
  const output = buildUploadExports([
    { name: "Lagu \"Satu\"", assetId: "123" },
    { name: "Lagu \"Satu\"", assetId: "456" }
  ]);
  assert.deepEqual(JSON.parse(output.json), [
    { name: "Lagu \"Satu\"", assetId: "123", uri: "rbxassetid://123" },
    { name: "Lagu \"Satu\"", assetId: "456", uri: "rbxassetid://456" }
  ]);
  assert.match(output.lua, /Lagu \\\"Satu\\\"/);
  assert.match(output.lua, /Lagu \\\"Satu\\\" \[2\]/);
  assert.match(output.lua, /rbxassetid:\/\/456/);
});
