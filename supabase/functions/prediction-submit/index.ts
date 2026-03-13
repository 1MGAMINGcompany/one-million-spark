import { createClient } from "@supabase/supabase-js";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MIN_PREDICTION_LAMPORTS = 0.05 * LAMPORTS_PER_SOL;
const FEE_BPS = 500;
const FEE_WALLET = "GA4oxfEHPCjo7KTLWMyxjq2J5tEScihqvFh5rFMM88JX";

type SolTransfer = {
  from: string;
  to: string;
  lamports: number;
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function parseTransferInstruction(ix: any): SolTransfer | null {
  if (!ix || ix.program !== "system" || ix.parsed?.type !== "transfer") {
    return null;
  }

  const info = ix.parsed?.info;
  if (!info?.source || !info?.destination || typeof info.lamports !== "number") {
    return null;
  }

  return {
    from: String(info.source),
    to: String(info.destination),
    lamports: Number(info.lamports),
  };
}

function extractTransfers(parsedTx: any): SolTransfer[] {
  const transfers: SolTransfer[] = [];

  for (const ix of parsedTx?.transaction?.message?.instructions ?? []) {
    const parsed = parseTransferInstruction(ix);
    if (parsed) transfers.push(parsed);
  }

  for (const inner of parsedTx?.meta?.innerInstructions ?? []) {
    for (const ix of inner.instructions ?? []) {
      const parsed = parseTransferInstruction(ix);
      if (parsed) transfers.push(parsed);
    }
  }

  return transfers;
}

function loadPredictionPoolWallet(): string {
  const keyCandidates = [
    Deno.env.get("PREDICTION_VERIFIER_SECRET_KEY"),
    Deno.env.get("VERIFIER_SECRET_KEY_V2"),
    Deno.env.get("VERIFIER_SECRET_KEY"),
  ].filter((v): v is string => !!v);

  for (const raw of keyCandidates) {
    try {
      const keypair = Keypair.fromSecretKey(bs58.decode(raw));
      return keypair.publicKey.toBase58();
    } catch {
      // Try next candidate
    }
  }

  throw new Error("Prediction payout wallet secret is not configured");
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
    const {
      fight_id,
      wallet,
      fighter_pick,
      amount_lamports,
      fee_lamports: feeLamportsFromClient,
      pool_lamports: poolLamportsFromClient,
      tx_signature,
    } = body;

    if (!fight_id || !wallet || !fighter_pick || !amount_lamports || !tx_signature) {
      return json({ error: "Missing required fields" }, 400);
    }

    if (!["fighter_a", "fighter_b"].includes(fighter_pick)) {
      return json({ error: "Invalid fighter_pick" }, 400);
    }

    const parsedAmount = Number(amount_lamports);
    if (!Number.isInteger(parsedAmount) || parsedAmount < MIN_PREDICTION_LAMPORTS) {
      return json({ error: "Minimum prediction is 0.05 SOL" }, 400);
    }

    let normalizedWallet: string;
    try {
      normalizedWallet = new PublicKey(String(wallet)).toBase58();
    } catch {
      return json({ error: "Invalid wallet address" }, 400);
    }

    const fee_lamports = Math.floor((parsedAmount * FEE_BPS) / 10_000);
    const pool_lamports = parsedAmount - fee_lamports;
    const shares = pool_lamports;

    if (
      feeLamportsFromClient !== undefined &&
      Number(feeLamportsFromClient) !== fee_lamports
    ) {
      return json({ error: "Invalid fee_lamports from client" }, 400);
    }

    if (
      poolLamportsFromClient !== undefined &&
      Number(poolLamportsFromClient) !== pool_lamports
    ) {
      return json({ error: "Invalid pool_lamports from client" }, 400);
    }

    const { data: fight, error: fightErr } = await supabase
      .from("prediction_fights")
      .select("*")
      .eq("id", fight_id)
      .single();

    if (fightErr || !fight) return json({ error: "Fight not found" }, 404);
    if (fight.status !== "open") {
      return json({ error: "Predictions are closed for this fight" }, 400);
    }

    const { data: existingEntry } = await supabase
      .from("prediction_entries")
      .select("id")
      .eq("tx_signature", tx_signature)
      .maybeSingle();

    if (existingEntry) {
      return json({ error: "Duplicate transaction", idempotent: true });
    }

    const poolWallet = loadPredictionPoolWallet();

    const rpcUrl = Deno.env.get("SOLANA_RPC_URL") || "https://api.mainnet-beta.solana.com";
    const connection = new Connection(rpcUrl, "confirmed");

    const txInfo = await connection.getParsedTransaction(String(tx_signature), {
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed",
    });

    if (!txInfo) {
      return json({ error: "Transaction not found on chain" }, 400);
    }

    const transfers = extractTransfers(txInfo);

    const feePaid = transfers
      .filter((t) => t.from === normalizedWallet && t.to === FEE_WALLET)
      .reduce((sum, t) => sum + t.lamports, 0);

    const poolPaid = transfers
      .filter((t) => t.from === normalizedWallet && t.to === poolWallet)
      .reduce((sum, t) => sum + t.lamports, 0);

    if (feePaid !== fee_lamports || poolPaid !== pool_lamports) {
      return json(
        {
          error: "On-chain transfer validation failed",
          expected: {
            fee_wallet: FEE_WALLET,
            fee_lamports,
            pool_wallet: poolWallet,
            pool_lamports,
          },
          actual: {
            fee_lamports: feePaid,
            pool_lamports: poolPaid,
          },
        },
        400
      );
    }

    const { data: entry, error: insertErr } = await supabase
      .from("prediction_entries")
      .insert({
        fight_id,
        wallet: normalizedWallet,
        fighter_pick,
        amount_lamports: parsedAmount,
        fee_lamports,
        pool_lamports,
        shares,
        tx_signature,
      })
      .select()
      .single();

    if (insertErr) throw insertErr;

    const poolCol = fighter_pick === "fighter_a" ? "pool_a_lamports" : "pool_b_lamports";
    const sharesCol = fighter_pick === "fighter_a" ? "shares_a" : "shares_b";

    const { error: updateErr } = await supabase.rpc("prediction_update_pool", {
      p_fight_id: fight_id,
      p_pool_lamports: pool_lamports,
      p_shares: shares,
      p_side: fighter_pick,
    });

    if (updateErr) {
      const newPoolVal =
        (fighter_pick === "fighter_a" ? fight.pool_a_lamports : fight.pool_b_lamports) +
        pool_lamports;
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
      pool_contribution: pool_lamports,
      fee: fee_lamports,
      shares,
      fee_wallet: FEE_WALLET,
      pool_wallet: poolWallet,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
