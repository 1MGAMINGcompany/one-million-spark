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

    // Auth: get wallet from session token (NEVER trust client)
    const senderWallet = await getAuthedWallet(req, supabase);
    if (!senderWallet) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const {
      recipientWallet,
      roomPda,
      gameType,
      gameName,
      stakeSol,
      winnerPayout,
      turnTimeSeconds,
      maxPlayers,
      mode,
    } = body;

    // Validate recipientWallet format (Solana base58 address)
    if (!recipientWallet || recipientWallet.length < 32 || recipientWallet.length > 44) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid recipient wallet" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Can't invite yourself
    if (recipientWallet === senderWallet) {
      return new Response(
        JSON.stringify({ success: false, error: "Cannot invite yourself" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate roomPda
    if (!roomPda || roomPda.length < 32) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid room" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Insert invite using service role (bypasses RLS)
    const { data: invite, error: insertError } = await supabase
      .from("game_invites")
      .insert({
        room_pda: roomPda,
        sender_wallet: senderWallet, // From token, NOT from client
        recipient_wallet: recipientWallet,
        game_type: gameType || "unknown",
        game_name: gameName || null,
        stake_sol: stakeSol || 0,
        winner_payout: winnerPayout || 0,
        turn_time_seconds: turnTimeSeconds || 60,
        max_players: maxPlayers || 2,
        mode: mode || "private",
        status: "pending",
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("[send-invite] Insert error:", insertError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to create invite" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, inviteId: invite.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    console.error("[send-invite] Error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
