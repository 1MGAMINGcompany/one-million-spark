/**
 * Edge Function: game-session-set-settings
 * 
 * 🔒 SECURITY: Caller identity is derived from session token ONLY.
 * Only the room creator (player1_wallet or participants[0]) can update settings.
 * 
 * Request body (creatorWallet IGNORED - derived from session):
 * {
 *   roomPda: string,
 *   turnTimeSeconds: number,
 *   mode: "casual" | "ranked" | "private",
 *   maxPlayers?: number,
 *   gameType?: string,
 * }
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { requireSession } from "../_shared/requireSession.ts";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json(405, { ok: false, error: "method_not_allowed" });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      console.error("[game-session-set-settings] Missing env vars");
      return json(500, { ok: false, error: "server_misconfigured" });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // 🔒 SECURITY: Require session token - derive caller identity from session only
    const sessionResult = await requireSession(supabase, req);
    if (!sessionResult.ok) {
      console.warn("[game-session-set-settings] Unauthorized:", sessionResult.error);
      return json(401, { ok: false, error: "unauthorized", details: sessionResult.error });
    }

    // callerWallet is ALWAYS derived from session - ignore any body.creatorWallet
    const callerWallet = sessionResult.session.wallet;

    const payload = await req.json().catch(() => null);
    const roomPda = payload?.roomPda;
    const turnTimeSecondsRaw = payload?.turnTimeSeconds;
    const mode = payload?.mode as Mode;
    // creatorWallet from body is IGNORED - callerWallet from session is authoritative
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

    // Fetch session to verify ownership (include participants for fallback)
    let { data: session, error: sessionErr } = await supabase
      .from("game_sessions")
      .select("room_pda, status, start_roll_finalized, player1_wallet, participants")
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
      // 🔒 callerWallet becomes player1_wallet (room creator)
      console.log("[game-session-set-settings] No session found, creating new one for:", callerWallet.slice(0, 8));
      
      const { error: insertErr } = await supabase
        .from("game_sessions")
        .insert({
          room_pda: roomPda,
          player1_wallet: callerWallet,
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
          participants: [callerWallet],
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
          creator: callerWallet.slice(0, 8),
        });
        return json(200, { ok: true });
      }
      
      // If we got here due to conflict, re-fetch and continue to UPDATE
      const { data: conflictSession } = await supabase
        .from("game_sessions")
        .select("room_pda, status, start_roll_finalized, player1_wallet, participants")
        .eq("room_pda", roomPda)
        .maybeSingle();
        
      if (!conflictSession) {
        return json(500, { ok: false, error: "session_race_condition" });
      }
      
      session = conflictSession;
    }

    // 🔒 SECURITY: Verify caller is room creator
    // Check player1_wallet first, fallback to participants[0]
    const callerTrimmed = callerWallet.trim();
    const p1Wallet = session.player1_wallet?.trim();
    const firstParticipant = Array.isArray(session.participants) && session.participants.length > 0
      ? session.participants[0]?.trim()
      : null;

    const isCreator = 
      (p1Wallet && callerTrimmed === p1Wallet) ||
      (!p1Wallet && firstParticipant && callerTrimmed === firstParticipant);

    if (!isCreator) {
      console.warn("[game-session-set-settings] Forbidden - not room creator:", {
        callerWallet: callerTrimmed.slice(0, 8),
        player1_wallet: p1Wallet?.slice(0, 8) || "null",
        firstParticipant: firstParticipant?.slice(0, 8) || "null",
      });
      return json(403, { ok: false, error: "forbidden" });
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
    const updatePayload: Record<string, unknown> = {
      turn_time_seconds: turnTimeSeconds,
      mode,
      max_players: maxPlayers,
    };
    
    // CRITICAL FIX: Include game_type if provided - fixes "Unknown" game name bug
    if (gameTypeFromPayload) {
      updatePayload.game_type = gameTypeFromPayload;
    }
    
    const { error: updateErr } = await supabase
      .from("game_sessions")
      .update(updatePayload)
      .eq("room_pda", roomPda);

    if (updateErr) {
      console.error("[game-session-set-settings] update error", updateErr);
      return json(500, { ok: false, error: "update_failed" });
    }

    console.log("[game-session-set-settings] ✅ Settings updated:", { 
      roomPda: roomPda.slice(0, 8), 
      turnTimeSeconds, 
      mode, 
      maxPlayers,
      gameType: gameTypeFromPayload || "(not updated)",
    });
    return json(200, { ok: true });
  } catch (e) {
    console.error("[game-session-set-settings] unexpected error", e);
    return json(500, { ok: false, error: "internal_error" });
  }
});
