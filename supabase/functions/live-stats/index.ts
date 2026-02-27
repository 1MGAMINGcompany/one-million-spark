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
    const { action, sessionId, page, game, difficulty, event, duration_seconds, lang, device, referrer } = await req.json();

    // Geo: extract country from Cloudflare/proxy headers
    const country = req.headers.get("cf-ipcountry")
      || req.headers.get("x-country-code")
      || null;

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

      // Step 1: Try INSERT for brand-new sessions (silently ignored on conflict)
      await supabase.from("presence_heartbeats").insert({
        session_id: sessionId,
        last_seen: now,
        page: page ?? null,
        game: game ?? null,
        first_seen_date: todayDate,
        first_seen_at: now,
        country: country ?? null,
        lang: lang ?? null,
        device: device ?? null,
        referrer: referrer ?? null,
      });

      // Step 2: UPDATE — always set page & game (including null) to fix sticky game bug
      const { error } = await supabase
        .from("presence_heartbeats")
        .update({
          last_seen: now,
          page: page ?? null,
          game: game ?? null,
          // Update country on every heartbeat (may change with VPN, etc.)
          ...(country ? { country } : {}),
          // Only set lang/device/referrer if provided (first heartbeat sets them)
          ...(lang ? { lang } : {}),
          ...(device ? { device } : {}),
          ...(referrer ? { referrer } : {}),
        })
        .eq("session_id", sessionId);

      if (error) throw error;

      // Step 3: Reset first_seen for returning visitors on a new day
      // Only fires when first_seen_date is from a previous day
      await supabase
        .from("presence_heartbeats")
        .update({
          first_seen_date: todayDate,
          first_seen_at: now,
        })
        .eq("session_id", sessionId)
        .lt("first_seen_date", todayDate);

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

      // Unique visitors in last 24 hours
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count: visitsToday, error: e4 } = await supabase
        .from("presence_heartbeats")
        .select("*", { count: "exact", head: true })
        .gte("last_seen", twentyFourHoursAgo);
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

      // Average dwell time for currently active sessions (last 10 min)
      const { data: dwellRows, error: e6 } = await supabase
        .from("presence_heartbeats")
        .select("first_seen_at, last_seen")
        .gte("last_seen", tenMinAgo)
        .not("first_seen_at", "is", null);
      if (e6) throw e6;

      let avgDwellSeconds = 0;
      if (dwellRows && dwellRows.length > 0) {
        const totalSeconds = dwellRows.reduce((sum: number, r: any) => {
          const diff = (new Date(r.last_seen).getTime() - new Date(r.first_seen_at).getTime()) / 1000;
          return sum + Math.max(0, diff);
        }, 0);
        avgDwellSeconds = Math.round(totalSeconds / dwellRows.length);
      }

      // Garbage collect heartbeats older than 25 hours (keeps full 24h rolling window intact).
      const gcCutoff = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
      await supabase
        .from("presence_heartbeats")
        .delete()
        .lt("last_seen", gcCutoff);

      return new Response(
        JSON.stringify({
          browsing: browsing ?? 0,
          roomsWaiting: roomsWaiting ?? 0,
          playingAI: playingAI ?? 0,
          aiGamesToday: aiGamesToday ?? 0,
          visitsToday: visitsToday ?? 0,
          avgDwellSeconds,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── TRACK MONKEY (AI Helper analytics) ─────────────────────────────────
    if (action === "track_monkey") {
      const VALID_EVENTS = [
        "bubble_open", "welcome_shown", "welcome_action",
        "mode_selected", "message_sent", "chat_cleared",
        "share_tapped", "chip_tapped",
        "nudge_dismissed", "nudge_play_free", "nudge_ask_money",
        "autosheet_shown", "autosheet_dismissed", "autosheet_play_free", "autosheet_quick_match",
        "idle_nudge", "pvp_blocked_toast", "navbar_show", "hidden",
        "assist_action", "wallet_copied",
      ];

      const monkeyEvent = event as string;
      const context = (page as string) || "unknown";
      const metadata = (difficulty as string) || null; // reuse field for metadata
      const monkeyLang = (game as string) || "en";     // reuse field for lang

      if (
        !sessionId || typeof sessionId !== "string" || sessionId.length > 64 ||
        !VALID_EVENTS.includes(monkeyEvent)
      ) {
        return new Response(JSON.stringify({ error: "invalid monkey payload" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error } = await supabase.from("monkey_analytics").insert({
        session_id: sessionId,
        event: monkeyEvent,
        context,
        metadata,
        lang: monkeyLang,
      });

      if (error) throw error;

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
