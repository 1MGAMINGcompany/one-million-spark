import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, sessionId, page, game, difficulty, event, duration_seconds } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── HEARTBEAT ──────────────────────────────────────────────────────────────
    if (action === "heartbeat") {
      if (!sessionId || typeof sessionId !== "string" || sessionId.length > 64) {
        return new Response(JSON.stringify({ error: "invalid session_id" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const now = new Date().toISOString();
      const todayDate = now.split("T")[0]; // "YYYY-MM-DD"

      // Step 1: Try INSERT — sets first_seen_date on the very first visit
      // Will silently fail (no error thrown) if session_id already exists
      await supabase.from("presence_heartbeats").insert({
        session_id: sessionId,
        last_seen: now,
        page: page ?? null,
        game: game ?? null,
        first_seen_date: todayDate,
      });

      // Step 2: Always UPDATE non-date fields — preserves first_seen_date
      const { error } = await supabase
        .from("presence_heartbeats")
        .update({
          last_seen: now,
          ...(page != null ? { page } : {}),
          ...(game != null ? { game } : {}),
        })
        .eq("session_id", sessionId);

      if (error) throw error;

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── TRACK AI EVENT ─────────────────────────────────────────────────────────
    if (action === "track_ai_event") {
      const VALID_GAMES = ["chess", "checkers", "backgammon", "dominos", "ludo"];
      const VALID_EVENTS = ["game_started", "game_won", "game_lost", "game_abandoned"];
      const VALID_DIFFICULTIES = ["easy", "medium", "hard"];

      if (
        !sessionId || typeof sessionId !== "string" || sessionId.length > 64 ||
        !VALID_GAMES.includes(game) ||
        !VALID_EVENTS.includes(event) ||
        !VALID_DIFFICULTIES.includes(difficulty)
      ) {
        return new Response(JSON.stringify({ error: "invalid payload" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error } = await supabase.from("ai_game_events").insert({
        session_id: sessionId,
        game,
        difficulty,
        event,
        duration_seconds: typeof duration_seconds === "number" ? duration_seconds : null,
      });

      if (error) throw error;

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── STATS ──────────────────────────────────────────────────────────────────
    if (action === "stats") {
      // Extended to 10 minutes for a more accurate "browsing now" count
      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const todayDate = new Date().toISOString().split("T")[0]; // "YYYY-MM-DD"

      // Total browsing (all heartbeats in last 10 min)
      const { count: browsing, error: e1 } = await supabase
        .from("presence_heartbeats")
        .select("*", { count: "exact", head: true })
        .gte("last_seen", tenMinAgo);
      if (e1) throw e1;

      // Active AI players (heartbeats with a game column set, last 10 min)
      const { count: playingAI, error: e2 } = await supabase
        .from("presence_heartbeats")
        .select("*", { count: "exact", head: true })
        .not("game", "is", null)
        .gte("last_seen", tenMinAgo);
      if (e2) throw e2;

      // Rooms waiting (status_int = 1, created in last 15 min)
      const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const { count: roomsWaiting, error: e3 } = await supabase
        .from("game_sessions")
        .select("*", { count: "exact", head: true })
        .eq("status_int", 1)
        .gte("created_at", fifteenMinAgo);
      if (e3) throw e3;

      // Unique visitors today (distinct sessions with first_seen_date = today)
      const { count: visitsToday, error: e4 } = await supabase
        .from("presence_heartbeats")
        .select("*", { count: "exact", head: true })
        .eq("first_seen_date", todayDate);
      if (e4) throw e4;

      // AI games started today
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { count: aiGamesToday, error: e5 } = await supabase
        .from("ai_game_events")
        .select("*", { count: "exact", head: true })
        .eq("event", "game_started")
        .gte("created_at", todayStart.toISOString());
      if (e5) throw e5;

      // Garbage collect old heartbeats (older than 15 min)
      const gcCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      await supabase.from("presence_heartbeats").delete().lt("last_seen", gcCutoff);

      return new Response(
        JSON.stringify({
          browsing: browsing ?? 0,
          roomsWaiting: roomsWaiting ?? 0,
          playingAI: playingAI ?? 0,
          aiGamesToday: aiGamesToday ?? 0,
          visitsToday: visitsToday ?? 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[live-stats]", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
