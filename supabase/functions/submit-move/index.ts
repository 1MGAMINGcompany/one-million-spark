import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Server-Authoritative Move Submission
 * 
 * This edge function validates:
 * 1. Turn number matches expected (last_turn + 1)
 * 2. Wallet is the expected player for this turn
 * 3. Insert with UNIQUE constraint catches any race conditions
 * 
 * Always returns HTTP 200 with { success: true/false, error?: string }
 */
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
        JSON.stringify({ success: false, error: "missing_fields" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 1: Fetch latest move for this room to determine expected turn
    const { data: latestMoves, error: fetchError } = await supabase
      .from("game_moves")
      .select("turn_number, move_hash")
      .eq("room_pda", roomPda)
      .order("turn_number", { ascending: false })
      .limit(1);

    if (fetchError) {
      console.error("[submit-move] Failed to fetch latest move:", fetchError);
      return new Response(
        JSON.stringify({ success: false, error: "db_error" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const lastTurn = latestMoves && latestMoves.length > 0 ? latestMoves[0].turn_number : 0;
    const lastHash = latestMoves && latestMoves.length > 0 ? latestMoves[0].move_hash : "genesis";
    const expectedTurn = lastTurn + 1;

    // Step 2: Validate turn number
    if (turnNumber !== expectedTurn) {
      console.log("[submit-move] Turn mismatch:", { received: turnNumber, expected: expectedTurn });
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "turn_mismatch", 
          expected: expectedTurn,
          received: turnNumber,
          lastHash 
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 3: Validate prevHash matches
    const expectedPrevHash = prevHash || "genesis";
    if (expectedPrevHash !== lastHash) {
      console.log("[submit-move] Hash mismatch:", { received: expectedPrevHash, expected: lastHash });
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "hash_mismatch",
          expected: lastHash,
          received: expectedPrevHash
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 4: Fetch game session to validate whose turn it is
    const { data: session, error: sessionError } = await supabase
      .from("game_sessions")
      .select("starting_player_wallet, player1_wallet, player2_wallet")
      .eq("room_pda", roomPda)
      .single();

    if (sessionError || !session) {
      console.error("[submit-move] Failed to fetch session:", sessionError);
      return new Response(
        JSON.stringify({ success: false, error: "session_not_found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine expected player for this turn
    // Odd turns (1, 3, 5...) = starter, Even turns (2, 4, 6...) = other player
    const { starting_player_wallet, player1_wallet, player2_wallet } = session;
    
    if (!starting_player_wallet || !player1_wallet || !player2_wallet) {
      console.error("[submit-move] Session incomplete:", { starting_player_wallet, player1_wallet, player2_wallet });
      return new Response(
        JSON.stringify({ success: false, error: "session_incomplete" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const otherPlayer = starting_player_wallet.toLowerCase() === player1_wallet.toLowerCase() 
      ? player2_wallet 
      : player1_wallet;
    
    const isOddTurn = turnNumber % 2 === 1;
    const expectedPlayer = isOddTurn ? starting_player_wallet : otherPlayer;

    // Step 5: Validate wallet matches expected player
    if (wallet.toLowerCase() !== expectedPlayer.toLowerCase()) {
      console.log("[submit-move] Not your turn:", { 
        wallet: wallet.slice(0, 8), 
        expected: expectedPlayer.slice(0, 8),
        turn: turnNumber 
      });
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "not_your_turn",
          expectedPlayer: expectedPlayer.slice(0, 8) + "..."
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 6: Compute move hash
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify({ roomPda, turnNumber, wallet, moveData, prevHash: lastHash }));
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

    // Step 7: Insert move (UNIQUE constraint will catch any race condition)
    const { error: insertError } = await supabase.from("game_moves").insert({
      room_pda: roomPda,
      turn_number: turnNumber,
      wallet,
      move_data: moveData,
      prev_hash: lastHash,
      move_hash: moveHash,
    });

    if (insertError) {
      // Check if it's a duplicate key error (race condition - another client won)
      if (insertError.code === "23505") {
        console.log("[submit-move] Race condition - move already exists for turn", turnNumber);
        return new Response(
          JSON.stringify({ success: false, error: "turn_already_taken" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      console.error("[submit-move] Insert error:", insertError);
      return new Response(
        JSON.stringify({ success: false, error: insertError.message }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[submit-move] Move saved successfully");

    return new Response(
      JSON.stringify({ success: true, moveHash, turnNumber }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[submit-move] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "internal_error" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
