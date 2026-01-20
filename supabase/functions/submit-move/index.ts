import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Server-Authoritative Move Submission (Wallet-Authoritative Turn Model)
 * 
 * This edge function validates:
 * 1. Turn number matches expected (last_turn + 1)
 * 2. Wallet is a room participant (player1 or player2)
 * 3. Turn ownership ONLY for turn_end/turn_timeout/auto_forfeit moves
 * 4. Insert with UNIQUE constraint catches any race conditions
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

    // Step 4: Fetch game session to validate participation and turn ownership
    const { data: session, error: sessionError } = await supabase
      .from("game_sessions")
      .select("starting_player_wallet, player1_wallet, player2_wallet, current_turn_wallet")
      .eq("room_pda", roomPda)
      .single();

    if (sessionError || !session) {
      console.error("[submit-move] Failed to fetch session:", sessionError);
      return new Response(
        JSON.stringify({ success: false, error: "session_not_found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { player1_wallet, player2_wallet, current_turn_wallet, starting_player_wallet } = session;

    if (!player1_wallet || !player2_wallet) {
      console.error("[submit-move] Session incomplete:", { player1_wallet, player2_wallet });
      return new Response(
        JSON.stringify({ success: false, error: "session_incomplete" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // SECURITY: Validate submitting wallet is actually a room participant
    const walletTrimmed = wallet.trim();
    const isParticipant = 
      walletTrimmed === player1_wallet?.trim() || 
      walletTrimmed === player2_wallet?.trim();

    if (!isParticipant) {
      console.log("[submit-move] Wallet not a participant:", { 
        wallet: wallet.slice(0, 8),
        p1: player1_wallet?.slice(0, 8),
        p2: player2_wallet?.slice(0, 8)
      });
      return new Response(
        JSON.stringify({ success: false, error: "not_a_participant" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // WALLET-AUTHORITATIVE: Only validate turn ownership for turn-ending moves
    // dice_roll and move events within a turn don't need ownership validation
    const moveType = moveData.type;
    if (moveType === "turn_end" || moveType === "turn_timeout" || moveType === "auto_forfeit") {
      const expectedPlayer = current_turn_wallet || starting_player_wallet;
      
      if (expectedPlayer && walletTrimmed !== expectedPlayer.trim()) {
        console.log("[submit-move] Not your turn for turn-ending move:", { 
          wallet: wallet.slice(0, 8), 
          expected: expectedPlayer.slice(0, 8),
          moveType 
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
    }

    // Step 5: Compute move hash
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
      moveType,
      moveHash: moveHash.slice(0, 8)
    });

    // Step 6: Insert move (UNIQUE constraint will catch any race condition)
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

    // Step 7: Update current_turn_wallet AND turn_started_at on turn changes
    if (
      (moveType === "turn_end" || moveType === "turn_timeout" || moveType === "auto_forfeit") &&
      moveData.nextTurnWallet
    ) {
      const { error: updateError } = await supabase
        .from("game_sessions")
        .update({ 
          current_turn_wallet: moveData.nextTurnWallet,
          turn_started_at: new Date().toISOString(),
        })
        .eq("room_pda", roomPda);

      if (updateError) {
        console.error("[submit-move] Failed to update turn state:", updateError);
        // Non-fatal: move is saved, turn state update is best-effort
      } else {
        console.log("[submit-move] Updated turn state - wallet:", moveData.nextTurnWallet.slice(0, 8), "turn_started_at: now");
      }
    }

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
