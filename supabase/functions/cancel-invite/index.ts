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

    const body = await req.json();
    const { inviteId } = body;

    if (!inviteId) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing invite ID" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch the invite
    const { data: invite, error: fetchError } = await supabase
      .from("game_invites")
      .select("*")
      .eq("id", inviteId)
      .single();

    if (fetchError || !invite) {
      return new Response(
        JSON.stringify({ success: false, error: "Invite not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify authedWallet is the sender
    if (invite.sender_wallet !== authedWallet) {
      return new Response(
        JSON.stringify({ success: false, error: "Not authorized to cancel this invite" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Delete the invite
    const { error: deleteError } = await supabase
      .from("game_invites")
      .delete()
      .eq("id", inviteId);

    if (deleteError) {
      console.error("[cancel-invite] Delete error:", deleteError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to cancel invite" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    console.error("[cancel-invite] Error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
