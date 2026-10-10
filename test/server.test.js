import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { startServer } from "../src/server.js";

test("OAuth pages render untrusted profile and error text as plain text", async t => {
  const unsafe = '<img src=x onerror="alert(1)">';
  const server = startServer({ port: 0, getStatus: () => ({}),
    handleRobloxOAuthCallback: async url => {
      if (url.searchParams.has("fail")) throw new Error(unsafe);
      return { username: unsafe, robloxUserId: "123" };
    }
  });
  await once(server, "listening");
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const query of ["", "?fail=1"]) {
    const response = await fetch(`${base}/oauth/roblox/callback${query}`);
    assert.equal(response.status, query ? 400 : 200);
    const body = await response.text();
    assert.ok(body.includes("&lt;img"));
    assert.ok(!body.includes(unsafe));
  }
});
