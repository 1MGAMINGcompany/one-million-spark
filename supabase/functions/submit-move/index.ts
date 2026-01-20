import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Server-Authoritative Move Submission v2 (Server-Sequenced + Idempotent)
 * 
 * Key changes from v1:
 * 1. Server assigns turn_number (max + 1), client's is just a hint
 * 2. Idempotency via client_move_id column - retries are safe
 * 3. Validates turn ownership for ALL move types (not just turn_end)
 * 4. Returns server-assigned turn number in response
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

    const { roomPda, wallet, moveData, clientMoveId } = await req.json();

    // Validate required fields (turnNumber no longer required - server assigns)
    if (!roomPda || !wallet || !moveData) {
      console.error("[submit-move] Missing required fields:", { roomPda: !!roomPda, wallet: !!wallet, moveData: !!moveData });
      return new Response(
        JSON.stringify({ success: false, error: "missing_fields" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 1: IDEMPOTENCY CHECK - If clientMoveId already exists, return existing move
    if (clientMoveId) {
      const { data: existing, error: idempotencyError } = await supabase
        .from("game_moves")
        .select("turn_number, move_hash")
        .eq("room_pda", roomPda)
        .eq("client_move_id", clientMoveId)
        .maybeSingle();

      if (idempotencyError) {
        console.error("[submit-move] Idempotency check failed:", idempotencyError);
      } else if (existing) {
        console.log("[submit-move] Idempotent hit - returning existing move:", {
          clientMoveId: clientMoveId.slice(0, 8),
          turn: existing.turn_number
        });
        return new Response(
          JSON.stringify({ 
            success: true, 
            moveHash: existing.move_hash, 
            turnNumber: existing.turn_number,
            idempotent: true 
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Step 2: Fetch latest move for this room to determine next turn
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
    
    // SERVER ASSIGNS TURN NUMBER (not client)
    const assignedTurn = lastTurn + 1;

    // Step 3: Fetch game session to validate participation and turn ownership
    const { data: session, error: sessionError } = await supabase
      .from("game_sessions")
      .select("starting_player_wallet, player1_wallet, player2_wallet, current_turn_wallet, turn_started_at, turn_time_seconds")
      .eq("room_pda", roomPda)
      .single();

    if (sessionError || !session) {
      console.error("[submit-move] Failed to fetch session:", sessionError);
      return new Response(
        JSON.stringify({ success: false, error: "session_not_found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { player1_wallet, player2_wallet, current_turn_wallet, starting_player_wallet, turn_started_at, turn_time_seconds } = session;

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

    // WALLET-AUTHORITATIVE: Validate turn ownership for ALL move types
    // This prevents out-of-turn submissions (race conditions)
    const expectedPlayer = current_turn_wallet || starting_player_wallet;
    const moveType = moveData.type;
    
    if (expectedPlayer && walletTrimmed !== expectedPlayer.trim()) {
      console.log("[submit-move] Not your turn:", { 
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

    // For timeout moves, validate that turn has actually expired (anti-cheat)
    if (moveType === "turn_timeout" && turn_started_at && turn_time_seconds) {
      const turnStart = new Date(turn_started_at).getTime();
      const now = Date.now();
      const turnDurationMs = (turn_time_seconds + 2) * 1000; // 2s grace period
      
      if (now - turnStart < turnDurationMs) {
        console.log("[submit-move] Timeout submitted too early:", {
          elapsed: Math.floor((now - turnStart) / 1000),
          required: turn_time_seconds
        });
        return new Response(
          JSON.stringify({ success: false, error: "timeout_too_early" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Step 4: Compute move hash (using server-assigned turn)
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify({ roomPda, turnNumber: assignedTurn, wallet, moveData, prevHash: lastHash }));
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const moveHash = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");

    console.log("[submit-move] Inserting move:", { 
      roomPda: roomPda.slice(0, 8), 
      assignedTurn, 
      wallet: wallet.slice(0, 8),
      moveType,
      clientMoveId: clientMoveId?.slice(0, 8),
      moveHash: moveHash.slice(0, 8)
    });

    // Step 5: Insert move with client_move_id for idempotency
    const { error: insertError } = await supabase.from("game_moves").insert({
      room_pda: roomPda,
      turn_number: assignedTurn,
      wallet,
      move_data: moveData,
      prev_hash: lastHash,
      move_hash: moveHash,
      client_move_id: clientMoveId || null,
    });

    if (insertError) {
      // Check if it's a duplicate key error on client_move_id (idempotent retry)
      if (insertError.code === "23505" && clientMoveId) {
        console.log("[submit-move] Idempotent conflict - fetching existing move");
        const { data: existingMove } = await supabase
          .from("game_moves")
          .select("turn_number, move_hash")
          .eq("room_pda", roomPda)
          .eq("client_move_id", clientMoveId)
          .single();
          
        if (existingMove) {
          return new Response(
            JSON.stringify({ 
              success: true, 
              moveHash: existingMove.move_hash, 
              turnNumber: existingMove.turn_number,
              idempotent: true 
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
      
      // Check if it's a duplicate turn_number (race condition - another move won)
      if (insertError.code === "23505") {
        console.log("[submit-move] Race condition - turn already taken:", assignedTurn);
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

    console.log("[submit-move] Move saved successfully - turn:", assignedTurn);

    // Step 6: Update current_turn_wallet AND turn_started_at on turn changes
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
      JSON.stringify({ success: true, moveHash, turnNumber: assignedTurn }),
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
