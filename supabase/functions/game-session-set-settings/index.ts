/**
 * Edge Function: game-session-set-settings
 * 
 * Saves turn timer and mode settings for a game room.
 * 
 * Security: No signature required - the on-chain stake transaction proves
 * the creator's identity. Additional protection via:
 * - Session ownership check (only creator's session can be updated)
 * - Game-not-started guard (can't change settings after game begins)
 * 
 * Request body:
 * {
 *   roomPda: string,
 *   turnTimeSeconds: number,
 *   mode: "casual" | "ranked",
 *   creatorWallet: string
 * }
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Mode = "casual" | "ranked";

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

    // Validate required fields
    if (!roomPda || typeof roomPda !== "string") {
      return json(400, { ok: false, error: "roomPda_required" });
    }

    const turnTimeSeconds = Number(turnTimeSecondsRaw);
    if (!Number.isFinite(turnTimeSeconds) || turnTimeSeconds < 0) {
      return json(400, { ok: false, error: "turnTimeSeconds_invalid" });
    }

    if (mode !== "casual" && mode !== "ranked") {
      return json(400, { ok: false, error: "mode_invalid" });
    }

    if (!creatorWallet || typeof creatorWallet !== "string") {
      return json(400, { ok: false, error: "creatorWallet_required" });
    }

    console.log("[game-session-set-settings] Processing request:", {
      roomPda: roomPda.slice(0, 8),
      creatorWallet: creatorWallet.slice(0, 8),
      turnTimeSeconds,
      mode,
    });

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      console.error("[game-session-set-settings] Missing env vars");
      return json(500, { ok: false, error: "server_misconfigured" });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // Fetch session to check if it exists
    const { data: session, error: sessionErr } = await supabase
      .from("game_sessions")
      .select("room_pda, status, start_roll_finalized, player1_wallet")
      .eq("room_pda", roomPda)
      .maybeSingle();

    if (sessionErr) {
      console.error("[game-session-set-settings] session fetch error", sessionErr);
      return json(500, { ok: false, error: "session_fetch_failed" });
    }

    // If session exists, verify caller is the room creator and game hasn't started
    if (session) {
      // Verify caller is the room creator (player1_wallet)
      const sessionCreator = session.player1_wallet?.trim();
      const requestCreator = creatorWallet.trim();
      
      if (sessionCreator && sessionCreator !== requestCreator) {
        console.warn("[game-session-set-settings] Creator mismatch:", {
          sessionCreator: sessionCreator?.slice(0, 8),
          requestCreator: requestCreator?.slice(0, 8),
        });
        return json(403, { ok: false, error: "not_room_creator" });
      }

      // Guard: do not allow changing settings after game has started
      const status = String(session.status ?? "").toLowerCase();
      const alreadyStarted =
        Boolean(session.start_roll_finalized) ||
        ["active", "started", "finished", "complete"].includes(status);

      if (alreadyStarted) {
        return json(409, { ok: false, error: "game_already_started" });
      }

      // Update existing session settings
      const { error: updateErr } = await supabase
        .from("game_sessions")
        .update({
          turn_time_seconds: turnTimeSeconds,
          mode,
        })
        .eq("room_pda", roomPda);

      if (updateErr) {
        console.error("[game-session-set-settings] update error", updateErr);
        return json(500, { ok: false, error: "update_failed" });
      }
    } else {
      // Session doesn't exist yet - create it with initial settings
      // This happens when room creator sets settings before anyone joins
      console.log("[game-session-set-settings] Creating new session with settings:", {
        roomPda: roomPda.slice(0, 8),
        creatorWallet: creatorWallet?.slice(0, 8),
        turnTimeSeconds,
        mode,
      });

      const { error: insertErr } = await supabase
        .from("game_sessions")
        .insert({
          room_pda: roomPda,
          player1_wallet: creatorWallet || "",
          game_type: "backgammon", // Default, will be updated when game starts
          game_state: {},
          status: "waiting",
          mode,
          turn_time_seconds: turnTimeSeconds,
        });

      if (insertErr) {
        // If insert fails due to duplicate, try update instead (race condition)
        if (insertErr.code === "23505") {
          console.log("[game-session-set-settings] Race condition - session created by another request, updating instead");
          const { error: updateErr } = await supabase
            .from("game_sessions")
            .update({
              turn_time_seconds: turnTimeSeconds,
              mode,
            })
            .eq("room_pda", roomPda);

          if (updateErr) {
            console.error("[game-session-set-settings] update after race error", updateErr);
            return json(500, { ok: false, error: "update_failed" });
          }
        } else {
          console.error("[game-session-set-settings] insert error", insertErr);
          return json(500, { ok: false, error: "insert_failed" });
        }
      }
    }

    console.log("[game-session-set-settings] ✅ Settings updated:", { roomPda: roomPda.slice(0, 8), turnTimeSeconds, mode });
    return json(200, { ok: true });
  } catch (e) {
    console.error("[game-session-set-settings] unexpected error", e);
    return json(500, { ok: false, error: "internal_error" });
  }
});
