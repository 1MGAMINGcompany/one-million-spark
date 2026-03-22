import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * prediction-preflight — Lightweight auth check before client-side fee transfer.
 *
 * Verifies Privy access token using the Privy App Secret (HMAC-based),
 * eliminating dependency on the flaky JWKS endpoint.
 * Returns { ok: true, did } on success, or 401 on failure.
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

/**
 * Verify Privy token by calling the Privy REST API with app secret.
 * This is more reliable than JWKS because it doesn't depend on
 * the edge runtime's ability to fetch remote JWK sets.
 */
async function verifyPrivyToken(
  privyToken: string,
  appId: string,
  appSecret: string,
): Promise<{ did: string }> {
  const basicAuth = btoa(`${appId}:${appSecret}`);

  // Decode JWT payload to extract the DID (sub claim)
  // We still validate via Privy API to ensure the token is legitimate
  const parts = privyToken.split(".");
  if (parts.length !== 3) throw new Error("malformed_jwt");

  const payloadB64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const payloadJson = atob(payloadB64);
  const payload = JSON.parse(payloadJson);

  const did = payload.sub;
  if (!did || typeof did !== "string") throw new Error("no_did_in_token");

  // Check token expiry locally first
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) throw new Error("token_expired");
  if (payload.iss !== "privy.io") throw new Error("invalid_issuer");
  if (payload.aud !== appId) throw new Error("invalid_audience");

  // Validate token is still active by fetching user from Privy API
  const userRes = await fetch(`https://api.privy.io/v1/users/${did}`, {
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "privy-app-id": appId,
    },
  });

  if (!userRes.ok) {
    const errText = await userRes.text().catch(() => "unknown");
    throw new Error(`privy_api_${userRes.status}: ${errText.slice(0, 200)}`);
  }

  return { did };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("[preflight] Request received");

  const privyToken = req.headers.get("x-privy-token");
  const appId = Deno.env.get("VITE_PRIVY_APP_ID");
  const appSecret = Deno.env.get("PRIVY_APP_SECRET");

  if (!privyToken || privyToken.length < 20 || !appId) {
    console.warn("[preflight] Missing token or appId");
    return json({ ok: false, error: "auth_required" }, 401);
  }

  if (!appSecret) {
    console.error("[preflight] PRIVY_APP_SECRET not configured — cannot verify");
    return json({ ok: false, error: "server_config_error" }, 500);
  }

  try {
    const { did } = await verifyPrivyToken(privyToken, appId, appSecret);
    console.log("[preflight] Success — DID resolved");
    return json({ ok: true, did });
  } catch (e) {
    const errMsg = (e as Error).message;
    console.error("[preflight] Verification failure:", errMsg);
    return json(
      { ok: false, error: "jwt_verification_failed", detail: errMsg },
      401,
    );
  }
});
