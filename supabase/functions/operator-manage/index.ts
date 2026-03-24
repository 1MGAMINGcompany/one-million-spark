import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-privy-token, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Minimal Privy token verification — extract DID from JWT claims. */
function extractPrivyDid(token: string): string | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (payload.iss !== "privy.io") return null;
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action } = body;

    // Auth
    const privyToken = req.headers.get("x-privy-token");
    if (!privyToken) return jsonResp({ error: "unauthorized" }, 401);

    const privyDid = extractPrivyDid(privyToken);
    if (!privyDid) return jsonResp({ error: "invalid_token" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // ── get_my_operator ──
    if (action === "get_my_operator") {
      const { data: op } = await sb
        .from("operators")
        .select("*, operator_settings(*)")
        .eq("user_id", privyDid)
        .maybeSingle();
      return jsonResp({ operator: op });
    }

    // ── create_operator ──
    if (action === "create_operator") {
      // Check duplicate
      const { data: existing } = await sb
        .from("operators")
        .select("id")
        .eq("user_id", privyDid)
        .maybeSingle();
      if (existing) {
        return jsonResp({ error: "operator_exists", operator_id: existing.id }, 409);
      }

      // Subdomain availability
      const { data: subCheck } = await sb
        .from("operators")
        .select("id")
        .eq("subdomain", body.subdomain)
        .maybeSingle();
      if (subCheck) {
        return jsonResp({ error: "subdomain_taken" }, 409);
      }

      const { data: operator, error } = await sb
        .from("operators")
        .insert({
          user_id: privyDid,
          brand_name: body.brand_name,
          subdomain: body.subdomain,
          logo_url: body.logo_url || null,
          theme: body.theme || "blue",
          fee_percent: body.fee_percent ?? 5,
        })
        .select()
        .single();
      if (error) throw error;

      // Default settings
      await sb.from("operator_settings").insert({
        operator_id: operator.id,
        allowed_sports: body.allowed_sports || ["Soccer", "MMA", "Boxing"],
        show_polymarket_events: true,
        show_platform_events: true,
      });

      return jsonResp({ operator });
    }

    // ── update_operator ──
    if (action === "update_operator") {
      const { data: op } = await sb
        .from("operators")
        .select("id")
        .eq("user_id", privyDid)
        .single();
      if (!op) return jsonResp({ error: "not_found" }, 404);

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (body.brand_name) updates.brand_name = body.brand_name;
      if (body.logo_url !== undefined) updates.logo_url = body.logo_url;
      if (body.theme) updates.theme = body.theme;
      if (body.fee_percent !== undefined) updates.fee_percent = body.fee_percent;

      const { error } = await sb.from("operators").update(updates).eq("id", op.id);
      if (error) throw error;
      return jsonResp({ success: true });
    }

    // ── update_settings ──
    if (action === "update_settings") {
      const { data: op } = await sb
        .from("operators")
        .select("id")
        .eq("user_id", privyDid)
        .single();
      if (!op) return jsonResp({ error: "not_found" }, 404);

      const { error } = await sb
        .from("operator_settings")
        .update({
          allowed_sports: body.allowed_sports,
          show_polymarket_events: body.show_polymarket_events,
          show_platform_events: body.show_platform_events,
          homepage_layout: body.homepage_layout,
          featured_event_ids: body.featured_event_ids,
        })
        .eq("operator_id", op.id);
      if (error) throw error;
      return jsonResp({ success: true });
    }

    // ── create_event ──
    if (action === "create_event") {
      const { data: op } = await sb
        .from("operators")
        .select("id")
        .eq("user_id", privyDid)
        .single();
      if (!op) return jsonResp({ error: "not_found" }, 404);

      const { data: event, error } = await sb
        .from("operator_events")
        .insert({
          operator_id: op.id,
          title: body.title,
          sport: body.sport,
          team_a: body.team_a,
          team_b: body.team_b,
          event_date: body.event_date || null,
          image_url: body.image_url || null,
          is_featured: body.is_featured || false,
          status: "draft",
        })
        .select()
        .single();
      if (error) throw error;
      return jsonResp({ event });
    }

    return jsonResp({ error: "unknown_action" }, 400);
  } catch (err: any) {
    return jsonResp({ error: err.message || String(err) }, 500);
  }
});
