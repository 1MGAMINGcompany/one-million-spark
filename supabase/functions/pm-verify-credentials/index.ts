import { ClobClient } from "npm:@polymarket/clob-client";
import { Wallet } from "npm:ethers@5.7.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CLOB_HOST = "https://clob.polymarket.com";
const CLOB_CHAIN_ID = 137;
const CLOB_SIGNATURE_TYPE = 1;
const CLOB_FUNDER = "0xeb51af6869298f56288671b00f2e04b1a0394e3d";

function base64ToUint8Array(b64: string): Uint8Array {
  // Handle URL-safe base64
  const std = b64.replace(/-/g, '+').replace(/_/g, '/');
  const padded = std + '='.repeat((4 - std.length % 4) % 4);
  const bin = atob(padded);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

function uint8ArrayToBase64(arr: Uint8Array): string {
  let bin = "";
  for (const b of arr) bin += String.fromCharCode(b);
  return btoa(bin);
}

async function buildHeaders(apiKey: string, secret: string, passphrase: string, timestamp: string, method: string, path: string, body: string = "") {
  const message = timestamp + method + path + body;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    base64ToUint8Array(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  const signature = uint8ArrayToBase64(new Uint8Array(sig));

  return {
    "POLY_API_KEY": apiKey,
    "POLY_PASSPHRASE": passphrase,
    "POLY_TIMESTAMP": timestamp,
    "POLY_SIGNATURE": signature,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const results: Record<string, unknown> = {};

  // 1. Check env vars exist
  const apiKey = Deno.env.get("PM_API_KEY");
  const apiSecret = Deno.env.get("PM_API_SECRET");
  const passphrase = Deno.env.get("PM_PASSPHRASE");
  const tradingKey = Deno.env.get("PM_TRADING_KEY");

  results.secrets_present = {
    PM_API_KEY: !!apiKey && apiKey.length > 0,
    PM_API_SECRET: !!apiSecret && apiSecret.length > 0,
    PM_PASSPHRASE: !!passphrase && passphrase.length > 0,
    PM_TRADING_KEY: !!tradingKey && tradingKey.length > 0,
    PM_API_KEY_length: apiKey?.length ?? 0,
    PM_API_SECRET_length: apiSecret?.length ?? 0,
    PM_PASSPHRASE_length: passphrase?.length ?? 0,
    PM_TRADING_KEY_length: tradingKey?.length ?? 0,
    PM_TRADING_KEY_starts_with_0x: tradingKey?.startsWith("0x") ?? false,
  };

  if (!apiKey || !apiSecret || !passphrase) {
    return new Response(JSON.stringify({
      ok: false,
      error: "Missing one or more CLOB secrets (PM_API_KEY, PM_API_SECRET, PM_PASSPHRASE)",
      results,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // 2. Test exact ClobClient initialization + authenticated getOpenOrders()
  try {
    const signer = new Wallet(tradingKey?.startsWith("0x") ? tradingKey : `0x${tradingKey}`);
    const apiCreds = {
      key: apiKey,
      secret: apiSecret,
      passphrase,
    };

    const runtimeDebug = {
      signer_address: signer.address,
      funder: CLOB_FUNDER,
      signatureType: CLOB_SIGNATURE_TYPE,
      chainId: CLOB_CHAIN_ID,
      creds_shape: {
        has_key: Object.prototype.hasOwnProperty.call(apiCreds, "key"),
        has_secret: Object.prototype.hasOwnProperty.call(apiCreds, "secret"),
        has_passphrase: Object.prototype.hasOwnProperty.call(apiCreds, "passphrase"),
        keys: Object.keys(apiCreds),
      },
    };

    console.log("[pm-verify-credentials] ClobClient runtime config", runtimeDebug);

    const client = new ClobClient(
      CLOB_HOST,
      CLOB_CHAIN_ID,
      signer,
      apiCreds,
      CLOB_SIGNATURE_TYPE,
      CLOB_FUNDER,
    );

    const openOrders = await client.getOpenOrders();
    results.clob_client_auth_test = {
      ok: true,
      signer_address: signer.address,
      funder: CLOB_FUNDER,
      signatureType: CLOB_SIGNATURE_TYPE,
      chainId: CLOB_CHAIN_ID,
      creds_shape: runtimeDebug.creds_shape,
      open_orders_count: Array.isArray(openOrders) ? openOrders.length : null,
      open_orders_preview: JSON.stringify(openOrders).substring(0, 500),
    };
  } catch (err: any) {
    const errorBody = err?.body ?? err?.response?.data ?? err?.response?.body ?? err?.message ?? String(err);
    results.clob_client_auth_test = {
      ok: false,
      signer_address: tradingKey
        ? new Wallet(tradingKey.startsWith("0x") ? tradingKey : `0x${tradingKey}`).address
        : null,
      funder: CLOB_FUNDER,
      signatureType: CLOB_SIGNATURE_TYPE,
      chainId: CLOB_CHAIN_ID,
      creds_shape: {
        has_key: true,
        has_secret: true,
        has_passphrase: true,
        keys: ["key", "secret", "passphrase"],
      },
      error: typeof errorBody === "string" ? errorBody.substring(0, 1000) : JSON.stringify(errorBody).substring(0, 1000),
    };
  }

  // 3. Test unauthenticated market fetch (sanity)
  try {
    const resp = await fetch("https://clob.polymarket.com/markets?limit=1");
    const body = await resp.text();
    results.clob_markets_public = {
      status: resp.status,
      ok: resp.ok,
      body_preview: body.substring(0, 200),
    };
  } catch (err: any) {
    results.clob_markets_public = { error: err.message };
  }

  // 4. Validate trading key format
  if (tradingKey) {
    const clean = tradingKey.startsWith("0x") ? tradingKey.slice(2) : tradingKey;
    const isValidHex = /^[0-9a-fA-F]{64}$/.test(clean);
    results.trading_key_format = {
      is_valid_hex_64: isValidHex,
      note: isValidHex
        ? "Looks like a valid 32-byte hex private key"
        : `Expected 64 hex chars, got ${clean.length} chars. Ensure this is a raw hex private key, not a mnemonic or API key.`,
    };
  }

  const allSecretsPresent = Object.values(results.secrets_present as Record<string, unknown>)
    .filter((_, i) => i < 4)
    .every(Boolean);
  const clobOk = (results.clob_client_auth_test as any)?.ok === true;
  const keyOk = (results.trading_key_format as any)?.is_valid_hex_64 === true;

  return new Response(JSON.stringify({
    ok: allSecretsPresent && clobOk && keyOk,
    summary: {
      all_secrets_set: allSecretsPresent,
      clob_auth_works: clobOk,
      trading_key_valid: keyOk,
    },
    results,
  }, null, 2), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
