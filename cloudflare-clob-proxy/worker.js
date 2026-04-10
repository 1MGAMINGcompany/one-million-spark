/**
 * Cloudflare Worker — CLOB Proxy for Polymarket
 * Routes all CLOB API traffic through Cloudflare's edge network
 * to avoid geo-blocking of cloud provider IPs (Deno Deploy, AWS, etc.)
 * 
 * CRITICAL: Must strip X-Forwarded-For and other forwarding headers
 * so Polymarket sees the Cloudflare egress IP, not the origin.
 */

const UPSTREAM = "https://clob.polymarket.com";

// Headers that could leak the caller's IP to the upstream
const STRIP_HEADERS = new Set([
  "x-forwarded-for",
  "x-real-ip",
  "cf-connecting-ip",
  "true-client-ip",
  "x-forwarded-proto",
  "x-forwarded-host",
  "forwarded",
  "via",
]);

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Only proxy to clob.polymarket.com
    const upstream = UPSTREAM + url.pathname + url.search;

    // Build clean headers — strip any that reveal the real caller IP
    const headers = new Headers();
    for (const [key, value] of request.headers.entries()) {
      if (STRIP_HEADERS.has(key.toLowerCase())) continue;
      // Don't forward Cloudflare-specific headers
      if (key.toLowerCase().startsWith("cf-")) continue;
      headers.set(key, value);
    }

    // Override host to match upstream
    headers.set("Host", "clob.polymarket.com");

    try {
      const resp = await fetch(upstream, {
        method: request.method,
        headers,
        body: request.method !== "GET" && request.method !== "HEAD"
          ? await request.arrayBuffer()
          : undefined,
      });

      // Forward the response with CORS headers
      const responseHeaders = new Headers(resp.headers);
      responseHeaders.set("Access-Control-Allow-Origin", "*");
      responseHeaders.set("Access-Control-Allow-Headers", "*");
      responseHeaders.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");

      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: responseHeaders });
      }

      return new Response(resp.body, {
        status: resp.status,
        statusText: resp.statusText,
        headers: responseHeaders,
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: "proxy_error", message: err.message }), {
        status: 502,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
  },
};
