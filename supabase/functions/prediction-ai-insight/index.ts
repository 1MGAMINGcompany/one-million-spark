import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      title,
      sport,
      sideA,
      sideB,
      probabilityA,
      probabilityB,
      volume,
      liquidity,
      trend,
      signals,
    } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.warn("LOVABLE_API_KEY not set — returning fallback");
      return new Response(
        JSON.stringify({ fallback: true, error: "ai_unavailable" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const pctA = Math.round((probabilityA ?? 0) * 100);
    const pctB = Math.round((probabilityB ?? 0) * 100);

    const systemPrompt = `You are a concise prediction market analyst for 1MGAMING. Produce a SHORT JSON object with these exact keys:
- "summary": 2-3 sentences of plain-English market analysis. Be specific and useful — avoid filler. Use words like "market", "pricing", "activity". Never use "bet", "gamble", or "wager". Never guarantee outcomes.
- "confidenceLabel": one of "Strong Favorite", "Moderate Lean", "Close Market", "Uncertain"
- "signalTags": array of 2-4 short tags like "High Activity", "Trending Up", "Low Liquidity"
- "caution": one short sentence of responsible caution relevant to this specific market

Respond ONLY with valid JSON, no markdown fences.`;

    const userPrompt = `Market: ${title}
Sport: ${sport || "unknown"}
Side A: ${sideA} (${pctA}%)
Side B: ${sideB} (${pctB}%)
Total Volume: $${volume ?? 0}
Liquidity: ${liquidity ?? "unknown"}
Trend: ${trend ?? "stable"}
Current Signals: ${(signals ?? []).join(", ") || "none"}

Analyze this market concisely.`;

    // Hard 8s timeout on AI gateway call
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8_000);

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.4,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!aiResp.ok) {
      const status = aiResp.status;
      const errText = await aiResp.text();
      console.error(`AI gateway error ${status}:`, errText);

      if (status === 429) {
        return new Response(
          JSON.stringify({ fallback: true, error: "rate_limited" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (status === 402) {
        return new Response(
          JSON.stringify({ fallback: true, error: "credits_exhausted" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ fallback: true, error: "ai_error" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await aiResp.json();
    const raw = aiData.choices?.[0]?.message?.content ?? "";

    // Parse JSON from response (strip markdown fences if present)
    let cleaned = raw.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    }

    try {
      const parsed = JSON.parse(cleaned);
      return new Response(
        JSON.stringify({
          fallback: false,
          summary: parsed.summary ?? "",
          confidenceLabel: parsed.confidenceLabel ?? "Uncertain",
          signalTags: parsed.signalTags ?? [],
          caution: parsed.caution ?? "",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch {
      // AI returned non-JSON — use raw text as summary
      return new Response(
        JSON.stringify({
          fallback: true,
          summary: cleaned.slice(0, 300),
          error: "parse_error",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (e) {
    // Timeout or network error — never expose raw error
    const isTimeout = e instanceof DOMException && e.name === "AbortError";
    console.error("prediction-ai-insight error:", isTimeout ? "request_timeout" : e);
    return new Response(
      JSON.stringify({ fallback: true, error: isTimeout ? "timeout" : "ai_error" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
