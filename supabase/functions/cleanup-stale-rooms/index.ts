import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Timeout thresholds
const FREE_TIMEOUT_MINUTES = 30;
const PAID_TIMEOUT_MINUTES = 15;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch all waiting rooms with no opponent
    const { data: staleRooms, error: fetchError } = await supabase
      .from("game_sessions")
      .select("room_pda, player1_wallet, mode, created_at, waiting_started_at")
      .eq("status_int", 1)
      .is("player2_wallet", null);

    if (fetchError) {
      console.error("[cleanup-stale-rooms] Fetch error:", fetchError);
      return new Response(
        JSON.stringify({ error: fetchError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!staleRooms || staleRooms.length === 0) {
      return new Response(
        JSON.stringify({ cleaned: 0, message: "No stale rooms found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const now = Date.now();
    const freeToCancel: string[] = [];
    const paidToCancel: { room_pda: string; player1_wallet: string }[] = [];

    for (const room of staleRooms) {
      const startTime = new Date(room.waiting_started_at || room.created_at).getTime();
      const isFree = room.mode === "free";
      const thresholdMs = (isFree ? FREE_TIMEOUT_MINUTES : PAID_TIMEOUT_MINUTES) * 60 * 1000;

      if (now - startTime < thresholdMs) continue;

      if (isFree) {
        freeToCancel.push(room.room_pda);
      } else {
        paidToCancel.push({ room_pda: room.room_pda, player1_wallet: room.player1_wallet });
      }
    }

    let freeCancelled = 0;
    let paidCancelled = 0;
    let sweepResults: { room_pda: string; status: string }[] = [];

    // Bulk cancel free rooms
    if (freeToCancel.length > 0) {
      const { error: freeErr } = await supabase
        .from("game_sessions")
        .update({ status: "cancelled", status_int: 5, game_over_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .in("room_pda", freeToCancel);

      if (freeErr) {
        console.error("[cleanup-stale-rooms] Free cancel error:", freeErr);
      } else {
        freeCancelled = freeToCancel.length;
        console.log(`[cleanup-stale-rooms] Cancelled ${freeCancelled} free rooms`);
      }
    }

    // Cancel paid rooms one by one + attempt vault sweep
    for (const room of paidToCancel) {
      const { error: paidErr } = await supabase
        .from("game_sessions")
        .update({ status: "cancelled", status_int: 5, game_over_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("room_pda", room.room_pda);

      if (paidErr) {
        console.error(`[cleanup-stale-rooms] Failed to cancel paid room ${room.room_pda}:`, paidErr);
        sweepResults.push({ room_pda: room.room_pda, status: "cancel_failed" });
        continue;
      }

      paidCancelled++;

      // Extract roomId from room_pda for sweep-orphan-vault
      // The room_pda is a Solana public key — we need the numeric room_id.
      // We don't store room_id in game_sessions, so we skip the on-chain sweep here.
      // The sweep-orphan-vault function requires (creatorWallet, roomId) which we don't have.
      // Instead, log for manual review. The recover-funds UI already handles this.
      console.log(`[cleanup-stale-rooms] Cancelled paid room ${room.room_pda} (creator: ${room.player1_wallet}). On-chain vault sweep requires manual recovery or recover-funds UI.`);
      sweepResults.push({ room_pda: room.room_pda, status: "cancelled_db_only" });
    }

    const summary = {
      total_checked: staleRooms.length,
      free_cancelled: freeCancelled,
      paid_cancelled: paidCancelled,
      skipped: staleRooms.length - freeToCancel.length - paidToCancel.length,
      sweep_results: sweepResults,
    };

    console.log("[cleanup-stale-rooms] Summary:", JSON.stringify(summary));

    return new Response(
      JSON.stringify(summary),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[cleanup-stale-rooms] Error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
