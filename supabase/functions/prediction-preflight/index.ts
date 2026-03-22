import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5";

/**
 * prediction-preflight — Lightweight auth check before client-side fee transfer.
 *
 * Verifies Privy JWT is valid and JWKS endpoint is reachable.
 * Returns { ok: true, wallet } on success, or 401 on failure.
 * This prevents orphaned fee transfers when JWKS is down.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-privy-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const JWKS_URL = new URL("https://auth.privy.io/.well-known/jwks.json");

/** Create JWKS key set with retry on transient failures */
async function verifyWithRetry(
  privyToken: string,
  appId: string,
  maxAttempts = 4,
) {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      console.log(`[preflight] JWKS verify attempt ${attempt + 1}/${maxAttempts}`);
      const jwks = createRemoteJWKSet(JWKS_URL);
      const { payload } = await jwtVerify(privyToken, jwks, {
        issuer: "privy.io",
        audience: appId,
      });
      console.log(`[preflight] JWKS verify succeeded on attempt ${attempt + 1}`);
      return payload;
    } catch (e) {
      lastError = e as Error;
      const msg = lastError.message ?? "";
      console.warn(`[preflight] JWKS attempt ${attempt + 1} failed: ${msg}`);
      // Only retry on network/fetch failures, not on actual JWT validation errors
      const isTransient =
        msg.includes("Expected 200 OK") ||
        msg.includes("fetch") ||
        msg.includes("network") ||
        msg.includes("ECONNREFUSED") ||
        msg.includes("timed out") ||
        msg.includes("timeout");
      if (!isTransient || attempt === maxAttempts - 1) throw lastError;
      // Wait 1.5s before retry
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw lastError;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("[preflight] Request received");

  const privyToken = req.headers.get("x-privy-token");
  const appId = Deno.env.get("VITE_PRIVY_APP_ID");

  if (!privyToken || privyToken.length < 20 || !appId) {
    console.warn("[preflight] Missing token or appId");
    return json({ ok: false, error: "auth_required" }, 401);
  }

  try {
    const payload = await verifyWithRetry(privyToken, appId);

    const did = payload.sub as string | undefined;
    if (!did) {
      console.warn("[preflight] Token verified but no DID (sub) found");
      return json({ ok: false, error: "no_did" }, 401);
    }

    console.log("[preflight] Success — DID resolved");
    return json({ ok: true, did });
  } catch (e) {
    const errMsg = (e as Error).message;
    console.error("[preflight] Final verification failure:", errMsg);
    return json(
      { ok: false, error: "jwt_verification_failed", detail: errMsg },
      401,
    );
  }
});
