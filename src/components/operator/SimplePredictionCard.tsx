import { useState } from "react";
import { getTeamLogo } from "@/lib/teamLogos";
import { resolveOutcomeName } from "@/lib/resolveOutcomeName";
import { formatEventDateTime } from "@/lib/formatEventLocalDateTime";
import type { Fight } from "@/components/predictions/FightCard";

interface SimplePredictionCardProps {
  fight: Fight;
  onPredict: (fight: Fight, pick: "fighter_a" | "fighter_b" | "draw") => void;
  userEntry?: { fighter_pick: string; amount_usd: number | null; claimed: boolean } | null;
  onClaim?: (fightId: string) => void;
  claiming?: boolean;
  themeColor?: string;
  onShareWin?: (fight: Fight) => void;
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
  onShareWin,
}: SimplePredictionCardProps) {
  const nameA = resolveOutcomeName(fight.fighter_a_name, "a", fight);
  const nameB = resolveOutcomeName(fight.fighter_b_name, "b", fight);
  const { priceA, priceB } = getOddsFromFight(fight);
  const payoutA = calcPayout(priceA, 10);
  const payoutB = calcPayout(priceB, 10);
  const multiplierA = priceA > 0 ? (1 / priceA).toFixed(2) : "—";
  const multiplierB = priceB > 0 ? (1 / priceB).toFixed(2) : "—";

  const logoDataA = getTeamLogo(nameA, fight.event_name);
  const logoDataB = getTeamLogo(nameB, fight.event_name);
  const logoA = logoDataA?.url || null;
  const logoB = logoDataB?.url || null;

  const hasDrawOption = !!(fight as any).draw_allowed;

  const isOpen = fight.status === "open";
  const isSettled = ["settled", "confirmed", "result_selected"].includes(fight.status);
  const userPicked = userEntry?.fighter_pick;
  const userWon = isSettled && fight.winner === userPicked;
  const [winShared, setWinShared] = useState(false);

  const eventDateStr = (fight as any).event_date
    ? formatEventDateTime((fight as any).event_date)
    : null;

  // League badge
  const leagueName = fight.event_name?.split(" — ")[0] || fight.event_name;

  // Settled state
  if (isSettled && fight.winner) {
    const winnerName = fight.winner === "fighter_a" ? nameA : nameB;
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        {leagueName && (
          <div className="text-[10px] font-bold text-white/25 uppercase tracking-wider mb-2">{leagueName}</div>
        )}
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
                {userEntry?.claimed && (
                  <div className="space-y-2 mt-2">
                    <p className="text-xs text-white/40">Winnings collected ✓</p>
                    {onShareWin && !winShared && (
                      <button
                        onClick={() => { onShareWin(fight); setWinShared(true); }}
                        className="px-5 py-2 rounded-xl font-bold text-sm text-white transition-all border border-white/20 hover:bg-white/10"
                      >
                        🏆 SHARE YOUR WIN
                      </button>
                    )}
                  </div>
                )}
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
        {leagueName && (
          <div className="text-[10px] font-bold text-white/25 uppercase tracking-wider mb-2">{leagueName}</div>
        )}
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
        {eventDateStr && (
          <p className="text-xs text-white/30 text-center mb-2">{eventDateStr}</p>
        )}
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
  const gridCols = hasDrawOption ? "grid-cols-3" : "grid-cols-2";

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-4">
      {/* League badge */}
      {leagueName && (
        <div className="text-[10px] font-bold text-white/25 uppercase tracking-wider">{leagueName}</div>
      )}

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

      {/* Event date */}
      {eventDateStr && (
        <p className="text-xs text-white/30 text-center">{eventDateStr}</p>
      )}

      {/* Pick buttons */}
      <div className={`grid ${gridCols} gap-3`}>
        <button
          onClick={() => isOpen && onPredict(fight, "fighter_a")}
          disabled={!isOpen}
          className="rounded-xl py-3 px-2 text-center transition-all border border-white/10 hover:border-white/30 bg-white/5 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <span className="block text-sm font-bold text-white">{nameA}</span>
          <span className="block text-xs mt-1" style={{ color: themeColor }}>
            Bet $10 → Win ${payoutA.toFixed(2)}
          </span>
          <span className="block text-[10px] text-white/25 mt-0.5">({multiplierA}x)</span>
        </button>
        {hasDrawOption && (
          <button
            onClick={() => isOpen && onPredict(fight, "draw")}
            disabled={!isOpen}
            className="rounded-xl py-3 px-2 text-center transition-all border border-white/10 hover:border-white/30 bg-white/5 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span className="block text-sm font-bold text-white">Draw</span>
            <span className="block text-xs mt-1 text-white/40">Available</span>
          </button>
        )}
        <button
          onClick={() => isOpen && onPredict(fight, "fighter_b")}
          disabled={!isOpen}
          className="rounded-xl py-3 px-2 text-center transition-all border border-white/10 hover:border-white/30 bg-white/5 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <span className="block text-sm font-bold text-white">{nameB}</span>
          <span className="block text-xs mt-1" style={{ color: themeColor }}>
            Bet $10 → Win ${payoutB.toFixed(2)}
          </span>
          <span className="block text-[10px] text-white/25 mt-0.5">({multiplierB}x)</span>
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
