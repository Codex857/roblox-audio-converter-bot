import { createServer } from "node:http";

function send(res, status, body, contentType = "application/json; charset=utf-8") {
  res.writeHead(status, { "content-type": contentType, "cache-control": "no-store" });
  res.end(body);
}

async function readBody(req, maxBytes = 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error("Request body terlalu besar.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export function startServer({ port, billing, getStatus }) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      if (req.method === "GET" && url.pathname === "/health") {
        return send(res, 200, JSON.stringify({ ok: true, ...getStatus() }));
      }
      if (req.method === "GET" && url.pathname === "/success") {
        return send(res, 200, "<h1>Langganan berjaya</h1><p>Kembali ke Discord dan gunakan /subscription.</p>", "text/html; charset=utf-8");
      }
      if (req.method === "GET" && url.pathname === "/cancel") {
        return send(res, 200, "<h1>Pembayaran dibatalkan</h1><p>Tiada caj baharu dibuat.</p>", "text/html; charset=utf-8");
      }
      if (req.method === "POST" && url.pathname === "/stripe/webhook") {
        const signature = req.headers["stripe-signature"];
        if (!signature) return send(res, 400, JSON.stringify({ error: "Missing Stripe signature" }));
        const result = await billing.handleWebhook(await readBody(req), signature);
        return send(res, 200, JSON.stringify({ received: true, ...result }));
      }
      return send(res, 404, JSON.stringify({ error: "Not found" }));
    } catch (error) {
      console.error("HTTP error:", error);
      return send(res, 400, JSON.stringify({ error: "Invalid request" }));
    }
  });
  server.listen(port, "0.0.0.0", () => console.log(`HTTP health/webhook server aktif pada port ${port}`));
  return server;
}
