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
