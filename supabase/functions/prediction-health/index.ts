import { privateKeyToAccount } from "npm:viem@2/accounts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TREASURY_WALLET = "0x72F3AA1B3B0815033AD6037edC1586dE592Ed88d";
// Bridged USDC.e — canonical token for all prediction money flows
const USDC_E_CONTRACT = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
// Native USDC — only for balance diagnostics, NOT used in money flow
const NATIVE_USDC_CONTRACT = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
const CTF_EXCHANGE = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045";

const POLYGON_RPCS = [
  "https://polygon-bor-rpc.publicnode.com",
  "https://polygon.drpc.org",
  "https://rpc.ankr.com/polygon",
];

function padAddress(addr: string): string {
  return addr.slice(2).toLowerCase().padStart(64, "0");
}

async function getMaticBalance(address: string): Promise<{ balance: string | null; error?: string }> {
  for (const rpc of POLYGON_RPCS) {
    try {
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [address, "latest"] }),
      });
      if (!res.ok) continue;
      const json = await res.json();
      if (json.error || !json.result) continue;
      return { balance: (Number(BigInt(json.result)) / 1e18).toFixed(6) };
    } catch { continue; }
  }
  return { balance: null, error: "all_rpcs_failed" };
}

async function getErc20Balance(address: string, token: string): Promise<{ balance: string | null; error?: string }> {
  const data = "0x70a08231" + padAddress(address);
  for (const rpc of POLYGON_RPCS) {
    try {
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: token, data }, "latest"] }),
      });
      if (!res.ok) continue;
      const json = await res.json();
      if (json.error || !json.result) continue;
      return { balance: (Number(BigInt(json.result)) / 1e6).toFixed(2) };
    } catch { continue; }
  }
  return { balance: null, error: "all_rpcs_failed" };
}

async function getErc20Allowance(owner: string, spender: string, token: string): Promise<{ allowance: string | null; error?: string }> {
  const data = "0xdd62ed3e" + padAddress(owner) + padAddress(spender);
  for (const rpc of POLYGON_RPCS) {
    try {
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: token, data }, "latest"] }),
      });
      if (!res.ok) continue;
      const json = await res.json();
      if (json.error || !json.result) continue;
      return { allowance: (Number(BigInt(json.result)) / 1e6).toFixed(2) };
    } catch { continue; }
  }
  return { allowance: null, error: "all_rpcs_failed" };
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

  // 1. Derive relayer address + balance
  const relayerKey = Deno.env.get("FEE_RELAYER_PRIVATE_KEY");
  if (relayerKey) {
    try {
      const account = privateKeyToAccount(relayerKey as `0x${string}`);
      diagnostics.relayer_derived_address = account.address;
      diagnostics.relayer_matches_treasury = account.address.toLowerCase() === TREASURY_WALLET.toLowerCase();
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

  // 2. Derive PM trading key + balances + allowance
  const pmKey = Deno.env.get("PM_TRADING_KEY");
  if (pmKey) {
    try {
      const pmAccount = privateKeyToAccount((pmKey.startsWith("0x") ? pmKey : `0x${pmKey}`) as `0x${string}`);
      diagnostics.pm_trading_derived_address = pmAccount.address;

      const [usdceBal, nativeUsdcBal, polBal, ctfAllow] = await Promise.all([
        getErc20Balance(pmAccount.address, USDC_E_CONTRACT),
        getErc20Balance(pmAccount.address, NATIVE_USDC_CONTRACT),
        getMaticBalance(pmAccount.address),
        getErc20Allowance(pmAccount.address, CTF_EXCHANGE, USDC_E_CONTRACT),
      ]);

      diagnostics.pm_trading_usdce_balance = usdceBal.balance;
      diagnostics.pm_trading_usdce_error = usdceBal.error ?? null;
      diagnostics.pm_trading_native_usdc_balance = nativeUsdcBal.balance;
      diagnostics.pm_trading_native_usdc_error = nativeUsdcBal.error ?? null;
      diagnostics.pm_trading_pol_balance = polBal.balance;
      diagnostics.pm_trading_pol_error = polBal.error ?? null;
      diagnostics.pm_trading_ctf_allowance = ctfAllow.allowance;
      diagnostics.pm_trading_ctf_allowance_error = ctfAllow.error ?? null;
    } catch (e: any) {
      diagnostics.pm_trading_error = e.message;
    }
  } else {
    diagnostics.pm_trading_error = "PM_TRADING_KEY not set";
  }

  // 3. Test CLOB connectivity
  const clob = await testClobConnectivity();
  diagnostics.clob_reachable = clob.ok;
  diagnostics.clob_error = clob.error ?? null;

  // 4. Check PM API credentials exist
  diagnostics.has_pm_api_key = !!Deno.env.get("PM_API_KEY");
  diagnostics.has_pm_api_secret = !!Deno.env.get("PM_API_SECRET");
  diagnostics.has_pm_passphrase = !!Deno.env.get("PM_PASSPHRASE");

  // 5. Compute ready_to_buy
  const relayerHasGas = diagnostics.relayer_has_gas === true;
  const tradingHasUsdce = parseFloat((diagnostics.pm_trading_usdce_balance as string) ?? "0") > 1;
  const tradingHasPol = parseFloat((diagnostics.pm_trading_pol_balance as string) ?? "0") > 0.001;
  const ctfAllowanceOk = parseFloat((diagnostics.pm_trading_ctf_allowance as string) ?? "0") > 0;
  const clobOk = clob.ok;
  const credsOk = diagnostics.has_pm_api_key && diagnostics.has_pm_api_secret && diagnostics.has_pm_passphrase && !!pmKey;

  diagnostics.ready_to_buy = relayerHasGas && tradingHasUsdce && tradingHasPol && ctfAllowanceOk && clobOk && credsOk;
  diagnostics.readiness_detail = {
    relayer_has_gas: relayerHasGas,
    trading_has_usdce: tradingHasUsdce,
    trading_has_pol: tradingHasPol,
    ctf_allowance_set: ctfAllowanceOk,
    clob_reachable: clobOk,
    all_creds_set: credsOk,
  };

  return new Response(JSON.stringify(diagnostics, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
