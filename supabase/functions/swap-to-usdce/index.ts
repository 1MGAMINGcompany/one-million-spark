/**
 * swap-to-usdce — Uses 0x Swap API v1 to convert Native USDC → USDC.e on Polygon.
 *
 * Actions:
 *   quote  — get a swap quote (price + calldata + allowanceTarget)
 *   price  — lighter price-only check
 *
 * Uses v1 endpoint (allowance-based) instead of permit2 for simplicity.
 * Client must approve `allowanceTarget` for Native USDC before executing the swap tx.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const USDC_NATIVE = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
const USDC_BRIDGED = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
const CHAIN_ID = 137;

async function safeJsonParse(res: Response, label: string): Promise<{ data: any; raw: string } | null> {
  const raw = await res.text();
  console.log(`[swap-to-usdce] ${label} response status:`, res.status, "body:", raw.slice(0, 300));
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
      "0x-version": "v2",
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

      // Use v1 allowance-based endpoint (simpler, no permit2 needed)
      const url = `https://api.0x.org/swap/allowance-holder/quote?${params}`;
      console.log("[swap-to-usdce] 0x request:", url);

      const res = await fetch(url, { headers: apiHeaders });
      const parsed = await safeJsonParse(res, "allowance-holder/quote");

      if (!parsed) {
        return new Response(
          JSON.stringify({ error: "Swap service unavailable", details: "0x returned non-JSON" }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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

      // v2 allowance-holder response shape:
      // data.transaction = { to, data, value, gas, gasPrice }
      // data.issues.allowance = { actual, spender } if approval needed
      const tx = data.transaction;
      const allowanceIssue = data.issues?.allowance;

      return new Response(
        JSON.stringify({
          buyAmount: data.buyAmount,
          buyAmountFormatted: (Number(data.buyAmount) / 1e6).toFixed(2),
          sellAmount: data.sellAmount,
          sellAmountFormatted: (Number(data.sellAmount) / 1e6).toFixed(2),
          transaction: tx
            ? { to: tx.to, data: tx.data, value: tx.value, gas: tx.gas, gasPrice: tx.gasPrice }
            : null,
          allowanceTarget: allowanceIssue?.spender || null,
          needsApproval: !!allowanceIssue,
          _endpoint: "allowance-holder",
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

      const url = `https://api.0x.org/swap/allowance-holder/price?${params}`;
      console.log("[swap-to-usdce] 0x price request:", url);

      const res = await fetch(url, { headers: apiHeaders });
      const parsed = await safeJsonParse(res, "allowance-holder/price");

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
