import { corsHeaders } from "@supabase/supabase-js/cors";

const CLOB_BASE = "https://clob.polymarket.com";
const VALID_INTERVALS = new Set(["1h", "6h", "1d", "1w", "all", "max"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const tokenId = url.searchParams.get("token_id");
    const interval = url.searchParams.get("interval") || "1d";
    const fidelity = url.searchParams.get("fidelity") || "5";

    if (!tokenId || tokenId.length < 5) {
      return new Response(
        JSON.stringify({ error: "token_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!VALID_INTERVALS.has(interval)) {
      return new Response(
        JSON.stringify({ error: `Invalid interval. Use: ${[...VALID_INTERVALS].join(", ")}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const clobUrl = `${CLOB_BASE}/prices-history?market=${tokenId}&interval=${interval}&fidelity=${fidelity}`;

    const resp = await fetch(clobUrl, {
      headers: { "Accept": "application/json" },
    });

    if (!resp.ok) {
      const body = await resp.text();
      console.error(`[polymarket-price-history] CLOB ${resp.status}: ${body}`);
      return new Response(
        JSON.stringify({ error: "upstream_error", status: resp.status }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await resp.json();

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=30",
      },
    });
  } catch (err) {
    console.error("[polymarket-price-history] error:", err);
    return new Response(
      JSON.stringify({ error: "internal_error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
