import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Cache-Control": "public, max-age=3600", // Cache for 1 hour
};

// Helper to convert lamports to SOL
function lamportsToSol(lamports: number): number {
  return lamports / 1_000_000_000;
}

// Shorten wallet address for display
function shortenAddress(address: string | null, chars = 4): string {
  if (!address) return "—";
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

// Game type display names
const GAME_NAMES: Record<string, string> = {
  chess: "CHESS",
  checkers: "CHECKERS",
  backgammon: "BACKGAMMON",
  dominos: "DOMINOS",
  ludo: "LUDO",
};

interface MatchOgRequest {
  roomPda: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Support both GET query param and POST body
    let roomPda: string | null = null;
    
    if (req.method === "GET") {
      const url = new URL(req.url);
      roomPda = url.searchParams.get("roomPda");
    } else {
      const body = await req.json().catch(() => ({})) as MatchOgRequest;
      roomPda = body.roomPda;
    }

    if (!roomPda) {
      return new Response(
        JSON.stringify({ error: "Missing roomPda" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[match-og] Generating OG image for ${roomPda}`);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch match share card
    const { data: matchCard, error: matchError } = await supabase
      .from("match_share_cards")
      .select("*")
      .eq("room_pda", roomPda)
      .maybeSingle();

    if (matchError || !matchCard) {
      console.error("[match-og] Match not found:", matchError);
      return new Response(
        JSON.stringify({ error: "Match not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate values
    const stakeLamports = matchCard.stake_lamports || 0;
    const potLamports = stakeLamports * 2;
    const feeLamports = matchCard.fee_lamports || Math.floor(potLamports * 500 / 10000);
    const winnerPayoutLamports = matchCard.winner_payout_lamports || (potLamports - feeLamports);
    const winnerPayoutSol = lamportsToSol(winnerPayoutLamports);

    const gameName = GAME_NAMES[matchCard.game_type?.toLowerCase()] || matchCard.game_type?.toUpperCase() || "GAME";
    const winnerShort = shortenAddress(matchCard.winner_wallet, 4);
    const modeDisplay = (matchCard.mode || "casual").toUpperCase();

    // Get Lovable API key for AI image generation
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    if (!lovableApiKey) {
      console.warn("[match-og] LOVABLE_API_KEY not set, returning fallback");
      // Return a simple JSON response indicating no image
      return new Response(
        JSON.stringify({
          error: "Image generation not available",
          fallback: true,
          data: {
            game_type: gameName,
            winner: winnerShort,
            amount_won: winnerPayoutSol.toFixed(4),
            mode: modeDisplay,
          },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate AI image using Lovable AI Gateway
    const prompt = `Create a premium 1200x630 victory card for a gaming platform called "1M Gaming". 
    Egyptian gold and black luxury theme with pyramids in background.
    
    Display prominently:
    - Game: ${gameName}
    - Winner: ${winnerShort}
    - Amount Won: ${winnerPayoutSol.toFixed(4)} SOL
    - Mode: ${modeDisplay}
    
    Style: Premium, luxurious, crypto gaming aesthetic. Gold accents on dark background.
    Include a trophy icon and pyramid motif. Text should be clearly readable.
    Aspect ratio 16:9 horizontal banner format.`;

    console.log("[match-og] Generating image with prompt:", prompt.slice(0, 100) + "...");

    try {
      const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${lovableApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-image",
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
          modalities: ["image", "text"],
        }),
      });

      if (!aiResponse.ok) {
        const errorText = await aiResponse.text();
        console.error("[match-og] AI generation failed:", aiResponse.status, errorText);
        throw new Error(`AI generation failed: ${aiResponse.status}`);
      }

      const aiData = await aiResponse.json();
      const imageUrl = aiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;

      if (!imageUrl) {
        console.error("[match-og] No image URL in response:", JSON.stringify(aiData).slice(0, 200));
        throw new Error("No image URL in AI response");
      }

      // Return the base64 image as PNG
      if (imageUrl.startsWith("data:image/")) {
        const base64Data = imageUrl.split(",")[1];
        const imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

        console.log("[match-og] ✅ Generated image successfully");

        return new Response(imageBytes, {
          headers: {
            ...corsHeaders,
            "Content-Type": "image/png",
          },
        });
      }

      // If it's a URL, redirect to it
      return Response.redirect(imageUrl, 302);

    } catch (aiError) {
      console.error("[match-og] AI generation error:", aiError);
      
      // Return fallback data
      return new Response(
        JSON.stringify({
          ok: false,
          fallback: true,
          error: "Image generation failed",
          data: {
            game_type: gameName,
            winner: winnerShort,
            amount_won: winnerPayoutSol.toFixed(4),
            mode: modeDisplay,
            room_pda: roomPda,
          },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

  } catch (e: unknown) {
    const errorMessage = e instanceof Error ? e.message : "Internal server error";
    console.error("[match-og] Error:", e);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
