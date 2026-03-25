/**
 * swap-to-usdce — Uses 0x Swap API to convert Native USDC → USDC.e on Polygon.
 *
 * Actions:
 *   quote  — get a swap quote (price + calldata)
 *   swap   — execute the swap via Privy server-side signing
 *
 * The user's Privy embedded wallet is the taker; the function fetches
 * a quote from 0x and returns the transaction for client-side execution.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const USDC_NATIVE = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
const USDC_BRIDGED = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
const CHAIN_ID = 137;

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

    // Convert human-readable USDC amount to raw units (6 decimals)
    const sellAmount = BigInt(Math.floor(amount_usdc * 1e6)).toString();

    if (action === "quote") {
      // Get a price quote from 0x
      const params = new URLSearchParams({
        chainId: String(CHAIN_ID),
        sellToken: USDC_NATIVE,
        buyToken: USDC_BRIDGED,
        sellAmount,
        taker: wallet_address,
      });

      const res = await fetch(`https://api.0x.org/swap/permit2/quote?${params}`, {
        headers: {
          "0x-api-key": ZEROX_API_KEY,
          "0x-version": "2",
        },
      });

      const data = await res.json();

      if (!res.ok) {
        console.error("[swap-to-usdce] 0x quote error:", JSON.stringify(data));
        return new Response(
          JSON.stringify({ error: data?.reason || "Quote failed", details: data }),
          { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Return quote info for the frontend
      return new Response(
        JSON.stringify({
          buyAmount: data.buyAmount,
          buyAmountFormatted: (Number(data.buyAmount) / 1e6).toFixed(2),
          sellAmount: data.sellAmount,
          sellAmountFormatted: (Number(data.sellAmount) / 1e6).toFixed(2),
          // Transaction data for client-side execution
          transaction: data.transaction,
          // Permit2 data if needed
          permit2: data.permit2,
          // Allowance target for approval
          allowanceTarget: data.issues?.allowance?.spender,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "price") {
      // Lighter price-only endpoint (no calldata)
      const params = new URLSearchParams({
        chainId: String(CHAIN_ID),
        sellToken: USDC_NATIVE,
        buyToken: USDC_BRIDGED,
        sellAmount,
        taker: wallet_address,
      });

      const res = await fetch(`https://api.0x.org/swap/permit2/price?${params}`, {
        headers: {
          "0x-api-key": ZEROX_API_KEY,
          "0x-version": "2",
        },
      });

      const data = await res.json();

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
