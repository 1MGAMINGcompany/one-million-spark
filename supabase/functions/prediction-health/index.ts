import { privateKeyToAccount } from "npm:viem@2/accounts";

/**
 * prediction-health — Diagnostic endpoint for the prediction relayer & CLOB.
 *
 * Returns:
 *  - relayer derived address vs hardcoded TREASURY_WALLET
 *  - relayer MATIC balance
 *  - Polymarket CLOB connectivity
 *  - PM trading key derived address
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TREASURY_WALLET = "0x72F3AA1B3B0815033AD6037edC1586dE592Ed88d";
const POLYGON_RPCS = [
  "https://polygon-bor-rpc.publicnode.com",
  "https://polygon.drpc.org",
  "https://rpc.ankr.com/polygon",
];

async function getMaticBalance(address: string): Promise<{ balance: string | null; error?: string }> {
  for (const rpc of POLYGON_RPCS) {
    try {
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_getBalance",
          params: [address, "latest"],
        }),
      });
      if (!res.ok) continue;
      const json = await res.json();
      if (json.error) continue;
      if (json.result) {
        const wei = BigInt(json.result);
        const matic = Number(wei) / 1e18;
        return { balance: matic.toFixed(6) };
      }
    } catch {
      continue;
    }
  }
  return { balance: null, error: "all_rpcs_failed" };
}

async function testClobConnectivity(): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("https://clob.polymarket.com/time", { method: "GET" });
    if (res.ok) return { ok: true };
    return { ok: false, error: `status_${res.status}` };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const diagnostics: Record<string, unknown> = {
    ts: new Date().toISOString(),
    treasury_wallet_hardcoded: TREASURY_WALLET,
  };

  // 1. Derive relayer address
  const relayerKey = Deno.env.get("FEE_RELAYER_PRIVATE_KEY");
  if (relayerKey) {
    try {
      const account = privateKeyToAccount(relayerKey as `0x${string}`);
      diagnostics.relayer_derived_address = account.address;
      diagnostics.relayer_matches_treasury =
        account.address.toLowerCase() === TREASURY_WALLET.toLowerCase();

      // 2. Check MATIC balance
      const bal = await getMaticBalance(account.address);
      diagnostics.relayer_matic_balance = bal.balance;
      diagnostics.relayer_matic_error = bal.error ?? null;
      diagnostics.relayer_has_gas = bal.balance ? parseFloat(bal.balance) > 0.001 : false;
    } catch (e: any) {
      diagnostics.relayer_error = e.message;
    }
  } else {
    diagnostics.relayer_error = "FEE_RELAYER_PRIVATE_KEY not set";
  }

  // 3. Derive PM trading key address
  const pmKey = Deno.env.get("PM_TRADING_KEY");
  if (pmKey) {
    try {
      const pmAccount = privateKeyToAccount(pmKey as `0x${string}`);
      diagnostics.pm_trading_derived_address = pmAccount.address;
    } catch (e: any) {
      diagnostics.pm_trading_error = e.message;
    }
  } else {
    diagnostics.pm_trading_error = "PM_TRADING_KEY not set";
  }

  // 4. Test CLOB connectivity
  const clob = await testClobConnectivity();
  diagnostics.clob_reachable = clob.ok;
  diagnostics.clob_error = clob.error ?? null;

  // 5. Check PM API credentials exist
  diagnostics.has_pm_api_key = !!Deno.env.get("PM_API_KEY");
  diagnostics.has_pm_api_secret = !!Deno.env.get("PM_API_SECRET");
  diagnostics.has_pm_passphrase = !!Deno.env.get("PM_PASSPHRASE");

  return new Response(JSON.stringify(diagnostics, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
