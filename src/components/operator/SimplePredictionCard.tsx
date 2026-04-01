import { useMemo } from "react";
import { getTeamLogo } from "@/lib/teamLogos";
import { resolveOutcomeName } from "@/lib/resolveOutcomeName";
import type { Fight } from "@/components/predictions/FightCard";

interface SimplePredictionCardProps {
  fight: Fight;
  onPredict: (fight: Fight, pick: "fighter_a" | "fighter_b") => void;
  userEntry?: { fighter_pick: string; amount_usd: number | null; claimed: boolean } | null;
  onClaim?: (fightId: string) => void;
  claiming?: boolean;
  themeColor?: string;
}

function calcPayout(price: number | null, amount: number): number {
  if (!price || price <= 0) return amount;
  return amount / price;
}

function getOddsFromFight(fight: Fight): { priceA: number; priceB: number } {
  const pA = fight.price_a ?? 0;
  const pB = fight.price_b ?? 0;
  if (pA > 0 && pB > 0) return { priceA: pA, priceB: pB };
  if (pA > 0) return { priceA: pA, priceB: 1 - pA };
  if (pB > 0) return { priceA: 1 - pB, priceB: pB };
  // Pool-based fallback
  const poolA = (fight.pool_a_usd ?? 0) || fight.pool_a_lamports / 1e9;
  const poolB = (fight.pool_b_usd ?? 0) || fight.pool_b_lamports / 1e9;
  const total = poolA + poolB;
  if (total === 0) return { priceA: 0.5, priceB: 0.5 };
  return { priceA: poolA / total, priceB: poolB / total };
}

export default function SimplePredictionCard({
  fight,
  onPredict,
  userEntry,
  onClaim,
  claiming,
  themeColor = "#3b82f6",
}: SimplePredictionCardProps) {
  const nameA = resolveOutcomeName(fight.fighter_a_name, "a", fight);
  const nameB = resolveOutcomeName(fight.fighter_b_name, "b", fight);
  const { priceA, priceB } = getOddsFromFight(fight);
  const payoutA = calcPayout(priceA, 10);
  const payoutB = calcPayout(priceB, 10);

  const logoDataA = getTeamLogo(nameA, fight.event_name);
  const logoDataB = getTeamLogo(nameB, fight.event_name);
  const logoA = logoDataA?.url || null;
  const logoB = logoDataB?.url || null;
  const emojiA = logoDataA?.emoji || null;
  const emojiB = logoDataB?.emoji || null;

  const isOpen = fight.status === "open";
  const isSettled = ["settled", "confirmed", "result_selected"].includes(fight.status);
  const userPicked = userEntry?.fighter_pick;
  const userWon = isSettled && fight.winner === userPicked;

  // Settled state
  if (isSettled && fight.winner) {
    const winnerName = fight.winner === "fighter_a" ? nameA : nameB;
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="text-center mb-3">
          <span className="text-xs font-bold text-green-400 uppercase tracking-wider">✅ Result</span>
        </div>
        <p className="text-center text-lg font-bold text-white mb-1">{winnerName} Wins!</p>
        {userPicked && (
          <div className="text-center mt-3">
            {userWon ? (
              <>
                <p className="text-green-400 font-bold text-sm">🎉 You Won!</p>
                {!userEntry?.claimed && onClaim && (
                  <button
                    onClick={() => onClaim(fight.id)}
                    disabled={claiming}
                    className="mt-2 px-6 py-2 rounded-xl font-bold text-sm text-black transition-all"
                    style={{ backgroundColor: themeColor }}
                  >
                    {claiming ? "Claiming..." : "Collect Winnings"}
                  </button>
                )}
                {userEntry?.claimed && <p className="text-xs text-white/40 mt-1">Winnings collected ✓</p>}
              </>
            ) : (
              <p className="text-red-400/70 text-sm">Better luck next time</p>
            )}
          </div>
        )}
      </div>
    );
  }

  // User already placed a prediction
  if (userPicked) {
    const pickedName = userPicked === "fighter_a" ? nameA : nameB;
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {logoA && <img src={logoA} className="w-6 h-6 object-contain" alt="" />}
            <span className="text-base font-bold text-white">{nameA}</span>
          </div>
          <span className="text-xs text-white/30 font-bold">VS</span>
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-white">{nameB}</span>
            {logoB && <img src={logoB} className="w-6 h-6 object-contain" alt="" />}
          </div>
        </div>
        <div className="text-center rounded-xl bg-white/5 py-3 px-4">
          <p className="text-sm text-white/60">Your Pick</p>
          <p className="text-lg font-bold text-white">🎯 {pickedName}</p>
          {userEntry?.amount_usd && (
            <p className="text-xs text-white/40 mt-1">${userEntry.amount_usd.toFixed(2)} placed</p>
          )}
        </div>
      </div>
    );
  }

  // Open for predictions
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-4">
      {/* Team names */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1">
          {logoA && <img src={logoA} className="w-8 h-8 object-contain" alt="" />}
          <span className="text-lg font-bold text-white leading-tight">{nameA}</span>
        </div>
        <span className="text-sm text-white/20 font-bold mx-3">VS</span>
        <div className="flex items-center gap-3 flex-1 justify-end text-right">
          <span className="text-lg font-bold text-white leading-tight">{nameB}</span>
          {logoB && <img src={logoB} className="w-8 h-8 object-contain" alt="" />}
        </div>
      </div>

      {/* Pick buttons */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => isOpen && onPredict(fight, "fighter_a")}
          disabled={!isOpen}
          className="rounded-xl py-3 px-2 text-center transition-all border border-white/10 hover:border-white/30 bg-white/5 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <span className="block text-sm font-bold text-white">{nameA}</span>
          <span className="block text-xs mt-1" style={{ color: themeColor }}>
            You win: ${payoutA.toFixed(2)}
          </span>
        </button>
        <button
          onClick={() => isOpen && onPredict(fight, "fighter_b")}
          disabled={!isOpen}
          className="rounded-xl py-3 px-2 text-center transition-all border border-white/10 hover:border-white/30 bg-white/5 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <span className="block text-sm font-bold text-white">{nameB}</span>
          <span className="block text-xs mt-1" style={{ color: themeColor }}>
            You win: ${payoutB.toFixed(2)}
          </span>
        </button>
      </div>

      {/* Total pool */}
      {(() => {
        const total = (fight.pool_a_usd ?? 0) + (fight.pool_b_usd ?? 0);
        if (total <= 0) return null;
        return (
          <p className="text-center text-[11px] text-white/25">
            Total Pool: ${total >= 1000 ? `${(total / 1000).toFixed(0)}K` : total.toFixed(0)}
          </p>
        );
      })()}
    </div>
  );
}
