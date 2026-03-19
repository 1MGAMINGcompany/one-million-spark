import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface PredictionEntry {
  wallet: string;
  amount_usd: number | null;
  amount_lamports: number;
  reward_usd: number | null;
  reward_lamports: number | null;
  fighter_pick: string;
  created_at: string;
  prediction_fights: { status: string; winner: string | null } | null;
}

interface WalletStats {
  total_predictions: number;
  wins: number;
  losses: number;
  total_usd_played: number;
  total_usd_won: number;
}

/** Get entry amount in USD — prefers new column, falls back to legacy lamports */
function entryAmountUsd(e: PredictionEntry): number {
  if (e.amount_usd != null && Number(e.amount_usd) > 0) return Number(e.amount_usd);
  return (e.amount_lamports || 0) / 1e9;
}

function entryRewardUsd(e: PredictionEntry): number {
  if (e.reward_usd != null && Number(e.reward_usd) > 0) return Number(e.reward_usd);
  return (e.reward_lamports || 0) / 1e9;
}

function aggregateEntries(entries: PredictionEntry[]): Map<string, WalletStats> {
  const map = new Map<string, WalletStats>();

  for (const e of entries) {
    if (!e.wallet) continue;

    let stats = map.get(e.wallet);
    if (!stats) {
      stats = { total_predictions: 0, wins: 0, losses: 0, total_usd_played: 0, total_usd_won: 0 };
      map.set(e.wallet, stats);
    }

    stats.total_predictions++;
    stats.total_usd_played += entryAmountUsd(e);

    const fight = e.prediction_fights;
    if (fight && fight.winner && ["confirmed", "settled"].includes(fight.status)) {
      if (fight.winner === e.fighter_pick) {
        stats.wins++;
        stats.total_usd_won += entryRewardUsd(e);
      } else {
        stats.losses++;
      }
    }
  }

  return map;
}

async function fetchAllEntries(supabase: any): Promise<PredictionEntry[]> {
  const all: PredictionEntry[] = [];
  let offset = 0;
  const batchSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from("prediction_entries")
      .select("wallet, amount_usd, amount_lamports, reward_usd, reward_lamports, fighter_pick, created_at, prediction_fights(status, winner)")
      .range(offset, offset + batchSize - 1);

    if (error) {
      console.error("[rebuild-leaderboard] Fetch error at offset", offset, error);
      break;
    }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < batchSize) break;
    offset += batchSize;
  }

  return all;
}

