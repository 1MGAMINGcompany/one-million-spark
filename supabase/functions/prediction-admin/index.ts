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

    if (action === "createFight") {
      const { title, fighter_a_name, fighter_b_name, event_name } = body;
      if (!title || !fighter_a_name || !fighter_b_name) {
        return new Response(JSON.stringify({ error: "Missing fight details" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data, error } = await supabase
        .from("prediction_fights")
        .insert({
          title,
          fighter_a_name,
          fighter_b_name,
          event_name: event_name || "",
        })
        .select()
        .single();

      if (error) throw error;
      return new Response(JSON.stringify({ fight: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
      return new Response(JSON.stringify({ fight: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "resolveFight") {
      const { fight_id, winner } = body;
      if (!winner || !["fighter_a", "fighter_b"].includes(winner)) {
        return new Response(JSON.stringify({ error: "Invalid winner" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const now = new Date();
      const claimsOpenAt = new Date(now.getTime() + 5 * 60 * 1000); // +5 min

      const { data, error } = await supabase
        .from("prediction_fights")
        .update({
          status: "resolved",
          winner,
          resolved_at: now.toISOString(),
          claims_open_at: claimsOpenAt.toISOString(),
        })
        .eq("id", fight_id)
        .eq("status", "locked")
        .select()
        .single();

      if (error) throw error;
      return new Response(JSON.stringify({ fight: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
