import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Simple in-memory rate limiter (per IP, resets on cold start)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 60; // requests per window
const RATE_WINDOW_MS = 60_000; // 1 minute

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  
  entry.count++;
  return entry.count > RATE_LIMIT;
}

function json(res: unknown, status = 200) {
  return new Response(JSON.stringify(res), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Allowed origins (log unknown, can upgrade to block later)
const ALLOWED_ORIGINS = [
  "https://1mgaming.com",
  "https://one-million-spark.lovable.app",
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1. Optional origin check (log but don't block for now)
    const origin = req.headers.get("origin") || "";
    const isKnownOrigin = ALLOWED_ORIGINS.some(o => origin.startsWith(o)) || 
                          origin.includes("lovableproject.com") ||
                          origin.includes("localhost");
    if (!isKnownOrigin && origin) {
      console.warn(`[solana-rpc-read] Unknown origin: ${origin}`);
    }

    // 2. Rate limiting by IP
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || 
                     req.headers.get("cf-connecting-ip") || 
                     "unknown";
    if (isRateLimited(clientIp)) {
      console.warn(`[solana-rpc-read] Rate limited: ${clientIp}`);
      return json({ ok: false, error: "Rate limited" }, 429);
    }

    // 3. Reject large payloads (max 10KB)
    const contentLength = parseInt(req.headers.get("content-length") || "0", 10);
    if (contentLength > 10_000) {
      return json({ ok: false, error: "Payload too large" }, 413);
    }

    const rpcUrl = (Deno.env.get("SOLANA_RPC_URL") || "").trim();
    if (!rpcUrl.startsWith("http")) {
      console.error("[solana-rpc-read] SOLANA_RPC_URL missing or invalid");
      return json({ ok: false, error: "SOLANA_RPC_URL missing/invalid" }, 500);
    }

    const body = await req.json();
    const method = String(body?.method || "");
    const params = Array.isArray(body?.params) ? body.params : [];

    // 4. Allow-list READ methods only (no sendTransaction/sendRawTransaction)
    const ALLOW = new Set([
      "getAccountInfo",
      "getMultipleAccounts",
      "getProgramAccounts",
      "getBalance",
      "getLatestBlockhash",
      "getBlockHeight",
      "getSlot",
      "getSignatureStatuses",
      "getTransaction",
      "getSignaturesForAddress",
      "getTokenAccountBalance",
      "getTokenAccountsByOwner",
      "getEpochInfo",
      "getHealth",
      "getVersion",
    ]);

    if (!ALLOW.has(method)) {
      console.warn(`[solana-rpc-read] Blocked method: ${method}`);
      return json({ ok: false, error: `Method not allowed: ${method}` }, 400);
    }

    const rpcPayload = {
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method,
      params,
    };

    console.log(`[solana-rpc-read] ${method} from ${clientIp}`);

    const resp = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rpcPayload),
    });

    const data = await resp.json().catch(() => null);

    if (!resp.ok) {
      console.error(`[solana-rpc-read] RPC error: ${resp.status}`, data);
      return json({ ok: false, status: resp.status, data }, 502);
    }

    return json({ ok: true, result: data?.result ?? null });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[solana-rpc-read] Error:", message);
    return json({ ok: false, error: message }, 500);
  }
});
