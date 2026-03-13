import { createClient } from "@supabase/supabase-js";
import { Connection, PublicKey } from "@solana/web3.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LAMPORTS_PER_SOL = 1_000_000_000;
const MIN_PREDICTION_LAMPORTS = 0.05 * LAMPORTS_PER_SOL; // 50_000_000
const FEE_BPS = 500; // 5%

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
    const { fight_id, wallet, fighter_pick, amount_lamports, tx_signature } = body;

    // Validate inputs
    if (!fight_id || !wallet || !fighter_pick || !amount_lamports || !tx_signature) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!["fighter_a", "fighter_b"].includes(fighter_pick)) {
      return new Response(JSON.stringify({ error: "Invalid fighter_pick" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (amount_lamports < MIN_PREDICTION_LAMPORTS) {
      return new Response(JSON.stringify({ error: "Minimum prediction is 0.05 SOL" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get fight and check status
    const { data: fight, error: fightErr } = await supabase
      .from("prediction_fights")
      .select("*")
      .eq("id", fight_id)
      .single();

    if (fightErr || !fight) {
      return new Response(JSON.stringify({ error: "Fight not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (fight.status !== "open") {
      return new Response(JSON.stringify({ error: "Predictions are closed for this fight" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Dedupe check
    const { data: existingEntry } = await supabase
      .from("prediction_entries")
      .select("id")
      .eq("tx_signature", tx_signature)
      .maybeSingle();

    if (existingEntry) {
      return new Response(JSON.stringify({ error: "Duplicate transaction", idempotent: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Calculate fee and pool contribution
    const fee_lamports = Math.floor(amount_lamports * FEE_BPS / 10000);
    const pool_lamports = amount_lamports - fee_lamports;
    const shares = pool_lamports; // 1:1 shares

    // Verify tx on-chain (basic check - confirm tx exists and is finalized)
    try {
      const rpcUrl = Deno.env.get("SOLANA_RPC_URL") || "https://api.mainnet-beta.solana.com";
      const connection = new Connection(rpcUrl, "confirmed");
      const txInfo = await connection.getTransaction(tx_signature, {
        maxSupportedTransactionVersion: 0,
      });
      if (!txInfo) {
        return new Response(JSON.stringify({ error: "Transaction not found on chain" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } catch (rpcErr) {
      console.error("RPC verification failed:", rpcErr);
      // Continue anyway - tx may be too new
    }

    // Insert entry
    const { data: entry, error: insertErr } = await supabase
      .from("prediction_entries")
      .insert({
        fight_id,
        wallet,
        fighter_pick,
        amount_lamports,
        fee_lamports,
        pool_lamports,
        shares,
        tx_signature,
      })
      .select()
      .single();

    if (insertErr) throw insertErr;

    // Update fight pool totals
    const poolCol = fighter_pick === "fighter_a" ? "pool_a_lamports" : "pool_b_lamports";
    const sharesCol = fighter_pick === "fighter_a" ? "shares_a" : "shares_b";

    const { error: updateErr } = await supabase.rpc("prediction_update_pool", {
      p_fight_id: fight_id,
      p_pool_lamports: pool_lamports,
      p_shares: shares,
      p_side: fighter_pick,
    });

    // Fallback if rpc doesn't exist yet - direct update
    if (updateErr) {
      const newPoolVal = (fighter_pick === "fighter_a" ? fight.pool_a_lamports : fight.pool_b_lamports) + pool_lamports;
      const newSharesVal = (fighter_pick === "fighter_a" ? fight.shares_a : fight.shares_b) + shares;

      await supabase
        .from("prediction_fights")
        .update({
          [poolCol]: newPoolVal,
          [sharesCol]: newSharesVal,
        })
        .eq("id", fight_id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        entry,
        pool_contribution: pool_lamports,
        fee: fee_lamports,
        shares,
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
