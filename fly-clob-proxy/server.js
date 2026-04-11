/**
 * Fly.io Node.js Proxy — CLOB Proxy for Polymarket
 * Pinned to iad (Virginia) for US egress IP.
 * Strips all headers that could reveal the caller's origin.
 */

const http = require("http");
const https = require("https");

const UPSTREAM = "https://clob.polymarket.com";
const PORT = process.env.PORT || 8080;

// Headers to strip — anything that leaks caller IP or runtime metadata
const STRIP = new Set([
  "x-forwarded-for",
  "x-real-ip",
  "cf-connecting-ip",
  "true-client-ip",
  "x-forwarded-proto",
  "x-forwarded-host",
  "forwarded",
  "via",
  "origin",
  "referer",
  "x-deno-execution-id",
  "x-deno-subhost",
  "x-deno-region",
  "x-client-info",
]);

const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    });
    res.end();
    return;
  }

  // Debug endpoint — returns region + basic info
  if (req.url === "/debug") {
    const region = process.env.FLY_REGION || "unknown";
    const machineId = process.env.FLY_MACHINE_ID || "unknown";
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({ region, machineId, upstreamTarget: UPSTREAM, timestamp: new Date().toISOString() }));
    return;
  }

  const upstream = UPSTREAM + req.url;

  // Build clean headers
  const headers = {};
  for (const [key, value] of Object.entries(req.headers)) {
    const lower = key.toLowerCase();
    if (STRIP.has(lower)) continue;
    if (lower.startsWith("cf-")) continue;
    if (lower.startsWith("fly-")) continue;
    headers[key] = value;
  }
  headers["host"] = "clob.polymarket.com";

  // Collect request body
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);

  const url = new URL(upstream);

  const options = {
    hostname: url.hostname,
    port: 443,
    path: url.pathname + url.search,
    method: req.method,
    headers,
  };

  if (body.length > 0) {
    options.headers["content-length"] = body.length;
  }

  console.log(`[proxy] ${req.method} ${req.url} → ${upstream} (region=${process.env.FLY_REGION || "?"})`);

  const proxyReq = https.request(options, (proxyRes) => {
    const responseHeaders = { ...proxyRes.headers };
    responseHeaders["access-control-allow-origin"] = "*";
    responseHeaders["access-control-allow-headers"] = "*";
    responseHeaders["access-control-allow-methods"] = "GET, POST, PUT, DELETE, OPTIONS";

    // Log non-2xx responses for debugging
    if (proxyRes.statusCode >= 400) {
      const respChunks = [];
      proxyRes.on("data", (c) => respChunks.push(c));
      proxyRes.on("end", () => {
        const respBody = Buffer.concat(respChunks).toString();
        console.error(`[proxy] UPSTREAM ${proxyRes.statusCode}: ${respBody.slice(0, 500)}`);
        res.writeHead(proxyRes.statusCode, responseHeaders);
        res.end(respBody);
      });
      return;
    }

    res.writeHead(proxyRes.statusCode, responseHeaders);
    proxyRes.pipe(res);
  });

  proxyReq.on("error", (err) => {
    console.error(`[proxy] error: ${err.message}`);
    res.writeHead(502, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({ error: "proxy_error", message: err.message }));
  });

  if (body.length > 0) proxyReq.write(body);
  proxyReq.end();
});

server.listen(PORT, () => {
  console.log(`[proxy] Listening on :${PORT} (region=${process.env.FLY_REGION || "local"})`);
});
