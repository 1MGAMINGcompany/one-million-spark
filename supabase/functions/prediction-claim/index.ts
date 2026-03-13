import { createClient } from "@supabase/supabase-js";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import bs58 from "bs58";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── V1 Safety Guardrails ──
const MAX_CLAIM_LAMPORTS = 5 * LAMPORTS_PER_SOL;       // 5 SOL per single claim
const DAILY_CEILING_LAMPORTS = 50 * LAMPORTS_PER_SOL;  // 50 SOL daily total payouts

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

    // ── GUARDRAIL 1: Per-claim cap ──
    if (rewardLamports > MAX_CLAIM_LAMPORTS) {
      return new Response(JSON.stringify({
        error: "Claim exceeds per-claim safety limit",
        max_sol: MAX_CLAIM_LAMPORTS / LAMPORTS_PER_SOL,
        reward_sol: rewardLamports / LAMPORTS_PER_SOL,
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── GUARDRAIL 2: Daily payout ceiling ──
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const { data: dailyClaims, error: dcErr } = await supabase
      .from("prediction_entries")
      .select("reward_lamports")
      .eq("claimed", true)
      .not("reward_lamports", "is", null)
      .gte("created_at", todayStart.toISOString());

    if (dcErr) throw dcErr;

    const dailyTotal = (dailyClaims || []).reduce(
      (sum: number, e: any) => sum + Number(e.reward_lamports || 0), 0
    );

    if (dailyTotal + rewardLamports > DAILY_CEILING_LAMPORTS) {
      return new Response(JSON.stringify({
        error: "Daily payout ceiling reached. Please try again tomorrow.",
        daily_limit_sol: DAILY_CEILING_LAMPORTS / LAMPORTS_PER_SOL,
        already_paid_sol: dailyTotal / LAMPORTS_PER_SOL,
      }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Prepare hot payout wallet ──
    const verifierKey = Deno.env.get("VERIFIER_SECRET_KEY_V2") || Deno.env.get("VERIFIER_SECRET_KEY");
    if (!verifierKey) {
      return new Response(JSON.stringify({ error: "Payout wallet not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rpcUrl = Deno.env.get("SOLANA_RPC_URL") || "https://api.mainnet-beta.solana.com";
    const connection = new Connection(rpcUrl, "confirmed");
    const vaultKeypair = Keypair.fromSecretKey(bs58.decode(verifierKey));

    // ── GUARDRAIL 3: Balance pre-check ──
    const vaultBalance = await connection.getBalance(vaultKeypair.publicKey);
    const minReserve = 5000; // keep ~0.000005 SOL for rent

    if (vaultBalance < rewardLamports + minReserve) {
      return new Response(JSON.stringify({
        error: "Insufficient payout wallet funds. The team has been notified.",
        required_sol: rewardLamports / LAMPORTS_PER_SOL,
      }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
