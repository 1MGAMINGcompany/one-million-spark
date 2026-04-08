import { createClient } from "@supabase/supabase-js";
import { privateKeyToAccount } from "npm:viem@2/accounts";
import { createWalletClient, http, encodeFunctionData, parseAbi, keccak256, toBytes, hashTypedData } from "npm:viem@2";
import { polygon } from "npm:viem@2/chains";

/**
 * polymarket-user-setup — Per-user Polymarket trading wallet provisioning.
 *
 * V2 PROXY Architecture (April 2026):
 * 1. User signs a deterministic SIWE message (client-side, one-time)
 * 2. Server derives a per-user trading key from that signature
 * 3. Server derives CLOB API credentials for the user
 * 4. Safe deployment + approvals happen automatically on first trade (V2 PROXY)
 * 5. Everything stored in polymarket_user_sessions
 *
 * Actions:
 *   - derive_and_setup: Derive key + CLOB creds (no relayer calls needed)
 *   - check_status: Check if user's trading wallet is fully provisioned
 *   - withdraw: Move USDC.e from derived wallet back to user
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-privy-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CLOB_BASE = "https://clob.polymarket.com";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function normalizeWallet(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length >= 10 ? normalized : null;
}

function isSessionTradeReady(session: {
  status?: string | null;
  safe_deployed?: boolean | null;
  approvals_set?: boolean | null;
  pm_api_key?: string | null;
  pm_api_secret?: string | null;
  pm_passphrase?: string | null;
  pm_trading_key?: string | null;
  expires_at?: string | null;
} | null | undefined): boolean {
  if (!session) return false;
  const isExpired = session.expires_at
    ? new Date(session.expires_at).getTime() < Date.now()
    : false;

  return session.status === "active" &&
    !!session.safe_deployed &&
    !!session.approvals_set &&
    !!session.pm_api_key &&
    !!session.pm_api_secret &&
    !!session.pm_passphrase &&
    !!session.pm_trading_key &&
    !isExpired;
}

async function logSetupEvent(
  supabase: ReturnType<typeof createClient>,
  action: string,
  details: Record<string, unknown>,
) {
  try {
    await supabase.from("automation_logs").insert({
      action,
      source: "polymarket-user-setup",
      details,
    });
  } catch (error) {
    console.warn("[polymarket-user-setup] log insert failed:", error);
  }
}

async function resolveCanonicalWallet(
  supabase: ReturnType<typeof createClient>,
  privyDid: string,
  requestedAppWallet: string | null,
  requestedWallet: string | null,
  requestedEoaWallet: string | null,
): Promise<{ wallet: string | null; accountId: string | null }> {
  const preferredWallet = requestedAppWallet ?? requestedWallet ?? requestedEoaWallet;

  let account: { id: string; wallet_evm: string | null; privy_did: string | null } | null = null;
  const { data: didAccount } = await supabase
    .from("prediction_accounts")
    .select("id, wallet_evm, privy_did")
    .eq("privy_did", privyDid)
    .maybeSingle();
  account = didAccount;

  if (!account && preferredWallet) {
    const { data: walletAccount } = await supabase
      .from("prediction_accounts")
      .select("id, wallet_evm, privy_did")
      .eq("wallet_evm", preferredWallet)
      .maybeSingle();
    account = walletAccount;
  }

  const canonicalWallet = account?.wallet_evm
    ? String(account.wallet_evm).trim().toLowerCase()
    : preferredWallet;

  if (!canonicalWallet) {
    return { wallet: null, accountId: account?.id ?? null };
  }

  if (account) {
    const updatePayload: Record<string, unknown> = {
      last_active_at: new Date().toISOString(),
      auth_provider: "privy",
    };

    if (!account.wallet_evm) updatePayload.wallet_evm = canonicalWallet;
    if (account.privy_did !== privyDid) updatePayload.privy_did = privyDid;

    const { error } = await supabase
      .from("prediction_accounts")
      .update(updatePayload)
      .eq("id", account.id);

    if (error) {
      throw new Error(`prediction_account_update_failed: ${error.message}`);
    }

    return { wallet: canonicalWallet, accountId: account.id };
  }

  const { data: created, error } = await supabase
    .from("prediction_accounts")
    .insert({
      wallet_evm: canonicalWallet,
      privy_did: privyDid,
      auth_provider: "privy",
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`prediction_account_insert_failed: ${error.message}`);
  }

  return { wallet: canonicalWallet, accountId: created?.id ?? null };
}

/** Derive a deterministic private key from the user's SIWE signature */
function deriveTradingKey(signature: string): `0x${string}` {
  const seed = keccak256(toBytes(signature));
  return seed as `0x${string}`;
}

