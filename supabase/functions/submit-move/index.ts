import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

    const { roomPda, turnNumber, wallet, moveData, prevHash } = await req.json();

    // Validate required fields
    if (!roomPda || turnNumber === undefined || !wallet || !moveData) {
      console.error("[submit-move] Missing required fields:", { roomPda: !!roomPda, turnNumber, wallet: !!wallet, moveData: !!moveData });
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Compute move hash
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify({ roomPda, turnNumber, wallet, moveData, prevHash: prevHash || "genesis" }));
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const moveHash = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");

    console.log("[submit-move] Inserting move:", { 
      roomPda: roomPda.slice(0, 8), 
      turnNumber, 
      wallet: wallet.slice(0, 8),
      moveHash: moveHash.slice(0, 8)
    });

    // Insert move using service role (bypasses RLS)
    const { error } = await supabase.from("game_moves").insert({
      room_pda: roomPda,
      turn_number: turnNumber,
      wallet,
      move_data: moveData,
      prev_hash: prevHash || "genesis",
      move_hash: moveHash,
    });

    if (error) {
      console.error("[submit-move] Insert error:", error);
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[submit-move] Move saved successfully");

    return new Response(
      JSON.stringify({ success: true, moveHash, turnNumber }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[submit-move] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