async function fetchAllProfiles(supabase: any) {
  const all: any[] = [];
  let offset = 0;
  const batchSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from("player_profiles")
      .select("wallet, games_played, wins, losses, total_sol_won")
      .range(offset, offset + batchSize - 1);

    if (error || !data || data.length === 0) break;
    all.push(...data);
    if (data.length < batchSize) break;
    offset += batchSize;
  }

  return all;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const { adminWallet } = await req.json();

    if (!adminWallet || typeof adminWallet !== "string" || adminWallet.length < 32) {
      return Response.json({ success: false, error: "invalid_admin_wallet" }, { headers: corsHeaders });
    }

    const { data: admin } = await supabase
      .from("prediction_admins")
      .select("wallet")
      .eq("wallet", adminWallet)
      .maybeSingle();

    if (!admin) {
      return Response.json({ success: false, error: "not_admin" }, { headers: corsHeaders });
    }

    const entries = await fetchAllEntries(supabase);
    const now = new Date();

    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const dailyEntries = entries.filter((e) => e.created_at >= todayStart);
    const weeklyEntries = entries.filter((e) => e.created_at >= weekStart);

    const periodData = [
      { period: "all_time", data: aggregateEntries(entries) },
      { period: "weekly", data: aggregateEntries(weeklyEntries) },
      { period: "daily", data: aggregateEntries(dailyEntries) },
    ];

    const profiles = await fetchAllProfiles(supabase);
    const profileMap = new Map<string, { games_played: number; wins: number; losses: number; total_sol_won: number }>();
    for (const p of profiles) {
      profileMap.set(p.wallet, p);
    }

    const rows: any[] = [];

    for (const { period, data } of periodData) {
      const predList = Array.from(data.entries())
        .map(([wallet, stats]) => ({
          wallet,
          ...stats,
          net_sol: stats.total_usd_won - stats.total_usd_played,
          win_rate: stats.total_predictions > 0 ? stats.wins / stats.total_predictions : 0,
        }))
        .sort((a, b) => b.net_sol - a.net_sol || b.wins - a.wins);

      predList.forEach((entry, idx) => {
        rows.push({
          wallet: entry.wallet,
          category: "predictions",
          period,
          total_entries: entry.total_predictions,
          wins: entry.wins,
          losses: entry.losses,
          total_sol_played: Math.round(entry.total_usd_played * 1e6) / 1e6,
          total_sol_won: Math.round(entry.total_usd_won * 1e6) / 1e6,
          net_sol: Math.round(entry.net_sol * 1e6) / 1e6,
          win_rate: Math.round(entry.win_rate * 1000) / 1000,
          rank: idx + 1,
          updated_at: now.toISOString(),
        });
      });
    }

    // Combined leaderboard (all_time only)
    const predAllTime = periodData[0].data;
    const allWallets = new Set<string>();
    predAllTime.forEach((_, w) => allWallets.add(w));
    profileMap.forEach((_, w) => allWallets.add(w));

    const combinedList = Array.from(allWallets)
      .map((wallet) => {
        const pred = predAllTime.get(wallet) || {
          total_predictions: 0, wins: 0, losses: 0, total_usd_played: 0, total_usd_won: 0,
        };
        const profile = profileMap.get(wallet) || {
          games_played: 0, wins: 0, losses: 0, total_sol_won: 0,
        };

        const totalEntries = profile.games_played + pred.total_predictions;
        const totalWins = profile.wins + pred.wins;
        const totalLosses = profile.losses + pred.losses;
        const totalWon = Number(profile.total_sol_won) + pred.total_usd_won;
        const netAmount = totalWon - pred.total_usd_played;

        return {
          wallet,
          total_entries: totalEntries,
          wins: totalWins,
          losses: totalLosses,
          total_sol_played: pred.total_usd_played,
          total_sol_won: totalWon,
          net_sol: netAmount,
          win_rate: totalEntries > 0 ? totalWins / totalEntries : 0,
        };
      })
      .filter((e) => e.total_entries > 0)
      .sort((a, b) => b.net_sol - a.net_sol || b.wins - a.wins);

    combinedList.forEach((entry, idx) => {
      rows.push({
        wallet: entry.wallet,
        category: "combined",
        period: "all_time",
        total_entries: entry.total_entries,
        wins: entry.wins,
        losses: entry.losses,
        total_sol_played: Math.round(entry.total_sol_played * 1e6) / 1e6,
        total_sol_won: Math.round(entry.total_sol_won * 1e6) / 1e6,
        net_sol: Math.round(entry.net_sol * 1e6) / 1e6,
        win_rate: Math.round(entry.win_rate * 1000) / 1000,
        rank: idx + 1,
        updated_at: now.toISOString(),
      });
    });

    // Clear existing cache
    await supabase.from("leaderboard_cache").delete().eq("category", "predictions");
    await supabase.from("leaderboard_cache").delete().eq("category", "combined");

    // Insert in batches
    for (let i = 0; i < rows.length; i += 500) {
      const batch = rows.slice(i, i + 500);
      const { error: insertErr } = await supabase
        .from("leaderboard_cache")
        .upsert(batch, { onConflict: "wallet,category,period" });
      if (insertErr) {
        console.error("[rebuild-leaderboard] Insert error:", insertErr);
      }
    }

    console.log(`[rebuild-leaderboard] ✅ Rebuilt ${rows.length} rows for admin ${adminWallet.slice(0, 8)}`);

    return Response.json(
      { success: true, rows_written: rows.length },
      { headers: corsHeaders }
    );
  } catch (err) {
    console.error("[rebuild-leaderboard] Error:", err);
    return Response.json(
      { success: false, error: "server_error" },
      { headers: corsHeaders, status: 500 }
    );
  }
});
