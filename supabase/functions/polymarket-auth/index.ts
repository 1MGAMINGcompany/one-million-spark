import { createClient } from "@supabase/supabase-js";
import { verifyMessage, createWalletClient, http, keccak256, toBytes, toHex } from "viem";
import { polygon } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

/**
 * polymarket-auth — User-authenticated Polymarket credential derivation.
 *
 * Flow:
 * 1. User signs a deterministic SIWE message with their Privy EVM wallet
 * 2. Server verifies signature via viem
 * 3. Server derives a Polymarket CLOB API key using the user's signature as seed
 * 4. Credentials stored server-side only (polymarket_user_sessions)
 * 5. Builder wallet is NEVER used for user trading
 *
 * Actions:
 *   - derive_credentials: Verify SIWE + derive/register PM API keys
 *   - check_session: Check if user has active PM session
 *   - revoke_session: Revoke user's PM session
 *   - set_ctf_allowance: Mark CTF allowance as set for user
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

/**
 * Derive a deterministic private key from the user's SIWE signature.
 * This becomes the user's "trading key" for Polymarket CLOB.
 * The key is derived client-independently — same wallet + same message = same key.
 */
function deriveTradingKey(signature: string): `0x${string}` {
  // Hash the signature to get a deterministic 32-byte private key
  const seed = keccak256(toBytes(signature));
  return seed as `0x${string}`;
}

/**
 * Generate HMAC signature for Polymarket CLOB API authentication.
 * Uses the API secret to sign: timestamp + method + path + body
 */
async function generateClobHmac(
  apiSecret: string,
  timestamp: string,
  method: string,
  path: string,
  body: string = "",
): Promise<string> {
  const message = timestamp + method + path + body;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(apiSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

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
    // ══════════════════════════════════════════════════
    if (action === "derive_credentials") {
      const { signature, message, timestamp } = body;

      if (!signature || !message) {
        return json({ error: "Missing signature or message" }, 400);
      }

      // Validate timestamp freshness (5 min window)
      if (timestamp && Math.abs(Date.now() - timestamp) > 5 * 60 * 1000) {
        return json({ error: "Signature expired" }, 400);
      }

      // ── Step 1: Verify SIWE signature with viem ──
      const isValid = await verifyMessage({
        address: normalizedWallet as `0x${string}`,
        message,
        signature: signature as `0x${string}`,
      });

      if (!isValid) {
        return json({ error: "Signature verification failed" }, 401);
      }

      // ── Step 2: Derive trading key from signature ──
      const tradingKeyHex = deriveTradingKey(signature);
      const tradingAccount = privateKeyToAccount(tradingKeyHex);
      const derivedAddress = tradingAccount.address.toLowerCase();

      // ── Step 3: Register/derive API credentials with Polymarket CLOB ──
      let pmApiKey: string | null = null;
      let pmApiSecret: string | null = null;
      let pmPassphrase: string | null = null;
      let status = "active";

      try {
        // Create a nonce for the CLOB API key derivation
        const nonce = Date.now().toString();

        // Sign the derivation message with the derived trading key
        const derivationMessage = `Derive Polymarket API key\nNonce: ${nonce}\nAddress: ${derivedAddress}`;
        const derivationSig = await tradingAccount.signMessage({
          message: derivationMessage,
        });

        // Register with CLOB to get API credentials
        const regRes = await fetch(`${CLOB_BASE}/auth/derive-api-key`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            wallet: derivedAddress,
            nonce,
            signature: derivationSig,
          }),
        });

        if (regRes.ok) {
          const regData = await regRes.json();
          pmApiKey = regData.apiKey || null;
          pmApiSecret = regData.secret || null;
          pmPassphrase = regData.passphrase || null;
          status = pmApiKey ? "active" : "awaiting_credentials";
          console.log(`[polymarket-auth] CLOB API key derived for ${derivedAddress}`);
        } else {
          const errText = await regRes.text();
          console.warn(`[polymarket-auth] CLOB derive failed (${regRes.status}): ${errText}`);
          status = "awaiting_credentials";
        }
      } catch (clobErr) {
        console.warn("[polymarket-auth] CLOB registration error:", clobErr);
        status = "awaiting_credentials";
      }

      const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000);

      // ── Step 4: Upsert session ──
      const { data: existing } = await supabase
        .from("polymarket_user_sessions")
        .select("id")
        .eq("wallet", normalizedWallet)
        .maybeSingle();

      const sessionData = {
        status,
        pm_api_key: pmApiKey,
        pm_api_secret: pmApiSecret,
        pm_passphrase: pmPassphrase,
        pm_derived_address: derivedAddress,
        authenticated_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (existing) {
        await supabase
          .from("polymarket_user_sessions")
          .update(sessionData)
          .eq("id", existing.id);
      } else {
        await supabase
          .from("polymarket_user_sessions")
          .insert({ wallet: normalizedWallet, ...sessionData });
      }

      // Audit log
      await supabase.from("automation_logs").insert({
        action: "polymarket_auth_derive",
        source: "polymarket-auth",
        details: {
          wallet: normalizedWallet,
          derived_address: derivedAddress,
          status,
          has_api_key: !!pmApiKey,
        },
      });

      return json({
        success: true,
        status,
        derived_address: derivedAddress,
        expires_at: expiresAt.toISOString(),
        can_trade: status === "active" && !!pmApiKey,
        // NEVER return api_key/secret/passphrase to frontend
      });
    }

    // ══════════════════════════════════════════════════
    // ACTION: check_session
    // ══════════════════════════════════════════════════
    if (action === "check_session") {
      const { data: session } = await supabase
        .from("polymarket_user_sessions")
        .select("status, authenticated_at, expires_at, ctf_allowance_set, pm_derived_address")
        .eq("wallet", normalizedWallet)
        .maybeSingle();

      if (!session) {
        return json({ has_session: false, status: "none", can_trade: false });
      }

      const isExpired = session.expires_at && new Date() > new Date(session.expires_at);
      const canTrade = session.status === "active" && !isExpired;

      return json({
        has_session: true,
        status: isExpired ? "expired" : session.status,
        can_trade: canTrade,
        ctf_allowance_set: session.ctf_allowance_set,
        derived_address: session.pm_derived_address,
        authenticated_at: session.authenticated_at,
        expires_at: session.expires_at,
      });
    }

    // ══════════════════════════════════════════════════
    // ACTION: set_ctf_allowance
    // ══════════════════════════════════════════════════
    if (action === "set_ctf_allowance") {
      const { tx_hash } = body;
      if (!tx_hash) return json({ error: "Missing tx_hash" }, 400);

      await supabase
        .from("polymarket_user_sessions")
        .update({
          ctf_allowance_set: true,
          updated_at: new Date().toISOString(),
        })
        .eq("wallet", normalizedWallet);

      return json({ success: true, ctf_allowance_set: true });
    }

    // ══════════════════════════════════════════════════
    // ACTION: revoke_session
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
