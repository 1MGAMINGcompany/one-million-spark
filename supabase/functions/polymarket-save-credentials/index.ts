import { createClient } from "@supabase/supabase-js";

/**
 * polymarket-save-credentials — Store browser-derived CLOB API credentials.
 *
 * After the browser derives credentials directly from Polymarket's
 * /auth/api-key endpoint, it sends them here for secure storage.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-privy-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Verify Privy JWT
    const privyToken = req.headers.get("x-privy-token");
    const appId = Deno.env.get("VITE_PRIVY_APP_ID");
    if (!privyToken || !appId) {
      return json({ error: "Authentication required" }, 401);
    }

    let privyDid: string;
    try {
      const parts = privyToken.split(".");
      if (parts.length !== 3) throw new Error("malformed_jwt");
      const payloadB64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const payload = JSON.parse(atob(payloadB64));
      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) throw new Error("expired");
      if (payload.iss !== "privy.io") throw new Error("invalid_issuer");
      if (payload.aud !== appId) throw new Error("invalid_audience");
      privyDid = payload.sub;
      if (!privyDid) throw new Error("no_did");
    } catch (e) {
      return json({ error: "Auth failed", detail: (e as Error).message }, 401);
    }

    const body = await req.json();
    const { wallet, api_key, api_secret, passphrase } = body;

    if (!wallet || !api_key || !api_secret || !passphrase) {
      return json({ error: "Missing required fields (wallet, api_key, api_secret, passphrase)" }, 400);
    }

    const normalizedWallet = String(wallet).trim().toLowerCase();

    // Resolve wallet from prediction_accounts to verify ownership
    const { data: account } = await supabase
      .from("prediction_accounts")
      .select("id, wallet_evm")
      .eq("privy_did", privyDid)
      .maybeSingle();

    const accountWallet = account?.wallet_evm
      ? String(account.wallet_evm).trim().toLowerCase()
      : null;

    // Verify the wallet matches the authenticated user
    if (accountWallet && accountWallet !== normalizedWallet) {
      return json({ error: "Wallet mismatch" }, 403);
    }

    // Update session with browser-derived credentials
    const { data: session } = await supabase
      .from("polymarket_user_sessions")
      .select("id, status")
      .eq("wallet", normalizedWallet)
      .maybeSingle();

    if (!session) {
      return json({ error: "No trading session found — set up trading wallet first" }, 404);
    }

    const { error: updateError } = await supabase
      .from("polymarket_user_sessions")
      .update({
        pm_api_key: api_key,
        pm_api_secret: api_secret,
        pm_passphrase: passphrase,
        status: "active",
        authenticated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", session.id);

    if (updateError) {
      return json({ error: "Failed to save credentials", detail: updateError.message }, 500);
    }

    await supabase.from("automation_logs").insert({
      action: "polymarket_browser_credentials_saved",
      source: "polymarket-save-credentials",
      details: {
        wallet: normalizedWallet,
        privy_did: privyDid,
        previous_status: session.status,
      },
    });

    console.log(`[polymarket-save-credentials] Saved browser-derived credentials for ${normalizedWallet}`);

    return json({ success: true, status: "active" });
  } catch (err) {
    console.error("[polymarket-save-credentials] Error:", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
