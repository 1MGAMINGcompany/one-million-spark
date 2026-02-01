/**
 * Edge Function: game-session-set-settings
 * 
 * Security via database ownership check - only the room creator can set settings.
 * On-chain SOL transaction proves identity, this function validates creatorWallet === player1_wallet.
 * 
 * Request body:
 * {
 *   roomPda: string,
 *   turnTimeSeconds: number,
 *   mode: "casual" | "ranked" | "private",
 *   creatorWallet: string,
 *   maxPlayers?: number,
 *   gameType?: string,
 * }
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Mode = "casual" | "ranked" | "private";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json(405, { ok: false, error: "method_not_allowed" });
  }

  try {
    const payload = await req.json().catch(() => null);
    const roomPda = payload?.roomPda;
    const turnTimeSecondsRaw = payload?.turnTimeSeconds;
    const mode = payload?.mode as Mode;
    const creatorWallet = payload?.creatorWallet;
    const maxPlayersRaw = payload?.maxPlayers;
    const gameTypeFromPayload = payload?.gameType;

    // Validate required fields
    if (!roomPda || typeof roomPda !== "string") {
      return json(400, { ok: false, error: "roomPda_required" });
    }

    const turnTimeSeconds = Number(turnTimeSecondsRaw);
    if (!Number.isFinite(turnTimeSeconds) || turnTimeSeconds < 0) {
      return json(400, { ok: false, error: "turnTimeSeconds_invalid" });
    }

    if (mode !== "casual" && mode !== "ranked" && mode !== "private") {
      return json(400, { ok: false, error: "mode_invalid" });
    }

    if (!creatorWallet || typeof creatorWallet !== "string") {
      return json(400, { ok: false, error: "creatorWallet_required" });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      console.error("[game-session-set-settings] Missing env vars");
      return json(500, { ok: false, error: "server_misconfigured" });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // Fetch session to verify ownership
    let { data: session, error: sessionErr } = await supabase
      .from("game_sessions")
      .select("room_pda, status, start_roll_finalized, player1_wallet")
      .eq("room_pda", roomPda)
      .maybeSingle();

    if (sessionErr) {
      console.error("[game-session-set-settings] session fetch error", sessionErr);
      return json(500, { ok: false, error: "session_fetch_failed" });
    }

    // Parse max_players if provided (for Ludo: 2, 3, or 4)
    const maxPlayers = typeof maxPlayersRaw === "number" && maxPlayersRaw >= 2 && maxPlayersRaw <= 4
      ? maxPlayersRaw
      : 2;

    if (!session) {
      // Session doesn't exist yet - CREATE it with the settings
      console.log("[game-session-set-settings] No session found, creating new one");
      
      const { error: insertErr } = await supabase
        .from("game_sessions")
        .insert({
          room_pda: roomPda,
          player1_wallet: creatorWallet,
          player2_wallet: null,
          game_type: gameTypeFromPayload || "unknown",
          game_state: {},
          status: "waiting",
          status_int: 1,
          mode: mode,
          turn_time_seconds: turnTimeSeconds,
          max_players: maxPlayers,
          p1_ready: false,
          p2_ready: false,
        });

      if (insertErr) {
        // Check if conflict (room created by another process)
        if (insertErr.code === "23505") {
          console.log("[game-session-set-settings] Conflict detected, falling back to update");
        } else {
          console.error("[game-session-set-settings] insert error", insertErr);
          return json(500, { ok: false, error: "insert_failed" });
        }
      } else {
        console.log("[game-session-set-settings] ✅ Session created:", { 
          roomPda: roomPda.slice(0, 8), 
          mode, 
          turnTimeSeconds, 
          maxPlayers,
          gameType: gameTypeFromPayload || "unknown",
        });
        return json(200, { ok: true });
      }
      
      // If we got here due to conflict, re-fetch and continue to UPDATE
      const { data: conflictSession } = await supabase
        .from("game_sessions")
        .select("room_pda, status, start_roll_finalized, player1_wallet")
        .eq("room_pda", roomPda)
        .maybeSingle();
        
      if (!conflictSession) {
        return json(500, { ok: false, error: "session_race_condition" });
      }
      
      session = conflictSession;
    }

    // Verify caller is the room creator (player1_wallet) - DB ownership check
    if (session.player1_wallet) {
      const sessionCreator = session.player1_wallet.trim();
      const requestCreator = creatorWallet.trim();
      
      if (sessionCreator !== requestCreator) {
        console.warn("[game-session-set-settings] Creator mismatch:", {
          sessionCreator: sessionCreator.slice(0, 8),
          requestCreator: requestCreator.slice(0, 8),
        });
        return json(403, { ok: false, error: "not_room_creator" });
      }
    }

    // Guard: do not allow changing settings after game has started
    const status = String(session.status ?? "").toLowerCase();
    const alreadyStarted =
      Boolean(session.start_roll_finalized) ||
      ["active", "started", "finished", "complete"].includes(status);

    if (alreadyStarted) {
      return json(409, { ok: false, error: "game_already_started" });
    }

    // Update settings (session already exists)
    const { error: updateErr } = await supabase
      .from("game_sessions")
      .update({
        turn_time_seconds: turnTimeSeconds,
        mode,
        max_players: maxPlayers,
      })
      .eq("room_pda", roomPda);

    if (updateErr) {
      console.error("[game-session-set-settings] update error", updateErr);
      return json(500, { ok: false, error: "update_failed" });
    }

    console.log("[game-session-set-settings] ✅ Settings updated:", { roomPda: roomPda.slice(0, 8), turnTimeSeconds, mode, maxPlayers });
    return json(200, { ok: true });
  } catch (e) {
    console.error("[game-session-set-settings] unexpected error", e);
    return json(500, { ok: false, error: "internal_error" });
  }
});
