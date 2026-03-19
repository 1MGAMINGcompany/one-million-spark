import { createClient } from "@supabase/supabase-js";

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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { action, wallet } = body;

    if (!wallet || !action) {
      return new Response(JSON.stringify({ error: "Missing wallet or action" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify admin
    const { data: admin } = await supabase
      .from("prediction_admins")
      .select("wallet")
      .eq("wallet", wallet)
      .single();

    if (!admin) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const json = (data: any, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    // ── Event Management ──

    if (action === "createEvent") {
      const { event_name, organization, event_date, location, auto_resolve, is_test } = body;
      if (!event_name) return json({ error: "Missing event_name" }, 400);

      const { data, error } = await supabase
        .from("prediction_events")
        .insert({
          event_name,
          organization: organization || null,
          event_date: event_date || null,
          location: location || null,
          auto_resolve: auto_resolve ?? false,
          is_test: is_test ?? false,
          status: "draft",
        })
        .select()
        .single();

      if (error) throw error;
      return json({ event: data });
    }

    if (action === "approveEvent") {
      const { event_id } = body;
      const { data, error } = await supabase
        .from("prediction_events")
        .update({
          status: "approved",
          auto_resolve: true,
          admin_approved_at: new Date().toISOString(),
          automation_status: "scheduled",
        })
        .eq("id", event_id)
        .eq("status", "draft")
        .select()
        .single();

      if (error) throw error;

      // Also enable auto_resolve on all fights under this event
      await supabase
        .from("prediction_fights")
        .update({ auto_resolve: true })
        .eq("event_id", event_id);

      return json({ event: data });
    }

    if (action === "rejectEvent") {
      const { event_id } = body;
      const { data, error } = await supabase
        .from("prediction_events")
        .update({ status: "rejected" })
        .eq("id", event_id)
        .eq("status", "draft")
        .select()
        .single();

      if (error) throw error;
      return json({ event: data });
    }

    if (action === "deleteTestEvent") {
      const { event_id } = body;
      // Verify it's a test event
      const { data: evt } = await supabase
        .from("prediction_events")
        .select("is_test")
        .eq("id", event_id)
        .single();

      if (!evt?.is_test) return json({ error: "Can only delete test events" }, 400);

      // Delete fights first, then event
      await supabase.from("prediction_fights").delete().eq("event_id", event_id);
      const { error } = await supabase.from("prediction_events").delete().eq("id", event_id);
      if (error) throw error;
      return json({ deleted: true });
    }

    // ── Fight Management ──

    if (action === "createFight") {
      const { title, fighter_a_name, fighter_b_name, event_name, event_id, weight_class, fight_class } = body;
      if (!title || !fighter_a_name || !fighter_b_name) {
        return json({ error: "Missing fight details" }, 400);
      }

      const { data, error } = await supabase
        .from("prediction_fights")
        .insert({
          title,
          fighter_a_name,
          fighter_b_name,
          event_name: event_name || "",
          event_id: event_id || null,
          weight_class: weight_class || null,
          fight_class: fight_class || null,
          source: "manual",
          commission_bps: 500, // 5% for native 1MGAMING events
        })
        .select()
        .single();

      if (error) throw error;
      return json({ fight: data });
    }

    if (action === "lockPredictions") {
      const { fight_id } = body;
      const { data, error } = await supabase
        .from("prediction_fights")
        .update({ status: "locked" })
        .eq("id", fight_id)
        .eq("status", "open")
        .select()
        .single();

      if (error) throw error;
      return json({ fight: data });
    }

    if (action === "markLive") {
      const { fight_id } = body;
      const { data, error } = await supabase
        .from("prediction_fights")
        .update({ status: "live" })
        .eq("id", fight_id)
        .eq("status", "locked")
        .select()
        .single();

      if (error) throw error;
      return json({ fight: data });
    }

    if (action === "forceLiveEvent") {
      const { event_id } = body;
      if (!event_id) return json({ error: "Missing event_id" }, 400);

      // Force all locked/open fights to live for this event
      const { data: updated, error } = await supabase
        .from("prediction_fights")
        .update({ status: "live" })
        .eq("event_id", event_id)
        .in("status", ["locked", "open"])
        .select("id");

      if (error) throw error;

      const count = updated?.length ?? 0;

      // Audit log
      await supabase.from("automation_logs").insert({
        action: "force_live_event",
        event_id,
        source: "prediction-admin",
        admin_wallet: wallet,
        details: { forced_live_fights: count },
      });

      return json({ forced_live: count });
    }

    if (action === "selectResult") {
      const { fight_id, winner } = body;
      if (!winner || !["fighter_a", "fighter_b"].includes(winner)) {
        return json({ error: "Invalid winner" }, 400);
      }

      const { data, error } = await supabase
        .from("prediction_fights")
        .update({ status: "result_selected", winner })
        .eq("id", fight_id)
        .eq("status", "live")
        .select()
        .single();

      if (error) throw error;
      return json({ fight: data });
    }

    if (action === "setMethod") {
      const { fight_id, method } = body;
      if (!method) return json({ error: "Missing method" }, 400);

      const { data, error } = await supabase
        .from("prediction_fights")
        .update({ method })
        .eq("id", fight_id)
        .eq("status", "result_selected")
        .select()
        .single();

      if (error) throw error;
      return json({ fight: data });
    }

    if (action === "confirmResult") {
      const { fight_id } = body;

      // Must be result_selected
      const { data: fight } = await supabase
        .from("prediction_fights")
        .select("status, winner")
        .eq("id", fight_id)
        .single();

      if (!fight || fight.status !== "result_selected") {
        return json({ error: "Fight must be in result_selected status" }, 400);
      }
      if (!fight.winner) {
        return json({ error: "No winner selected" }, 400);
      }

      const now = new Date();
      const claimsOpenAt = new Date(now.getTime() + 5 * 60 * 1000);

      const { data, error } = await supabase
        .from("prediction_fights")
        .update({
          status: "confirmed",
          confirmed_at: now.toISOString(),
          resolved_at: now.toISOString(),
          claims_open_at: claimsOpenAt.toISOString(),
        })
        .eq("id", fight_id)
        .eq("status", "result_selected")
        .select()
        .single();

      if (error) throw error;
      return json({ fight: data });
    }

    if (action === "settleEvent") {
      const { fight_id } = body;

      const { data: fight } = await supabase
        .from("prediction_fights")
        .select("status, claims_open_at")
        .eq("id", fight_id)
        .single();

      if (!fight || fight.status !== "confirmed") {
        return json({ error: "Fight must be confirmed before settling" }, 400);
      }

      // Check that claims timer has elapsed
      if (fight.claims_open_at && new Date() < new Date(fight.claims_open_at)) {
        return json({ error: "Safety timer has not elapsed yet" }, 400);
      }

      const { data, error } = await supabase
        .from("prediction_fights")
        .update({
          status: "settled",
          settled_at: new Date().toISOString(),
        })
        .eq("id", fight_id)
        .eq("status", "confirmed")
        .select()
        .single();

      if (error) throw error;
      return json({ fight: data });
    }

    if (action === "declareDraw") {
      const { fight_id } = body;

      const { data: fight } = await supabase
        .from("prediction_fights")
        .select("status")
        .eq("id", fight_id)
        .single();

      if (!fight || !["live", "result_selected"].includes(fight.status)) {
        return json({ error: "Can only declare draw when live or result_selected" }, 400);
      }

      const { data, error } = await supabase
        .from("prediction_fights")
        .update({
          status: "draw",
          winner: null,
          method: null,
        })
        .eq("id", fight_id)
        .select()
        .single();

      if (error) throw error;
      return json({ fight: data });
    }

    if (action === "startRefunds") {
      const { fight_id } = body;

      const { data: fight } = await supabase
        .from("prediction_fights")
        .select("status")
        .eq("id", fight_id)
        .single();

      if (!fight || fight.status !== "draw") {
        return json({ error: "Can only start refunds when status is draw" }, 400);
      }

      const { data, error } = await supabase
        .from("prediction_fights")
        .update({
          status: "refund_pending",
          refund_status: "pending",
          refunds_started_at: new Date().toISOString(),
        })
        .eq("id", fight_id)
        .eq("status", "draw")
        .select()
        .single();

      if (error) throw error;
      return json({ fight: data });
    }

    // Legacy compat: resolveFight still works but maps to selectResult flow
    if (action === "resolveFight") {
      const { fight_id, winner } = body;
      if (!winner || !["fighter_a", "fighter_b"].includes(winner)) {
        return json({ error: "Invalid winner" }, 400);
      }

      const now = new Date();
      const claimsOpenAt = new Date(now.getTime() + 5 * 60 * 1000);

      const { data, error } = await supabase
        .from("prediction_fights")
        .update({
          status: "confirmed",
          winner,
          resolved_at: now.toISOString(),
          confirmed_at: now.toISOString(),
          claims_open_at: claimsOpenAt.toISOString(),
        })
        .eq("id", fight_id)
        .in("status", ["locked", "live", "result_selected"])
        .select()
        .single();

      if (error) throw error;
      return json({ fight: data });
    }

    if (action === "getSettings") {
      const { data, error } = await supabase
        .from("prediction_settings")
        .select("*")
        .eq("id", "global")
        .single();
      if (error) throw error;
      return json({ settings: data });
    }

    if (action === "updateSettings") {
      const { predictions_enabled, claims_enabled, automation_enabled } = body;
      const updates: Record<string, any> = { updated_at: new Date().toISOString() };
      if (typeof predictions_enabled === "boolean") updates.predictions_enabled = predictions_enabled;
      if (typeof claims_enabled === "boolean") updates.claims_enabled = claims_enabled;
      if (typeof automation_enabled === "boolean") updates.automation_enabled = automation_enabled;

      const { data, error } = await supabase
        .from("prediction_settings")
        .update(updates)
        .eq("id", "global")
        .select()
        .single();
      if (error) throw error;
      return json({ settings: data });
    }

    // ── Event Cleanup Actions ──

    if (action === "dismissEvent") {
      const { event_id } = body;
      if (!event_id) return json({ error: "Missing event_id" }, 400);

      const { data, error } = await supabase
        .from("prediction_events")
        .update({ status: "dismissed", updated_at: new Date().toISOString() })
        .eq("id", event_id)
        .select()
        .single();

      if (error) throw error;

      // Log the action
      await supabase.from("automation_logs").insert({
        action: "dismiss_event",
        event_id,
        admin_wallet: wallet,
        source: "admin_manual",
        details: { event_name: data.event_name },
      });

      return json({ event: data });
    }

    if (action === "archiveEvent") {
      const { event_id } = body;
      if (!event_id) return json({ error: "Missing event_id" }, 400);

      const { data, error } = await supabase
        .from("prediction_events")
        .update({ status: "archived", updated_at: new Date().toISOString() })
        .eq("id", event_id)
        .select()
        .single();

      if (error) throw error;

      await supabase.from("automation_logs").insert({
        action: "archive_event",
        event_id,
        admin_wallet: wallet,
        source: "admin_manual",
        details: { event_name: data.event_name },
      });

      return json({ event: data });
    }

    if (action === "deleteEvent") {
      const { event_id } = body;
      if (!event_id) return json({ error: "Missing event_id" }, 400);

      // Check for prediction entries on any fight under this event
      const { data: eventFights } = await supabase
        .from("prediction_fights")
        .select("id")
        .eq("event_id", event_id);

      const fightIds = (eventFights || []).map((f: any) => f.id);

      if (fightIds.length > 0) {
        const { count } = await supabase
          .from("prediction_entries")
          .select("id", { count: "exact", head: true })
          .in("fight_id", fightIds);

        if (count && count > 0) {
          return json({ error: "Cannot delete event with existing predictions. Use Archive instead." }, 400);
        }
      }

      // Safe to delete - remove fights first, then event
      if (fightIds.length > 0) {
        await supabase.from("prediction_fights").delete().eq("event_id", event_id);
      }

      // Get event name for logging before deleting
      const { data: evt } = await supabase
        .from("prediction_events")
        .select("event_name")
        .eq("id", event_id)
        .single();

      const { error } = await supabase.from("prediction_events").delete().eq("id", event_id);
      if (error) throw error;

      await supabase.from("automation_logs").insert({
        action: "delete_event",
        event_id,
        admin_wallet: wallet,
        source: "admin_manual",
        details: { event_name: evt?.event_name || "unknown" },
      });

      return json({ deleted: true });
    }

    if (action === "pauseAutomation") {
      const { event_id } = body;
      if (!event_id) return json({ error: "Missing event_id" }, 400);

      const { data, error } = await supabase
        .from("prediction_events")
        .update({ automation_paused: true, updated_at: new Date().toISOString() })
        .eq("id", event_id)
        .select()
        .single();

      if (error) throw error;

      await supabase.from("automation_logs").insert({
        action: "pause_automation",
        event_id,
        admin_wallet: wallet,
        source: "admin_manual",
        details: { event_name: data.event_name },
      });

      return json({ event: data });
    }

    if (action === "resumeAutomation") {
      const { event_id } = body;
      if (!event_id) return json({ error: "Missing event_id" }, 400);

      const { data, error } = await supabase
        .from("prediction_events")
        .update({ automation_paused: false, updated_at: new Date().toISOString() })
        .eq("id", event_id)
        .select()
        .single();

      if (error) throw error;

      await supabase.from("automation_logs").insert({
        action: "resume_automation",
        event_id,
        admin_wallet: wallet,
        source: "admin_manual",
        details: { event_name: data.event_name },
      });

      return json({ event: data });
    }

    if (action === "forceResultSync") {
      const { event_id } = body;
      if (!event_id) return json({ error: "Missing event_id" }, 400);

      // Get event details
      const { data: evt } = await supabase
        .from("prediction_events")
        .select("id, event_name, source_provider, source_event_id, auto_resolve, status")
        .eq("id", event_id)
        .single();

      if (!evt) return json({ error: "Event not found" }, 404);
      if (evt.source_provider !== "api-football") {
        return json({ error: "Force Result Sync is only available for API-Football events" }, 400);
      }
      if (!evt.source_event_id) {
        return json({ error: "Event has no source_event_id" }, 400);
      }

      const apifbKey = Deno.env.get("API_FOOTBALL_KEY");
      if (!apifbKey) return json({ error: "API_FOOTBALL_KEY not configured" }, 500);

      const fixtureId = evt.source_event_id.replace("apifb_", "");
      const APIFB_BASE = "https://v3.football.api-sports.io";
      const apiRes = await fetch(`${APIFB_BASE}/fixtures?id=${fixtureId}`, {
        headers: { "x-apisports-key": apifbKey },
      });

      if (!apiRes.ok) {
        return json({ error: `API-Football returned HTTP ${apiRes.status}` }, 502);
      }

      const apiData = await apiRes.json();
      const fixture = apiData?.response?.[0];

      if (!fixture) {
        return json({ error: "No fixture data from API-Football", fixture_id: fixtureId }, 404);
      }

      const fixStatus = (fixture.fixture?.status?.short || "").toUpperCase();
      const fixLong = fixture.fixture?.status?.long || "";
      const homeScore = fixture.goals?.home;
      const awayScore = fixture.goals?.away;
      const homeTeam = fixture.teams?.home?.name;
      const awayTeam = fixture.teams?.away?.name;
      const isFinished = ["FT", "AET", "PEN", "AWD", "WO"].includes(fixStatus);

      // Log the sync attempt
      await supabase.from("automation_logs").insert({
        action: "force_result_sync",
        event_id,
        admin_wallet: wallet,
        source: "prediction-admin",
        details: {
          fixture_id: fixtureId,
          api_status: fixStatus,
          api_status_long: fixLong,
          home: homeTeam,
          away: awayTeam,
          home_score: homeScore,
          away_score: awayScore,
          is_finished: isFinished,
        },
      });

      if (!isFinished) {
        return json({
          synced: false,
          message: `Match is not finished yet (status: ${fixStatus} — ${fixLong})`,
          fixture_status: fixStatus,
          scores: homeScore != null ? `${homeScore}-${awayScore}` : null,
        });
      }

      if (homeScore == null || awayScore == null) {
        return json({ synced: false, message: "Match finished but scores unavailable", fixture_status: fixStatus });
      }

      // Get active fights for this event
      const { data: dbFights } = await supabase
        .from("prediction_fights")
        .select("id, fighter_a_name, fighter_b_name, status, winner, confirmed_at")
        .eq("event_id", event_id)
        .in("status", ["live", "locked"]);

      if (!dbFights || dbFights.length === 0) {
        return json({ synced: false, message: "No active fights to resolve for this event" });
      }

      let resolved = 0;
      let draws = 0;
      const fightResults: any[] = [];

      for (const fight of dbFights) {
        if (fight.winner || fight.confirmed_at) continue;

        if (homeScore === awayScore) {
          // Draw handling
          await supabase.from("prediction_fights").update({
            status: "draw",
            winner: null,
            method: `Draw ${homeScore}-${awayScore}`,
          }).eq("id", fight.id).in("status", ["live", "locked"]);

          await supabase.from("prediction_fights").update({
            status: "refund_pending",
            refund_status: "pending",
            refunds_started_at: new Date().toISOString(),
          }).eq("id", fight.id).eq("status", "draw");

          await supabase.from("automation_logs").insert({
            action: "force_sync_draw",
            event_id,
            fight_id: fight.id,
            admin_wallet: wallet,
            source: "prediction-admin",
            details: { score: `${homeScore}-${awayScore}` },
          });

          draws++;
          fightResults.push({ fight_id: fight.id, outcome: "draw" });
          continue;
        }

        const norm = (s: string) => s.toLowerCase().trim().replace(/\s+/g, " ");
        const winnerTeam = homeScore > awayScore ? homeTeam : awayTeam;
        const winner = norm(winnerTeam) === norm(fight.fighter_a_name) ? "fighter_a"
                     : norm(winnerTeam) === norm(fight.fighter_b_name) ? "fighter_b"
                     : null;

        if (!winner) {
          fightResults.push({ fight_id: fight.id, outcome: "name_mismatch", winnerTeam });
          continue;
        }

        const now = new Date();
        const claimsOpenAt = new Date(now.getTime() + 3 * 60 * 1000);

        await supabase.from("prediction_fights").update({
          status: "result_selected",
          winner,
          method: `${homeScore}-${awayScore}`,
          resolved_at: now.toISOString(),
        }).eq("id", fight.id).in("status", ["live", "locked"]);

        await supabase.from("prediction_fights").update({
          status: "confirmed",
          confirmed_at: now.toISOString(),
          claims_open_at: claimsOpenAt.toISOString(),
        }).eq("id", fight.id).eq("status", "result_selected");

        await supabase.from("automation_logs").insert({
          action: "force_sync_confirmed",
          event_id,
          fight_id: fight.id,
          admin_wallet: wallet,
          source: "prediction-admin",
          confidence: 0.95,
          details: { winner, score: `${homeScore}-${awayScore}`, claims_open_at: claimsOpenAt.toISOString() },
        });

        resolved++;
        fightResults.push({ fight_id: fight.id, outcome: "confirmed", winner });
      }

      return json({
        synced: true,
        fixture_status: fixStatus,
        score: `${homeScore}-${awayScore}`,
        resolved,
        draws,
        fights: fightResults,
      });
    }

    // ── System Controls ──

    if (action === "getSystemControls") {
      const { data, error } = await supabase
        .from("prediction_system_controls")
        .select("*")
        .limit(1)
        .single();
      if (error) throw error;
      return json({ controls: data });
    }

    if (action === "updateSystemControls") {
      const {
        predictions_enabled,
        new_orders_enabled,
        max_order_usdc,
        max_daily_user_usdc,
        default_fee_bps,
        max_slippage_bps,
        allowed_market_mode,
      } = body;

      // Validate numeric fields
      if (max_order_usdc !== undefined && (typeof max_order_usdc !== "number" || max_order_usdc <= 0 || max_order_usdc > 100000)) {
        return json({ error: "max_order_usdc must be between 0 and 100,000" }, 400);
      }
      if (max_daily_user_usdc !== undefined && (typeof max_daily_user_usdc !== "number" || max_daily_user_usdc <= 0 || max_daily_user_usdc > 1000000)) {
        return json({ error: "max_daily_user_usdc must be between 0 and 1,000,000" }, 400);
      }
      if (default_fee_bps !== undefined && (typeof default_fee_bps !== "number" || default_fee_bps < 0 || default_fee_bps > 5000)) {
        return json({ error: "default_fee_bps must be between 0 and 5000 (0-50%)" }, 400);
      }
      if (max_slippage_bps !== undefined && (typeof max_slippage_bps !== "number" || max_slippage_bps < 0 || max_slippage_bps > 10000)) {
        return json({ error: "max_slippage_bps must be between 0 and 10000 (0-100%)" }, 400);
      }
      if (allowed_market_mode !== undefined && !["allowlist", "all", "none"].includes(allowed_market_mode)) {
        return json({ error: "allowed_market_mode must be one of: allowlist, all, none" }, 400);
      }

      const updates: Record<string, any> = { updated_at: new Date().toISOString() };
      if (typeof predictions_enabled === "boolean") updates.predictions_enabled = predictions_enabled;
      if (typeof new_orders_enabled === "boolean") updates.new_orders_enabled = new_orders_enabled;
      if (max_order_usdc !== undefined) updates.max_order_usdc = max_order_usdc;
      if (max_daily_user_usdc !== undefined) updates.max_daily_user_usdc = max_daily_user_usdc;
      if (default_fee_bps !== undefined) updates.default_fee_bps = default_fee_bps;
      if (max_slippage_bps !== undefined) updates.max_slippage_bps = max_slippage_bps;
      if (allowed_market_mode !== undefined) updates.allowed_market_mode = allowed_market_mode;

      // Get the first (and only) row
      const { data: existing } = await supabase
        .from("prediction_system_controls")
        .select("id")
        .limit(1)
        .single();

      if (!existing) return json({ error: "System controls row not found" }, 500);

      const { data, error } = await supabase
        .from("prediction_system_controls")
        .update(updates)
        .eq("id", existing.id)
        .select()
        .single();

      if (error) throw error;

      // Audit log
      await supabase.from("automation_logs").insert({
        action: "update_system_controls",
        admin_wallet: wallet,
        source: "prediction-admin",
        details: updates,
      });

      return json({ controls: data });
    }

    // ── Market Allowlist Toggle ──

    if (action === "toggleTrading") {
      const { fight_id, trading_allowed } = body;
      if (!fight_id || typeof trading_allowed !== "boolean") {
        return json({ error: "Missing fight_id or trading_allowed" }, 400);
      }

      const { data, error } = await supabase
        .from("prediction_fights")
        .update({ trading_allowed, updated_at: new Date().toISOString() })
        .eq("id", fight_id)
        .select("id, trading_allowed")
        .single();

      if (error) throw error;

      await supabase.from("automation_logs").insert({
        action: "toggle_trading",
        fight_id,
        admin_wallet: wallet,
        source: "prediction-admin",
        details: { trading_allowed },
      });

      return json({ fight: data });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
