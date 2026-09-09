import { createServer } from "node:http";

function send(res, status, body, contentType = "application/json; charset=utf-8") {
  res.writeHead(status, {
    "content-type": contentType,
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
    "x-frame-options": "DENY",
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'"
  });
  res.end(body);
}

function html(title, message) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:system-ui,sans-serif;margin:40px;line-height:1.45;max-width:620px}</style></head><body><h1>${title}</h1><p>${message}</p><p>Anda boleh tutup tab ini dan kembali ke Discord.</p></body></html>`;
}

export function startServer({ port, getStatus, handleRobloxOAuthCallback }) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      if (req.method === "GET" && url.pathname === "/health") {
        return send(res, 200, JSON.stringify({ ok: true, ...getStatus() }));
      }
      if (req.method === "GET" && url.pathname === "/oauth/roblox/callback" && handleRobloxOAuthCallback) {
        try {
          const profile = await handleRobloxOAuthCallback(url);
          return send(
            res,
            200,
            html("Roblox connected", `Akaun Roblox ${profile.username} (${profile.robloxUserId}) sudah disambung.`),
            "text/html; charset=utf-8"
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : "Sambungan Roblox gagal.";
          return send(res, 400, html("Roblox connect failed", message), "text/html; charset=utf-8");
        }
      }
      return send(res, 404, JSON.stringify({ error: "Not found" }));
    } catch (error) {
      console.error("HTTP error:", error instanceof Error ? error.message : error);
      return send(res, 400, JSON.stringify({ error: "Invalid request" }));
    }
  });
  server.listen(port, "0.0.0.0", () => console.log(`HTTP health server aktif pada port ${port}`));
  return server;
}
