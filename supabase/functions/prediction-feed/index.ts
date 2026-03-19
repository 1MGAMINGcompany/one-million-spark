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

    const url = new URL(req.url);
    const fight_id = url.searchParams.get("fight_id");

    let query = supabase
      .from("prediction_entries")
      .select("id, fight_id, wallet, fighter_pick, amount_usd, amount_lamports, created_at")
      .order("created_at", { ascending: false })
      .limit(50);

    if (fight_id) {
      query = query.eq("fight_id", fight_id);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Truncate wallets for privacy
    const feed = (data || []).map((e: any) => ({
      ...e,
      wallet_short: e.wallet ? `${e.wallet.slice(0, 4)}...${e.wallet.slice(-4)}` : "anon",
    }));

    return new Response(JSON.stringify({ feed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
