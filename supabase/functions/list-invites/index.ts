import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// deno-lint-ignore no-explicit-any
async function getAuthedWallet(
  req: Request,
  supabase: any
): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.replace("Bearer ", "");
  if (!token || token.length < 30) return null;

  const { data, error } = await supabase
    .from("game_acceptances")
    .select("player_wallet, session_expires_at")
    .eq("session_token", token)
    .gt("session_expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;
  return data.player_wallet;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Auth: get wallet from session token
    const authedWallet = await getAuthedWallet(req, supabase);
    if (!authedWallet) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const status = body.status || "pending";
    const direction = body.direction || "incoming"; // "incoming" | "outgoing" | "both"

    // Build query based on direction
    let query = supabase
      .from("game_invites")
      .select("*")
      .order("created_at", { ascending: false });

    // Filter by direction
    if (direction === "incoming") {
      query = query.eq("recipient_wallet", authedWallet);
    } else if (direction === "outgoing") {
      query = query.eq("sender_wallet", authedWallet);
    } else {
      // "both" - get invites where user is sender OR recipient
      query = query.or(`recipient_wallet.eq.${authedWallet},sender_wallet.eq.${authedWallet}`);
    }

    // Filter by status
    if (status === "pending") {
      query = query
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString());
    }
    // "all" = no status filter

    const { data: invites, error } = await query;

    if (error) {
      console.error("[list-invites] Query error:", error);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to fetch invites" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, invites: invites || [] }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    console.error("[list-invites] Error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
