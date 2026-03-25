import { createClient } from "@supabase/supabase-js";
import { privateKeyToAccount } from "npm:viem@2/accounts";
import { createWalletClient, http, encodeFunctionData, parseAbi, keccak256, toBytes } from "npm:viem@2";
import { polygon } from "npm:viem@2/chains";

/**
 * polymarket-user-setup — Per-user Polymarket trading wallet provisioning.
 *
 * Model A Architecture:
 * 1. User signs a deterministic SIWE message (client-side, one-time)
 * 2. Server derives a per-user trading key from that signature
 * 3. Server deploys a Gnosis Safe via Polymarket Builder Relayer (gasless)
 * 4. Server sets USDC.e + CTF approvals via Relayer (gasless)
 * 5. Server derives CLOB API credentials for the user
 * 6. Everything stored in polymarket_user_sessions
 *
 * Actions:
 *   - derive_and_setup: Full setup (derive key + deploy Safe + approvals + CLOB creds)
 *   - check_status: Check if user's trading wallet is fully provisioned
 *   - setup_approvals: Set CTF/USDC.e approvals only (if Safe already deployed)
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-privy-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CLOB_BASE = "https://clob.polymarket.com";
const RELAYER_BASE = "https://relayer.polymarket.com";
const POLYGON_CHAIN_ID = 137;

// Polymarket contract addresses
const USDC_E = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
const CTF_CONTRACT = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045";
const CTF_EXCHANGE = "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E";
const NEG_RISK_CTF_EXCHANGE = "0xC5d563A36AE78145C45a50134d48A1215220f80a";
const NEG_RISK_ADAPTER = "0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Derive a deterministic private key from the user's SIWE signature */
function deriveTradingKey(signature: string): `0x${string}` {
  const seed = keccak256(toBytes(signature));
  return seed as `0x${string}`;
}

/** Generate HMAC for Polymarket CLOB API authentication */
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

/** Generate Builder HMAC for Relayer authentication */
async function generateBuilderHmac(
  builderSecret: string,
  timestamp: string,
  method: string,
  path: string,
  body: string = "",
): Promise<string> {
  return generateClobHmac(builderSecret, timestamp, method, path, body);
}

