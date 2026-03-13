import { createClient } from "@supabase/supabase-js";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import bs58 from "bs58";

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
    const { fight_id, wallet } = body;

    if (!fight_id || !wallet) {
      return new Response(JSON.stringify({ error: "Missing fight_id or wallet" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get fight
    const { data: fight, error: fErr } = await supabase
      .from("prediction_fights")
      .select("*")
      .eq("id", fight_id)
      .single();

    if (fErr || !fight) {
      return new Response(JSON.stringify({ error: "Fight not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (fight.status !== "resolved") {
      return new Response(JSON.stringify({ error: "Fight not resolved yet" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check 5-minute delay
    if (fight.claims_open_at && new Date() < new Date(fight.claims_open_at)) {
      const remaining = Math.ceil((new Date(fight.claims_open_at).getTime() - Date.now()) / 1000);
      return new Response(JSON.stringify({ error: "Claims not open yet", remaining_seconds: remaining }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user's entries for this fight on the winning side
    const { data: entries, error: eErr } = await supabase
      .from("prediction_entries")
      .select("*")
      .eq("fight_id", fight_id)
      .eq("wallet", wallet)
      .eq("fighter_pick", fight.winner)
      .eq("claimed", false);

    if (eErr) throw eErr;

    if (!entries || entries.length === 0) {
      return new Response(JSON.stringify({ error: "No unclaimed winning predictions" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Calculate total user shares
    const userShares = entries.reduce((sum: number, e: any) => sum + Number(e.shares), 0);

    // Total winning pool shares
    const totalWinningShares = fight.winner === "fighter_a"
      ? Number(fight.shares_a)
      : Number(fight.shares_b);

    if (totalWinningShares <= 0) {
      return new Response(JSON.stringify({ error: "No winning shares in pool" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Total pool (both sides)
    const totalPool = Number(fight.pool_a_lamports) + Number(fight.pool_b_lamports);

    // User reward
    const rewardLamports = Math.floor((userShares / totalWinningShares) * totalPool);

    // Send SOL to winner from verifier/vault keypair
    const verifierKey = Deno.env.get("VERIFIER_SECRET_KEY_V2") || Deno.env.get("VERIFIER_SECRET_KEY");
    if (!verifierKey) {
      return new Response(JSON.stringify({ error: "Vault keypair not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rpcUrl = Deno.env.get("SOLANA_RPC_URL") || "https://api.mainnet-beta.solana.com";
    const connection = new Connection(rpcUrl, "confirmed");
    const vaultKeypair = Keypair.fromSecretKey(bs58.decode(verifierKey));

    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: vaultKeypair.publicKey,
        toPubkey: new PublicKey(wallet),
        lamports: rewardLamports,
      })
    );

    const signature = await sendAndConfirmTransaction(connection, tx, [vaultKeypair]);

    // Mark entries as claimed
    const entryIds = entries.map((e: any) => e.id);
    await supabase
      .from("prediction_entries")
      .update({ claimed: true, reward_lamports: rewardLamports })
      .in("id", entryIds);

    return new Response(
      JSON.stringify({
        success: true,
        reward_lamports: rewardLamports,
        reward_sol: rewardLamports / 1_000_000_000,
        signature,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
