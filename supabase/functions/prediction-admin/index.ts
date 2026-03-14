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
        .update({ status: "approved" })
        .eq("id", event_id)
        .eq("status", "draft")
        .select()
        .single();

      if (error) throw error;
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

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