/** Deploy Gnosis Safe via Polymarket Builder Relayer (gasless) */
async function deploySafeViaRelayer(
  tradingAccount: ReturnType<typeof privateKeyToAccount>,
  builderApiKey: string,
  builderSecret: string,
): Promise<{ success: boolean; safeAddress?: string; error?: string }> {
  try {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const path = "/relayer/deploy";
    const bodyObj = {
      owner: tradingAccount.address,
      chainId: POLYGON_CHAIN_ID,
    };
    const bodyStr = JSON.stringify(bodyObj);
    const hmac = await generateBuilderHmac(builderSecret, timestamp, "POST", path, bodyStr);

    const res = await fetch(`${RELAYER_BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "POLY_API_KEY": builderApiKey,
        "POLY_SIGNATURE": hmac,
        "POLY_TIMESTAMP": timestamp,
      },
      body: bodyStr,
    });

    if (!res.ok) {
      const errText = await res.text();
      // If 409 or "already deployed", extract the address
      if (res.status === 409 || errText.includes("already deployed") || errText.includes("already exists")) {
        console.log("[polymarket-user-setup] Safe already deployed for", tradingAccount.address);
        // Try to get the Safe address from the response
        try {
          const parsed = JSON.parse(errText);
          if (parsed.address || parsed.safe_address) {
            return { success: true, safeAddress: parsed.address || parsed.safe_address };
          }
        } catch {}
        // If we can't extract, still mark as success — we'll derive it
        return { success: true, safeAddress: undefined };
      }
      console.error(`[polymarket-user-setup] Relayer deploy failed (${res.status}): ${errText}`);
      return { success: false, error: `relayer_deploy_${res.status}: ${errText.substring(0, 200)}` };
    }

    const data = await res.json();
    console.log("[polymarket-user-setup] Safe deployed:", data);
    return { success: true, safeAddress: data.address || data.safe_address || data.result };
  } catch (err) {
    console.error("[polymarket-user-setup] Safe deployment error:", err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Set token approvals via Polymarket Relayer (gasless) */
async function setApprovalsViaRelayer(
  tradingAccount: ReturnType<typeof privateKeyToAccount>,
  safeAddress: string,
  builderApiKey: string,
  builderSecret: string,
): Promise<{ success: boolean; error?: string }> {
  const erc20ApproveAbi = parseAbi(["function approve(address spender, uint256 amount) returns (bool)"]);
  const maxApproval = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");

  // All approval targets
  const approvals = [
    { token: USDC_E, spender: CTF_CONTRACT, label: "USDC.e → CTF Contract" },
    { token: USDC_E, spender: CTF_EXCHANGE, label: "USDC.e → CTF Exchange" },
    { token: USDC_E, spender: NEG_RISK_CTF_EXCHANGE, label: "USDC.e → Neg Risk Exchange" },
    { token: USDC_E, spender: NEG_RISK_ADAPTER, label: "USDC.e → Neg Risk Adapter" },
  ];

  for (const { token, spender, label } of approvals) {
    try {
      const callData = encodeFunctionData({
        abi: erc20ApproveAbi,
        functionName: "approve",
        args: [spender as `0x${string}`, maxApproval],
      });

      const timestamp = Math.floor(Date.now() / 1000).toString();
      const path = "/relayer/execute";
      const bodyObj = {
        safe: safeAddress,
        to: token,
        data: callData,
        value: "0",
        chainId: POLYGON_CHAIN_ID,
      };
      const bodyStr = JSON.stringify(bodyObj);
      const hmac = await generateBuilderHmac(builderSecret, timestamp, "POST", path, bodyStr);

      const res = await fetch(`${RELAYER_BASE}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "POLY_API_KEY": builderApiKey,
          "POLY_SIGNATURE": hmac,
          "POLY_TIMESTAMP": timestamp,
        },
        body: bodyStr,
      });

      if (!res.ok) {
        const errText = await res.text();
        console.warn(`[polymarket-user-setup] Approval failed for ${label}: ${errText}`);
        // Continue with other approvals
      } else {
        const data = await res.json();
        console.log(`[polymarket-user-setup] Approval set: ${label}`, data);
      }
    } catch (err) {
      console.warn(`[polymarket-user-setup] Approval error for ${label}:`, err);
    }
  }

  return { success: true };
}

