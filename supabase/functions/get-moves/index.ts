import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Support both GET query params and POST body
    let roomPda: string | null = null;
    
    if (req.method === "GET") {
      const url = new URL(req.url);
      roomPda = url.searchParams.get("roomPda");
    } else {
      const body = await req.json().catch(() => ({}));
      roomPda = body.roomPda;
    }

    if (!roomPda) {
      return new Response(
        JSON.stringify({ success: false, error: "roomPda required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[get-moves] Fetching moves for room:", roomPda.slice(0, 8));

    const { data: moves, error } = await supabase
      .from("game_moves")
      .select("*")
      .eq("room_pda", roomPda)
      .order("turn_number", { ascending: true });

    if (error) {
      console.error("[get-moves] Query error:", error);
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[get-moves] Retrieved moves:", { roomPda: roomPda.slice(0, 8), count: moves?.length || 0 });

    return new Response(
      JSON.stringify({ success: true, moves: moves || [] }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[get-moves] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