/** Build EIP-712 ClobAuth signature for L1 authentication */
async function buildClobAuthHeaders(
  tradingAccount: ReturnType<typeof privateKeyToAccount>,
  nonce = 0,
): Promise<Record<string, string>> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const address = tradingAccount.address;

  const domain = {
    name: "ClobAuthDomain" as const,
    version: "1" as const,
    chainId: 137,
  };

  const types = {
    ClobAuth: [
      { name: "address", type: "address" },
      { name: "timestamp", type: "string" },
      { name: "nonce", type: "uint256" },
      { name: "message", type: "string" },
    ],
  } as const;

  const message = {
    address,
    timestamp,
    nonce: BigInt(nonce),
    message: "This message attests that I control the given wallet",
  };

  const signature = await tradingAccount.signTypedData({
    domain,
    types,
    primaryType: "ClobAuth",
    message,
  });

  return {
    POLY_ADDRESS: address,
    POLY_SIGNATURE: signature,
    POLY_TIMESTAMP: timestamp,
    POLY_NONCE: nonce.toString(),
  };
}

/** Derive CLOB API credentials for the trading wallet using L1 EIP-712 auth */
async function deriveClobApiCreds(
  tradingAccount: ReturnType<typeof privateKeyToAccount>,
): Promise<{
  apiKey: string | null;
  apiSecret: string | null;
  passphrase: string | null;
  error?: string;
}> {
  try {
    // Step 1: Try GET /auth/derive-api-key (retrieves existing creds)
    const headers = await buildClobAuthHeaders(tradingAccount, 0);

    let res = await fetch(`${CLOB_BASE}/auth/derive-api-key`, {
      method: "GET",
      headers,
    });

    // Step 2: If no creds exist yet (404), create them with POST /auth/api-key
    if (res.status === 404) {
      await res.text(); // consume body
      console.log("[polymarket-user-setup] No existing creds, creating via POST /auth/api-key");
      const createHeaders = await buildClobAuthHeaders(tradingAccount, 0);
      res = await fetch(`${CLOB_BASE}/auth/api-key`, {
        method: "POST",
        headers: createHeaders,
      });
    }

    if (!res.ok) {
      const errText = await res.text();
      console.warn(`[polymarket-user-setup] CLOB cred derivation failed (${res.status}): ${errText}`);
      return { apiKey: null, apiSecret: null, passphrase: null, error: `${res.status}: ${errText}` };
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
    const { action, wallet, app_wallet, eoa_wallet, signature, message } = body;

    if (!action) {
      return json({ error: "Missing action" }, 400);
    }

    const requestedWallet = normalizeWallet(wallet);
    const requestedAppWallet = normalizeWallet(app_wallet);
    const requestedEoaWallet = normalizeWallet(eoa_wallet);

    const { wallet: normalizedWallet } = await resolveCanonicalWallet(
      supabase,
      privyDid,
      requestedAppWallet,
      requestedWallet,
      requestedEoaWallet,
    );

    if (!normalizedWallet) {
      return json({ error: "Missing wallet for setup" }, 400);
    }

    // ══════════════════════════════════════════════════
    // ACTION: derive_and_setup — V2 PROXY wallet provisioning
    // No relayer deploy/approve calls needed — V2 auto-handles on first trade
    // ══════════════════════════════════════════════════
    if (action === "derive_and_setup") {
      if (!signature || !message) {
        return json({ error: "Missing signature or message for setup" }, 400);
      }

      console.log(`[polymarket-user-setup] Starting V2 PROXY setup for ${normalizedWallet}`);
      await logSetupEvent(supabase, "polymarket_user_setup_started", {
        wallet: normalizedWallet,
        privy_did: privyDid,
        flow: "v2_proxy",
        requested_wallet: requestedWallet,
        requested_app_wallet: requestedAppWallet,
        requested_eoa_wallet: requestedEoaWallet,
      });

      // Step 1: Derive trading key from user's signature
      const tradingKeyHex = deriveTradingKey(signature);
      const tradingAccount = privateKeyToAccount(tradingKeyHex);
      const derivedAddress = tradingAccount.address.toLowerCase();

      console.log(`[polymarket-user-setup] Derived trading address: ${derivedAddress}`);

      // Step 2: Derive CLOB API credentials
      const clobCreds = await deriveClobApiCreds(tradingAccount);
      const hasApiKey = !!clobCreds.apiKey;
      if (!hasApiKey || !clobCreds.apiSecret || !clobCreds.passphrase) {
        await logSetupEvent(supabase, "polymarket_user_setup_failed", {
          wallet: normalizedWallet,
          privy_did: privyDid,
          stage: "clob_credentials",
          error: clobCreds.error,
          derived_address: derivedAddress,
        });
        return json({
          error: "Trading wallet credential derivation failed",
          error_code: "clob_credentials_failed",
          stage: "clob_credentials",
          detail: clobCreds.error,
        }, 502);
      }

      // Step 3: Upsert session — mark safe_deployed + approvals_set = true
      // V2 PROXY handles Safe deployment and token approvals automatically on first trade
      const sessionData = {
        status: "active",
        pm_api_key: clobCreds.apiKey,
        pm_api_secret: clobCreds.apiSecret,
        pm_passphrase: clobCreds.passphrase,
        pm_derived_address: derivedAddress,
        pm_trading_key: tradingKeyHex,
        safe_address: null, // V2 PROXY creates this on first trade
        safe_deployed: true, // Optimistic — V2 auto-deploys
        approvals_set: true, // Optimistic — V2 auto-approves
        privy_wallet_id: requestedEoaWallet ?? requestedAppWallet ?? normalizedWallet,
        authenticated_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { data: existing, error: existingError } = await supabase
        .from("polymarket_user_sessions")
        .select("id")
        .eq("wallet", normalizedWallet)
        .maybeSingle();

      if (existingError) {
        return json({
          error: "Trading wallet session lookup failed",
          error_code: "session_save_failed",
          detail: existingError.message,
        }, 500);
      }

      if (existing) {
        const { error } = await supabase
          .from("polymarket_user_sessions")
          .update(sessionData)
          .eq("id", existing.id);
        if (error) {
          return json({
            error: "Trading wallet session could not be saved",
            error_code: "session_save_failed",
            detail: error.message,
          }, 500);
        }
      } else {
        const { error } = await supabase
          .from("polymarket_user_sessions")
          .insert({ wallet: normalizedWallet, ...sessionData });
        if (error) {
          return json({
            error: "Trading wallet session could not be saved",
            error_code: "session_save_failed",
            detail: error.message,
          }, 500);
        }
      }

      await logSetupEvent(supabase, "polymarket_user_setup", {
        wallet: normalizedWallet,
        privy_did: privyDid,
        derived_address: derivedAddress,
        flow: "v2_proxy",
        safe_deployed: true,
        approvals_set: true,
        has_api_key: hasApiKey,
      });

      console.log(`[polymarket-user-setup] V2 PROXY setup complete for ${normalizedWallet}`);

      return json({
        success: true,
        provisioned: true,
        resolved_wallet: normalizedWallet,
        derived_address: derivedAddress,
        safe_address: null,
        safe_deployed: true,
        approvals_set: true,
        has_api_key: hasApiKey,
        can_trade: true,
        status: "active",
      });
    }

    // ══════════════════════════════════════════════════
    // ACTION: check_status — Check provisioning state
    // ══════════════════════════════════════════════════
    if (action === "check_status") {
      const { data: session } = await supabase
        .from("polymarket_user_sessions")
        .select("status, safe_address, safe_deployed, approvals_set, pm_derived_address, authenticated_at, expires_at, pm_api_key, pm_api_secret, pm_passphrase, pm_trading_key")
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
        can_trade: isSessionTradeReady(session),
        authenticated_at: session.authenticated_at,
        expires_at: session.expires_at,
      });
    }

    // ══════════════════════════════════════════════════
    // ACTION: withdraw — Move USDC.e from derived wallet back to user
    // ══════════════════════════════════════════════════
    if (action === "withdraw") {
      const { data: session } = await supabase
        .from("polymarket_user_sessions")
        .select("pm_trading_key, safe_address, pm_derived_address, status")
        .eq("wallet", normalizedWallet)
        .maybeSingle();

      if (!session || !session.pm_trading_key) {
        return json({ error: "No trading wallet found" }, 404);
      }

      const tradingAccount = privateKeyToAccount(session.pm_trading_key as `0x${string}`);
      const sourceAddress = session.safe_address || tradingAccount.address;

      const USDC_E_CONTRACT = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
      const balanceSelector = "0x70a08231";
      const paddedAddr = sourceAddress.slice(2).toLowerCase().padStart(64, "0");
      const balCallData = balanceSelector + paddedAddr;

      let balanceRaw = 0n;
      const rpcs = [
        "https://polygon-bor-rpc.publicnode.com",
        "https://polygon.drpc.org",
        "https://rpc.ankr.com/polygon",
      ];

      for (const rpc of rpcs) {
        try {
          const res = await fetch(rpc, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0", id: 1,
              method: "eth_call",
              params: [{ to: USDC_E_CONTRACT, data: balCallData }, "latest"],
            }),
          });
          if (!res.ok) continue;
          const data = await res.json();
          if (data.result) {
            balanceRaw = BigInt(data.result);
            break;
          }
        } catch { continue; }
      }

      if (balanceRaw <= 0n) {
        return json({ success: true, withdrawn: 0, message: "No balance to withdraw" });
      }

      try {
        const transferAbi = parseAbi(["function transfer(address to, uint256 amount) returns (bool)"]);
        const txData = encodeFunctionData({
          abi: transferAbi,
          functionName: "transfer",
          args: [normalizedWallet as `0x${string}`, balanceRaw],
        });

        let workingRpc = rpcs[0];
        let gasPrice = 30_000_000_000n;
        let nonce = 0;

        for (const rpc of rpcs) {
          try {
            const [gpRes, ncRes] = await Promise.all([
              fetch(rpc, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_gasPrice", params: [] }),
              }),
              fetch(rpc, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "eth_getTransactionCount", params: [tradingAccount.address, "latest"] }),
              }),
            ]);
            if (gpRes.ok && ncRes.ok) {
              const gpData = await gpRes.json();
              const ncData = await ncRes.json();
              if (gpData.result && ncData.result) {
                gasPrice = BigInt(gpData.result);
                nonce = Number(BigInt(ncData.result));
                workingRpc = rpc;
                break;
              }
            }
          } catch { continue; }
        }

        const walletClient = createWalletClient({
          account: tradingAccount,
          chain: polygon,
          transport: http(workingRpc),
        });

        const txHash = await walletClient.sendTransaction({
          to: USDC_E_CONTRACT as `0x${string}`,
          data: txData,
          gas: 100_000n,
          gasPrice: gasPrice * 12n / 10n,
          nonce,
          value: 0n,
        });

        const withdrawnUsdc = Number(balanceRaw) / 1e6;

        await supabase.from("automation_logs").insert({
          action: "polymarket_withdraw",
          source: "polymarket-user-setup",
          details: {
            wallet: normalizedWallet,
            derived_address: sourceAddress,
            amount_usdc: withdrawnUsdc,
            tx_hash: txHash,
          },
        });

        console.log(`[polymarket-user-setup] Withdrawal: ${withdrawnUsdc} USDC.e from ${sourceAddress} → ${normalizedWallet}, tx=${txHash}`);

        return json({
          success: true,
          withdrawn_usdc: withdrawnUsdc,
          tx_hash: txHash,
          from: sourceAddress,
          to: normalizedWallet,
        });
      } catch (err) {
        console.error("[polymarket-user-setup] Withdrawal failed:", err);
        return json({
          error: "Withdrawal failed",
          detail: err instanceof Error ? err.message : String(err),
        }, 500);
      }
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    console.error("[polymarket-user-setup] Error:", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
