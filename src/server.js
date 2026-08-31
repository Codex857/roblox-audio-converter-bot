import { createServer } from "node:http";

function send(res, status, body, contentType = "application/json; charset=utf-8") {
  res.writeHead(status, { "content-type": contentType, "cache-control": "no-store" });
  res.end(body);
}

export function startServer({ port, getStatus }) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      if (req.method === "GET" && url.pathname === "/health") {
        return send(res, 200, JSON.stringify({ ok: true, ...getStatus() }));
      }
      return send(res, 404, JSON.stringify({ error: "Not found" }));
    } catch (error) {
      console.error("HTTP error:", error);
      return send(res, 400, JSON.stringify({ error: "Invalid request" }));
    }
  });
  server.listen(port, "0.0.0.0", () => console.log(`HTTP health server aktif pada port ${port}`));
  return server;
}
