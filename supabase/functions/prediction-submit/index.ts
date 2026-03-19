import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MIN_PREDICTION_USD = 1.0; // $1 minimum prediction
const FEE_BPS = 500; // 5% platform fee

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

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
    const {
      fight_id,
      wallet,
      fighter_pick,
      amount_usd,
      // Legacy fields accepted but ignored for backward compat
      amount_lamports: _legacyLamports,
      tx_signature: _legacyTxSig,
    } = body;

    // ── Kill switch check ──
    const { data: settings } = await supabase
      .from("prediction_settings")
      .select("predictions_enabled")
      .eq("id", "global")
      .single();

    if (settings && !settings.predictions_enabled) {
      return json({ error: "Predictions are currently disabled by admin" }, 403);
    }

    if (!fight_id || !wallet || !fighter_pick || !amount_usd) {
      return json({ error: "Missing required fields (fight_id, wallet, fighter_pick, amount_usd)" }, 400);
    }

    if (!["fighter_a", "fighter_b"].includes(fighter_pick)) {
      return json({ error: "Invalid fighter_pick" }, 400);
    }

    const parsedAmount = Number(amount_usd);
    if (isNaN(parsedAmount) || parsedAmount < MIN_PREDICTION_USD) {
      return json({ error: `Minimum prediction is $${MIN_PREDICTION_USD}` }, 400);
    }

    const normalizedWallet = String(wallet).trim();
    if (!normalizedWallet || normalizedWallet.length < 10) {
      return json({ error: "Invalid wallet address" }, 400);
    }

    const fee_usd = Number((parsedAmount * FEE_BPS / 10_000).toFixed(6));
    const pool_usd = Number((parsedAmount - fee_usd).toFixed(6));
    // Shares are integer cents for atomic pool math
    const shares = Math.floor(pool_usd * 100);

    // ── Validate fight exists and is open ──
    const { data: fight, error: fightErr } = await supabase
      .from("prediction_fights")
      .select("*")
      .eq("id", fight_id)
      .single();

    if (fightErr || !fight) return json({ error: "Fight not found" }, 404);
    if (fight.status !== "open") {
      return json({ error: "Predictions are closed for this fight" }, 400);
    }

    // ── TODO: Polymarket integration point ──
    // When Polymarket is connected, execute the trade here:
    // 1. Call Polymarket CLOB API to place the order
    // 2. Verify the fill / partial fill
    // 3. Store the Polymarket order ID on the entry
    // For now, we record the prediction entry server-side without on-chain execution.

    // ── Insert prediction entry (USD-based) ──
    const { data: entry, error: insertErr } = await supabase
      .from("prediction_entries")
      .insert({
        fight_id,
        wallet: normalizedWallet,
        fighter_pick,
        amount_usd: parsedAmount,
        fee_usd,
        pool_usd,
        shares,
        // Legacy columns set to 0 for schema compatibility
        amount_lamports: 0,
        fee_lamports: 0,
        pool_lamports: 0,
      })
      .select()
      .single();

    if (insertErr) throw insertErr;

    // ── Update fight pool totals (USD) ──
    const { error: updateErr } = await supabase.rpc("prediction_update_pool_usd", {
      p_fight_id: fight_id,
      p_pool_usd: pool_usd,
      p_shares: shares,
      p_side: fighter_pick,
    });

    if (updateErr) {
      // Fallback: direct update
      const poolCol = fighter_pick === "fighter_a" ? "pool_a_usd" : "pool_b_usd";
      const sharesCol = fighter_pick === "fighter_a" ? "shares_a" : "shares_b";
      const newPoolVal =
        (fighter_pick === "fighter_a" ? fight.pool_a_usd : fight.pool_b_usd) + pool_usd;
      const newSharesVal =
        (fighter_pick === "fighter_a" ? fight.shares_a : fight.shares_b) + shares;

      await supabase
        .from("prediction_fights")
        .update({
          [poolCol]: newPoolVal,
          [sharesCol]: newSharesVal,
        })
        .eq("id", fight_id);
    }

    return json({
      success: true,
      entry,
      pool_contribution_usd: pool_usd,
      fee_usd,
      shares,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