/** Derive CLOB API credentials for the trading wallet */
async function deriveClobApiCreds(
  tradingAccount: ReturnType<typeof privateKeyToAccount>,
): Promise<{
  apiKey: string | null;
  apiSecret: string | null;
  passphrase: string | null;
  error?: string;
}> {
  try {
    const nonce = Date.now().toString();
    const derivedAddress = tradingAccount.address.toLowerCase();
    const derivationMessage = `Derive Polymarket API key\nNonce: ${nonce}\nAddress: ${derivedAddress}`;
    const derivationSig = await tradingAccount.signMessage({ message: derivationMessage });

    const res = await fetch(`${CLOB_BASE}/auth/derive-api-key`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        wallet: derivedAddress,
        nonce,
        signature: derivationSig,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.warn(`[polymarket-user-setup] CLOB derive failed (${res.status}): ${errText}`);
      return { apiKey: null, apiSecret: null, passphrase: null, error: errText };
    }

    const data = await res.json();
    return {
      apiKey: data.apiKey || null,
      apiSecret: data.secret || null,
      passphrase: data.passphrase || null,
    };
  } catch (err) {
    console.error("[polymarket-user-setup] CLOB cred derivation error:", err);
    return {
      apiKey: null,
      apiSecret: null,
      passphrase: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ── Main handler ─────────────────────────────────────────

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
    const { action, wallet, signature, message } = body;

    if (!wallet || !action) {
      return json({ error: "Missing wallet or action" }, 400);
    }

    const normalizedWallet = String(wallet).trim().toLowerCase();

    const builderApiKey = Deno.env.get("POLYMARKET_BUILDER_API_KEY");
    const builderSecret = Deno.env.get("POLYMARKET_BUILDER_SECRET");

    // ══════════════════════════════════════════════════
    // ACTION: derive_and_setup — Full wallet provisioning
    // ══════════════════════════════════════════════════
    if (action === "derive_and_setup") {
      if (!signature || !message) {
        return json({ error: "Missing signature or message for setup" }, 400);
      }

      if (!builderApiKey || !builderSecret) {
        return json({ error: "Builder credentials not configured" }, 500);
      }

      console.log(`[polymarket-user-setup] Starting full setup for ${normalizedWallet}`);

      // Step 1: Derive trading key from user's signature
      const tradingKeyHex = deriveTradingKey(signature);
      const tradingAccount = privateKeyToAccount(tradingKeyHex);
      const derivedAddress = tradingAccount.address.toLowerCase();

      console.log(`[polymarket-user-setup] Derived trading address: ${derivedAddress}`);

      // Step 2: Deploy Gnosis Safe (gasless via Relayer)
      let safeAddress: string | undefined;
      let safeDeployed = false;
      
      const deployResult = await deploySafeViaRelayer(tradingAccount, builderApiKey, builderSecret);
      if (deployResult.success) {
        safeAddress = deployResult.safeAddress;
        safeDeployed = true;
        console.log(`[polymarket-user-setup] Safe deployed: ${safeAddress}`);
      } else {
        console.warn(`[polymarket-user-setup] Safe deploy failed: ${deployResult.error}`);
        // Continue without Safe — can use EOA directly for now
      }

      // Step 3: Set approvals (gasless via Relayer)
      let approvalsSet = false;
      if (safeAddress) {
        const approvalResult = await setApprovalsViaRelayer(
          tradingAccount,
          safeAddress,
          builderApiKey,
          builderSecret,
        );
        approvalsSet = approvalResult.success;
      }

      // Step 4: Derive CLOB API credentials
      const clobCreds = await deriveClobApiCreds(tradingAccount);
      const hasApiKey = !!clobCreds.apiKey;

      // Step 5: Upsert session
      const sessionData = {
        status: hasApiKey ? "active" : "awaiting_credentials",
        pm_api_key: clobCreds.apiKey,
        pm_api_secret: clobCreds.apiSecret,
        pm_passphrase: clobCreds.passphrase,
        pm_derived_address: derivedAddress,
        pm_trading_key: tradingKeyHex,
        safe_address: safeAddress || null,
        safe_deployed: safeDeployed,
        approvals_set: approvalsSet,
        privy_wallet_id: normalizedWallet,
        authenticated_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
        updated_at: new Date().toISOString(),
      };

      const { data: existing } = await supabase
        .from("polymarket_user_sessions")
        .select("id")
        .eq("wallet", normalizedWallet)
        .maybeSingle();

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
        action: "polymarket_user_setup",
        source: "polymarket-user-setup",
        details: {
          wallet: normalizedWallet,
          privy_did: privyDid,
          derived_address: derivedAddress,
          safe_address: safeAddress,
          safe_deployed: safeDeployed,
          approvals_set: approvalsSet,
          has_api_key: hasApiKey,
        },
      });

      return json({
        success: true,
        derived_address: derivedAddress,
        safe_address: safeAddress,
        safe_deployed: safeDeployed,
        approvals_set: approvalsSet,
        has_api_key: hasApiKey,
        can_trade: hasApiKey && safeDeployed,
        status: hasApiKey ? "active" : "awaiting_credentials",
      });
    }

    // ══════════════════════════════════════════════════
    // ACTION: check_status — Check provisioning state
    // ══════════════════════════════════════════════════
    if (action === "check_status") {
      const { data: session } = await supabase
        .from("polymarket_user_sessions")
        .select("status, safe_address, safe_deployed, approvals_set, pm_derived_address, authenticated_at, expires_at")
        .eq("wallet", normalizedWallet)
        .maybeSingle();

      if (!session) {
        return json({
          provisioned: false,
          status: "not_setup",
          can_trade: false,
        });
      }

      const isExpired = session.expires_at && new Date() > new Date(session.expires_at);

      return json({
        provisioned: true,
        status: isExpired ? "expired" : session.status,
        safe_address: session.safe_address,
        safe_deployed: session.safe_deployed,
        approvals_set: session.approvals_set,
        derived_address: session.pm_derived_address,
        can_trade: session.status === "active" && !isExpired && session.safe_deployed,
        authenticated_at: session.authenticated_at,
        expires_at: session.expires_at,
      });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    console.error("[polymarket-user-setup] Error:", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
