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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const privyToken = req.headers.get("x-privy-token");
  const appId = Deno.env.get("VITE_PRIVY_APP_ID");

  if (!privyToken || privyToken.length < 20 || !appId) {
    return json({ ok: false, error: "auth_required" }, 401);
  }

  try {
    const jwks = createRemoteJWKSet(
      new URL("https://auth.privy.io/.well-known/jwks.json"),
    );
    const { payload } = await jwtVerify(privyToken, jwks, {
      issuer: "privy.io",
      audience: appId,
    });

    const did = payload.sub as string | undefined;
    if (!did) {
      return json({ ok: false, error: "no_did" }, 401);
    }

    return json({ ok: true, did });
  } catch (e) {
    return json(
      { ok: false, error: "jwt_verification_failed", detail: (e as Error).message },
      401,
    );
  }
});
