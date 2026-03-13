import { createClient } from "@supabase/supabase-js";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import bs58 from "bs58";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_REFUND_LAMPORTS = 5 * LAMPORTS_PER_SOL;
const DAILY_CEILING_LAMPORTS = 50 * LAMPORTS_PER_SOL;

function loadPredictionVerifier() {
  const keyCandidates = [
    { value: Deno.env.get("PREDICTION_VERIFIER_SECRET_KEY"), source: "PREDICTION_VERIFIER_SECRET_KEY" },
    { value: Deno.env.get("VERIFIER_SECRET_KEY_V2"), source: "VERIFIER_SECRET_KEY_V2" },
    { value: Deno.env.get("VERIFIER_SECRET_KEY"), source: "VERIFIER_SECRET_KEY" },
  ];

  for (const candidate of keyCandidates) {
    if (!candidate.value) continue;

    try {
      return {
        keypair: Keypair.fromSecretKey(bs58.decode(candidate.value)),
        source: candidate.source,
      };
    } catch {
      // Try next key
    }
  }

  return null;
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

    const body = await req.json();
    const { fight_id, wallet } = body;

    if (!fight_id || !wallet) {
      return res({ error: "Missing fight_id or wallet" }, 400);
    }

    // Verify admin
    const { data: admin } = await supabase
      .from("prediction_admins")
      .select("wallet")
      .eq("wallet", wallet)
      .single();

    if (!admin) {
      return res({ error: "Unauthorized" }, 403);
    }

    // Get fight
    const { data: fight, error: fErr } = await supabase
      .from("prediction_fights")
      .select("*")
      .eq("id", fight_id)
      .single();

    if (fErr || !fight) return res({ error: "Fight not found" }, 404);

    if (fight.status !== "refund_pending") {
      return res({ error: "Fight must be in refund_pending status" }, 400);
    }

    // Set to processing
    await supabase
      .from("prediction_fights")
      .update({ status: "refunds_processing", refund_status: "processing" })
      .eq("id", fight_id);

    // Get all entries
    const { data: entries, error: eErr } = await supabase
      .from("prediction_entries")
      .select("*")
      .eq("fight_id", fight_id)
      .eq("claimed", false);

    if (eErr) throw eErr;

    if (!entries || entries.length === 0) {
      // No entries to refund — mark complete
      await supabase
        .from("prediction_fights")
        .update({
          status: "refunds_complete",
          refund_status: "complete",
          refunds_completed_at: new Date().toISOString(),
        })
        .eq("id", fight_id);

      return res({ success: true, refunded: 0 });
    }

    // Prepare payout wallet
    const verifier = loadPredictionVerifier();
    if (!verifier) {
      await supabase
        .from("prediction_fights")
        .update({ refund_status: "failed" })
        .eq("id", fight_id);
      return res({ error: "Prediction payout wallet not configured" }, 500);
    }

    const rpcUrl = Deno.env.get("SOLANA_RPC_URL") || "https://api.mainnet-beta.solana.com";
    const connection = new Connection(rpcUrl, "confirmed");
    const vaultKeypair = verifier.keypair;

    let refundedCount = 0;
    let failedCount = 0;
    const failedEntries: string[] = [];

    for (const entry of entries) {
      const refundAmount = Number(entry.pool_lamports);

      if (refundAmount <= 0) continue;

      // Per-refund cap
      if (refundAmount > MAX_REFUND_LAMPORTS) {
        failedEntries.push(entry.id);
        failedCount++;
        continue;
      }

      try {
        // Balance check
        const balance = await connection.getBalance(vaultKeypair.publicKey);
        if (balance < refundAmount + 5000) {
          failedEntries.push(entry.id);
          failedCount++;
          continue;
        }

        const tx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: vaultKeypair.publicKey,
            toPubkey: new PublicKey(entry.wallet),
            lamports: refundAmount,
          })
        );

        const sig = await sendAndConfirmTransaction(connection, tx, [vaultKeypair]);

        // Mark as claimed (refunded)
        await supabase
          .from("prediction_entries")
          .update({ claimed: true, reward_lamports: refundAmount })
          .eq("id", entry.id);

        refundedCount++;
      } catch (txErr) {
        console.error(`Refund failed for entry ${entry.id}:`, txErr);
        failedEntries.push(entry.id);
        failedCount++;
      }
    }

    // Update fight status
    if (failedCount === 0) {
      await supabase
        .from("prediction_fights")
        .update({
          status: "refunds_complete",
          refund_status: "complete",
          refunds_completed_at: new Date().toISOString(),
        })
        .eq("id", fight_id);
    } else {
      await supabase
        .from("prediction_fights")
        .update({ refund_status: "failed" })
        .eq("id", fight_id);
    }

    return res({
      success: failedCount === 0,
      refunded: refundedCount,
      failed: failedCount,
      failed_entries: failedEntries,
    });
  } catch (err) {
    return res({ error: err.message }, 500);
  }
});

function res(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
