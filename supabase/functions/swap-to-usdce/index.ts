/**
 * swap-to-usdce — Uses 0x Swap API to convert Native USDC → USDC.e on Polygon.
 *
 * Actions:
 *   quote  — get a swap quote (price + calldata)
 *   price  — lighter price-only check
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const USDC_NATIVE = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
const USDC_BRIDGED = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
const CHAIN_ID = 137;

/** Safely parse a fetch response as JSON, returning null + logging on failure */
async function safeJsonParse(res: Response, label: string): Promise<{ data: any; raw: string } | null> {
  const raw = await res.text();
  console.log(`[swap-to-usdce] ${label} response status:`, res.status, "body:", raw.slice(0, 200));
  try {
    return { data: JSON.parse(raw), raw };
  } catch {
    console.error(`[swap-to-usdce] ${label} returned non-JSON:`, raw.slice(0, 200));
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ZEROX_API_KEY = Deno.env.get("ZEROX_API_KEY");
    if (!ZEROX_API_KEY) throw new Error("ZEROX_API_KEY not configured");

    const { action, wallet_address, amount_usdc } = await req.json();

    if (!wallet_address || !amount_usdc) {
      return new Response(
        JSON.stringify({ error: "wallet_address and amount_usdc required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sellAmount = BigInt(Math.floor(amount_usdc * 1e6)).toString();

    const apiHeaders = {
      "0x-api-key": ZEROX_API_KEY,
      "Content-Type": "application/json",
    };

    if (action === "quote") {
      const params = new URLSearchParams({
        chainId: String(CHAIN_ID),
        sellToken: USDC_NATIVE,
        buyToken: USDC_BRIDGED,
        sellAmount,
        taker: wallet_address,
      });

      // Try permit2 endpoint first
      const permit2Url = `https://api.0x.org/swap/permit2/quote?${params}`;
      console.log("[swap-to-usdce] 0x request:", permit2Url);

      const res = await fetch(permit2Url, { headers: apiHeaders });
      const parsed = await safeJsonParse(res, "permit2/quote");

      if (!parsed) {
        // Non-JSON response — try v1 fallback for diagnostics
        const v1Url = `https://api.0x.org/swap/v1/quote?${params}`;
        console.log("[swap-to-usdce] Trying v1 fallback:", v1Url);
        const v1Res = await fetch(v1Url, { headers: apiHeaders });
        const v1Parsed = await safeJsonParse(v1Res, "v1/quote");

        if (!v1Parsed) {
          return new Response(
            JSON.stringify({ error: "Swap service unavailable", details: "0x returned non-JSON on both endpoints" }),
            { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (!v1Res.ok) {
          return new Response(
            JSON.stringify({ error: v1Parsed.data?.reason || "Quote failed (v1 fallback)", details: v1Parsed.data }),
            { status: v1Res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // v1 succeeded — return its data
        const d = v1Parsed.data;
        return new Response(
          JSON.stringify({
            buyAmount: d.buyAmount,
            buyAmountFormatted: (Number(d.buyAmount) / 1e6).toFixed(2),
            sellAmount: d.sellAmount,
            sellAmountFormatted: (Number(d.sellAmount) / 1e6).toFixed(2),
            transaction: { to: d.to, data: d.data, value: d.value, gas: d.gas, gasPrice: d.gasPrice },
            allowanceTarget: d.allowanceTarget,
            _endpoint: "v1-fallback",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const data = parsed.data;

      if (!res.ok) {
        console.error("[swap-to-usdce] 0x quote error:", JSON.stringify(data));
        return new Response(
          JSON.stringify({ error: data?.reason || "Quote failed", details: data }),
          { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          buyAmount: data.buyAmount,
          buyAmountFormatted: (Number(data.buyAmount) / 1e6).toFixed(2),
          sellAmount: data.sellAmount,
          sellAmountFormatted: (Number(data.sellAmount) / 1e6).toFixed(2),
          transaction: data.transaction,
          permit2: data.permit2,
          allowanceTarget: data.issues?.allowance?.spender,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "price") {
      const params = new URLSearchParams({
        chainId: String(CHAIN_ID),
        sellToken: USDC_NATIVE,
        buyToken: USDC_BRIDGED,
        sellAmount,
        taker: wallet_address,
      });

      const url = `https://api.0x.org/swap/permit2/price?${params}`;
      console.log("[swap-to-usdce] 0x price request:", url);

      const res = await fetch(url, { headers: apiHeaders });
      const parsed = await safeJsonParse(res, "permit2/price");

      if (!parsed) {
        return new Response(
          JSON.stringify({ error: "Swap service unavailable", details: "0x returned non-JSON for price" }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const data = parsed.data;

      if (!res.ok) {
        return new Response(
          JSON.stringify({ error: data?.reason || "Price check failed" }),
          { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          buyAmount: data.buyAmount,
          buyAmountFormatted: (Number(data.buyAmount) / 1e6).toFixed(2),
          sellAmount: data.sellAmount,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action. Use 'quote' or 'price'." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[swap-to-usdce] Error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
