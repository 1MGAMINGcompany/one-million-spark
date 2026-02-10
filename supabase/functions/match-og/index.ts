import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LAMPORTS_PER_SOL = 1_000_000_000;

function shortenWallet(wallet: string): string {
  return `${wallet.slice(0, 4)}…${wallet.slice(-4)}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const roomPda = url.searchParams.get("roomPda");

    if (!roomPda) {
      return new Response("Missing roomPda", { status: 400 });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: match } = await supabase
      .from("match_share_cards")
      .select("*")
      .eq("room_pda", roomPda)
      .maybeSingle();

    if (!match) {
      return new Response("Match not found", { status: 404 });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response("AI not configured", { status: 500 });
    }

    const gameType = match.game_type || "Game";
    const winner = match.winner_wallet ? shortenWallet(match.winner_wallet) : "Draw";
    const solWon = match.winner_payout_lamports
      ? (match.winner_payout_lamports / LAMPORTS_PER_SOL).toFixed(4)
      : "0";

    const prompt = `Create a 1200x630 OG social share image for a gaming match result. Egyptian gold and dark theme. Game: ${gameType}. Winner: ${winner}. SOL Won: ${solWon}. Include trophy icon, gold accents, text "1M Gaming" branding. Dramatic, premium, dark background with gold highlights. Ultra high resolution.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-pro-image-preview",
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error("[match-og] AI request failed:", response.status);
      return new Response("Failed to generate image", { status: 500 });
    }

    const result = await response.json();
    
    // Extract image from response
    const content = result.choices?.[0]?.message?.content;
    
    if (typeof content === "string" && content.startsWith("data:image")) {
      const base64Data = content.split(",")[1];
      const imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
      
      return new Response(imageBytes, {
        headers: {
          ...corsHeaders,
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=86400",
        },
      });
    }

    // Check if content is array with image parts
    if (Array.isArray(content)) {
      const imagePart = content.find((p: any) => p.type === "image_url" || p.type === "image");
      if (imagePart) {
        const imgUrl = imagePart.image_url?.url || imagePart.url;
        if (imgUrl?.startsWith("data:image")) {
          const base64Data = imgUrl.split(",")[1];
          const imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
          return new Response(imageBytes, {
            headers: {
              ...corsHeaders,
              "Content-Type": "image/png",
              "Cache-Control": "public, max-age=86400",
            },
          });
        }
      }
    }

    console.warn("[match-og] No image in AI response");
    return new Response("No image generated", { status: 500 });
  } catch (e: any) {
    console.error("[match-og] Error:", e);
    return new Response(e.message || "Internal server error", { status: 500 });
  }
});
