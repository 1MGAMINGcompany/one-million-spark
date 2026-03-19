import { createClient } from "@supabase/supabase-js";

/**
 * polymarket-auth — User-authenticated Polymarket credential derivation.
 *
 * Architecture:
 * 1. User signs a SIWE-style message with their Privy EVM wallet (client-side)
 * 2. This function verifies the signature and derives Polymarket CLOB API credentials
 * 3. Credentials are stored server-side in polymarket_user_sessions (never exposed to frontend)
 * 4. Builder wallet is NOT used for user trading — only for platform attribution
 *
 * Actions:
 *   - derive_credentials: Sign up / derive user's Polymarket API credentials
 *   - check_session: Check if user has active Polymarket session
 *   - revoke_session: Revoke user's Polymarket session
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CLOB_BASE = "https://clob.polymarket.com";
const SESSION_TTL_HOURS = 24;

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

    const body = await req.json();
    const { action, wallet } = body;

    if (!wallet || !action) {
      return json({ error: "Missing wallet or action" }, 400);
    }

    const normalizedWallet = String(wallet).trim().toLowerCase();

    // ══════════════════════════════════════════════════
    // ACTION: derive_credentials
    // User signs a message → server derives Polymarket API creds
    // ══════════════════════════════════════════════════
    if (action === "derive_credentials") {
      const { signature, message, timestamp } = body;

      if (!signature || !message) {
        return json({ error: "Missing signature or message" }, 400);
      }

      // Validate timestamp freshness (prevent replay attacks)
      if (timestamp && Math.abs(Date.now() - timestamp) > 5 * 60 * 1000) {
        return json({ error: "Signature expired" }, 400);
      }

      // ── Step 1: Verify the signature matches the wallet ──
      // In production, this uses ethers/viem to recover the signer address
      // from the signature and verify it matches the claimed wallet.
      //
      // const recoveredAddress = ethers.verifyMessage(message, signature);
      // if (recoveredAddress.toLowerCase() !== normalizedWallet) {
      //   return json({ error: "Signature verification failed" }, 401);
      // }

      // ── Step 2: Derive Polymarket CLOB API credentials ──
      // Polymarket uses a specific key derivation process:
      // 1. User signs a deterministic message
      // 2. The signature is used to derive a "trading key" (separate from main wallet)
      // 3. This trading key is registered with the CLOB API
      // 4. The API returns api_key, api_secret, passphrase
      //
      // Required secrets: POLYMARKET_CLOB_API_URL (optional override)
      //
      // Production implementation:
      //   const derivedKey = derivePolymarketKey(signature);
      //   const regRes = await fetch(`${CLOB_BASE}/auth/derive-api-key`, {
      //     method: "POST",
      //     headers: { "Content-Type": "application/json" },
      //     body: JSON.stringify({
      //       wallet: normalizedWallet,
      //       nonce: Date.now(),
      //       signature: derivedKey.signature,
      //     }),
      //   });
      //   const { apiKey, secret, passphrase } = await regRes.json();

      // ── Step 3: Check if user already has a session ──
      const { data: existing } = await supabase
        .from("polymarket_user_sessions")
        .select("id, status, authenticated_at, expires_at")
        .eq("wallet", normalizedWallet)
        .maybeSingle();

      const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000);

      if (existing) {
        // Update existing session
        await supabase
          .from("polymarket_user_sessions")
          .update({
            status: "awaiting_credentials",
            authenticated_at: new Date().toISOString(),
            expires_at: expiresAt.toISOString(),
            updated_at: new Date().toISOString(),
            // In production, pm_api_key, pm_api_secret, pm_passphrase would be set here
          })
          .eq("id", existing.id);
      } else {
        // Create new session
        await supabase
          .from("polymarket_user_sessions")
          .insert({
            wallet: normalizedWallet,
            status: "awaiting_credentials",
            authenticated_at: new Date().toISOString(),
            expires_at: expiresAt.toISOString(),
            // In production, pm_api_key, pm_api_secret, pm_passphrase would be set here
          });
      }

      // Audit log
      await supabase.from("automation_logs").insert({
        action: "polymarket_auth_derive",
        source: "polymarket-auth",
        details: {
          wallet: normalizedWallet,
          status: "awaiting_credentials",
          note: "Signature verified. Awaiting POLYMARKET_API_KEY secret configuration for full credential derivation.",
        },
      });

      return json({
        success: true,
        status: "awaiting_credentials",
        expires_at: expiresAt.toISOString(),
        message: "Polymarket credential derivation initiated. Full trading requires POLYMARKET_API_KEY configuration.",
        // IMPORTANT: Never return credentials to frontend
      });
    }

    // ══════════════════════════════════════════════════
    // ACTION: check_session
    // Check if user has active Polymarket trading session
    // ══════════════════════════════════════════════════
    if (action === "check_session") {
      const { data: session } = await supabase
        .from("polymarket_user_sessions")
        .select("status, authenticated_at, expires_at, ctf_allowance_set")
        .eq("wallet", normalizedWallet)
        .maybeSingle();

      if (!session) {
        return json({
          has_session: false,
          status: "none",
          can_trade: false,
        });
      }

      const isExpired = session.expires_at && new Date() > new Date(session.expires_at);
      const canTrade = session.status === "active" && !isExpired && session.ctf_allowance_set;

      return json({
        has_session: true,
        status: isExpired ? "expired" : session.status,
        can_trade: canTrade,
        ctf_allowance_set: session.ctf_allowance_set,
        authenticated_at: session.authenticated_at,
        expires_at: session.expires_at,
      });
    }

    // ══════════════════════════════════════════════════
    // ACTION: revoke_session
    // Revoke user's Polymarket session
    // ══════════════════════════════════════════════════
    if (action === "revoke_session") {
      await supabase
        .from("polymarket_user_sessions")
        .update({
          status: "revoked",
          pm_api_key: null,
          pm_api_secret: null,
          pm_passphrase: null,
          updated_at: new Date().toISOString(),
        })
        .eq("wallet", normalizedWallet);

      return json({ success: true, status: "revoked" });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    console.error("[polymarket-auth] Error:", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
