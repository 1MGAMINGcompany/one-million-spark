const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function base64ToUint8Array(b64: string): Uint8Array {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

function uint8ArrayToBase64(arr: Uint8Array): string {
  let bin = "";
  for (const b of arr) bin += String.fromCharCode(b);
  return btoa(bin);
}

function buildHeaders(apiKey: string, secret: string, passphrase: string, timestamp: string, method: string, path: string, body: string = "") {
  const message = timestamp + method + path + body;
  const hmac = createHmac("sha256", Buffer.from(secret, "base64"));
  hmac.update(message);
  const signature = hmac.digest("base64");

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

  // 2. Test authenticated GET to CLOB API
  try {
    const timestamp = (Math.floor(Date.now() / 1000)).toString();
    const path = "/ak/nonce";
    const method = "GET";

    const authHeaders = buildHeaders(apiKey, apiSecret, passphrase, timestamp, method, path);

    const resp = await fetch(`https://clob.polymarket.com${path}`, {
      method,
      headers: {
        ...authHeaders,
        "Content-Type": "application/json",
      },
    });

    const body = await resp.text();
    results.clob_nonce_check = {
      status: resp.status,
      ok: resp.ok,
      body: body.substring(0, 500),
    };
  } catch (err: any) {
    results.clob_nonce_check = { error: err.message };
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
  const clobOk = (results.clob_nonce_check as any)?.ok === true;
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
