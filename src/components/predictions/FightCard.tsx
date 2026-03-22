import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Swords, Trophy, Loader2, HelpCircle, ChevronRight, Newspaper, ArrowUp, ArrowDown } from "lucide-react";
import { detectSport, isOverSide, type SportType } from "@/lib/detectSport";
import { resolveOutcomeName } from "@/lib/resolveOutcomeName";

export interface Fight {
  id: string;
  title: string;
  fighter_a_name: string;
  fighter_b_name: string;
  pool_a_lamports: number;
  pool_b_lamports: number;
  pool_a_usd?: number;
  pool_b_usd?: number;
  shares_a: number;
  shares_b: number;
  status: string;
  winner: string | null;
  resolved_at: string | null;
  claims_open_at: string | null;
  event_name: string;
  event_id?: string | null;
  method?: string | null;
  weight_class?: string | null;
  fight_class?: string | null;
  refund_status?: string | null;
  home_logo?: string | null;
  away_logo?: string | null;
  source?: string | null;
  commission_bps?: number | null;
  price_a?: number | null;
  price_b?: number | null;
  fighter_a_photo?: string | null;
  fighter_b_photo?: string | null;
  explainer_card?: string | null;
  stats_json?: any;
  featured?: boolean;
  fighter_a_record?: string | null;
  fighter_b_record?: string | null;
  venue?: string | null;
  referee?: string | null;
  polymarket_volume_usd?: number | null;
  has_updates?: boolean;
}

/** Get sport-aware fallback icon */
function SportFallbackEmoji(sport: SportType, fighterName?: string): string {
  if (sport === "soccer") return "⚽";
  if (sport === "over_under") return isOverSide(fighterName || "") ? "📈" : "📉";
  return "🥊";
}

function buildQuestion(fight: Fight, isSoccer: boolean): string {
  if (fight.source === "polymarket" && fight.title && fight.title.includes("?")) {
    return fight.title;
  }
  const nameA = resolveOutcomeName(fight.fighter_a_name, "a", fight);
  const nameB = resolveOutcomeName(fight.fighter_b_name, "b", fight);
  if (isSoccer) {
    return `Who wins: ${nameA} or ${nameB}?`;
  }
  return `Who wins: ${nameA} vs ${nameB}?`;
}

function SportFallbackIcon({ sport, className, fighterName }: { sport?: SportType; className?: string; fighterName?: string }) {
  if (sport === "soccer") {
    return <span className={className || "text-2xl"}>⚽</span>;
  }
  if (sport === "over_under") {
    if (isOverSide(fighterName || "")) {
      return <ArrowUp className={`${className || "w-6 h-6"} text-green-400`} />;
    }
    return <ArrowDown className={`${className || "w-6 h-6"} text-red-400`} />;
  }
  return <span className={className || "text-2xl"}>🥊</span>;
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  open: { label: "OPEN", className: "bg-green-500/20 text-green-400" },
  locked: { label: "LOCKED", className: "bg-yellow-500/20 text-yellow-400" },
  live: { label: "LIVE", className: "bg-red-500/20 text-red-400 animate-pulse" },
  result_selected: { label: "RESULT SELECTED", className: "bg-orange-500/20 text-orange-400" },
  confirmed: { label: "CONFIRMED", className: "bg-blue-500/20 text-blue-400" },
  settled: { label: "SETTLED", className: "bg-primary/20 text-primary" },
  draw: { label: "DRAW", className: "bg-muted text-muted-foreground" },
  refund_pending: { label: "REFUND PENDING", className: "bg-yellow-500/20 text-yellow-400" },
  refunds_processing: { label: "REFUNDING", className: "bg-yellow-500/20 text-yellow-400 animate-pulse" },
  refunds_complete: { label: "REFUNDED", className: "bg-muted text-muted-foreground" },
  cancelled: { label: "CANCELLED", className: "bg-muted text-muted-foreground" },
};

/** Detect if Polymarket prices are in resolving state (exactly 0/1) */
function isResolvingPrice(priceA?: number | null, priceB?: number | null, source?: string | null): boolean {
  if (source !== "polymarket") return false;
  const a = priceA ?? 0;
  const b = priceB ?? 0;
  return (a === 0 && b === 1) || (a === 1 && b === 0) || (a === 0 && b === 0);
}

function calcOdds(poolA: number, poolB: number, priceA?: number | null, priceB?: number | null, source?: string | null) {
  if (isResolvingPrice(priceA, priceB, source)) {
    return { oddsA: 0, oddsB: 0, noData: false, resolving: true };
  }
  // Both Polymarket prices available
  if (priceA && priceA > 0 && priceB && priceB > 0) {
    return {
      oddsA: +(1 / priceA).toFixed(2),
      oddsB: +(1 / priceB).toFixed(2),
      noData: false,
      resolving: false,
    };
  }
  // One-sided Polymarket price — derive complement
  if (priceA && priceA > 0 && priceA <= 1) {
    const derivedB = 1 - priceA;
    return {
      oddsA: +(1 / priceA).toFixed(2),
      oddsB: derivedB > 0 ? +(1 / derivedB).toFixed(2) : 0,
      noData: false,
      resolving: false,
    };
  }
  if (priceB && priceB > 0 && priceB <= 1) {
    const derivedA = 1 - priceB;
    return {
      oddsA: derivedA > 0 ? +(1 / derivedA).toFixed(2) : 0,
      oddsB: +(1 / priceB).toFixed(2),
      noData: false,
      resolving: false,
    };
  }
  // Pool-based odds
  const total = poolA + poolB;
  if (total === 0) {
    // For Polymarket fights with no usable data, flag it
    return { oddsA: 0, oddsB: 0, noData: source === "polymarket", resolving: false };
  }
  return {
    oddsA: poolA > 0 ? +(total / poolA).toFixed(2) : 0,
    oddsB: poolB > 0 ? +(total / poolB).toFixed(2) : 0,
    noData: false,
    resolving: false,
  };
}

function getPoolUsd(fight: Fight): { poolA: number; poolB: number } {
  if ((fight.pool_a_usd != null && fight.pool_a_usd > 0) || (fight.pool_b_usd != null && fight.pool_b_usd > 0)) {
    return { poolA: fight.pool_a_usd ?? 0, poolB: fight.pool_b_usd ?? 0 };
  }
  return { poolA: fight.pool_a_lamports / 1_000_000_000, poolB: fight.pool_b_lamports / 1_000_000_000 };
}

/** Format probability — avoids misleading 0% / 100% for extreme values */
function formatProb(p: number): string {
  if (p <= 0) return "<1%";
  if (p >= 100) return ">99%";
  if (p < 1) return `${p.toFixed(1)}%`;
  if (p > 99) return `${p.toFixed(1)}%`;
  return `${Math.round(p)}%`;
}

/** Derive probability percentages from Polymarket prices (handles one-sided) */
function getProbabilities(fight: Fight): { probA: number; probB: number } | null {
  // Don't show probability bar for resolving markets
  if (isResolvingPrice(fight.price_a, fight.price_b, fight.source)) return null;
  const pA = fight.price_a ?? 0;
  const pB = fight.price_b ?? 0;
  if (pA > 0 && pB > 0) {
    return { probA: pA * 100, probB: pB * 100 };
  }
  // One-sided: derive complement
  if (pA > 0 && pA <= 1) {
    return { probA: pA * 100, probB: (1 - pA) * 100 };
  }
  if (pB > 0 && pB <= 1) {
    return { probA: (1 - pB) * 100, probB: pB * 100 };
  }
  return null;
}

/** Probability split bar component */
function ProbabilityBar({ probA, probB }: { probA: number; probB: number }) {
  // Clamp for bar width rendering
  const barA = Math.max(0.5, Math.min(99.5, probA));
  const barB = Math.max(0.5, Math.min(99.5, probB));
  return (
    <div className="w-full">
      <div className="flex justify-between text-[10px] font-bold mb-1">
        <span className="text-blue-400">{formatProb(probA)}</span>
        <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">Live Odds</span>
        <span className="text-red-400">{formatProb(probB)}</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden flex bg-muted/30">
        <div
          className="h-full bg-gradient-to-r from-blue-500 to-blue-400 transition-all duration-500"
          style={{ width: `${barA}%` }}
        />
        <div
          className="h-full bg-gradient-to-r from-red-400 to-red-500 transition-all duration-500"
          style={{ width: `${barB}%` }}
        />
      </div>
    </div>
  );
}

/** Polymarket attribution badge */
function PolymarketBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-muted-foreground/70 bg-muted/20 px-2 py-0.5 rounded-full">
      <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
        <path d="M8 12l3 3 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Powered by Polymarket
    </span>
  );
}

/** USDC per-side display for Polymarket events */
/** Format volume like Polymarket: $601K, $1.2M */
function formatVolume(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

/** Get display name — replace "Yes"/"No" with meaningful name */
function displayName(name: string, fight: Fight, side: "a" | "b"): string {
  return resolveOutcomeName(name, side, fight);
}

/** USDC per-side display for Polymarket events */
function PolymarketPoolStrip({ fight }: { fight: Fight }) {
  const probs = getProbabilities(fight);
  const { poolA, poolB } = getPoolUsd(fight);
  const hasPool = poolA > 0 || poolB > 0;
  const volume = fight.polymarket_volume_usd ?? 0;

  const nameA = displayName(fight.fighter_a_name, fight, "a");
  const nameB = displayName(fight.fighter_b_name, fight, "b");

  return (
    <div className="w-full space-y-2">
      {probs && (
        <ProbabilityBar probA={probs.probA} probB={probs.probB} />
      )}
      <div className="flex items-center justify-between text-[10px]">
        <div className="text-center">
          <span className="block font-bold text-foreground text-xs">
            {hasPool ? `$${poolA.toFixed(2)}` : probs ? `${formatProb(probs.probA)}` : "—"}
          </span>
          <span className="text-muted-foreground">{nameA.split(" ").pop()}</span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <PolymarketBadge />
          {volume > 0 && (
            <span className="text-[10px] font-semibold text-primary/70">
              {formatVolume(volume)} Vol.
            </span>
          )}
        </div>
        <div className="text-center">
          <span className="block font-bold text-foreground text-xs">
            {hasPool ? `$${poolB.toFixed(2)}` : probs ? `${formatProb(probs.probB)}` : "—"}
          </span>
          <span className="text-muted-foreground">{nameB.split(" ").pop()}</span>
        </div>
      </div>
    </div>
  );
}

/** View Details link */
function ViewDetailsLink({ fightId, hasUpdates }: { fightId: string; hasUpdates?: boolean }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={(e) => { e.stopPropagation(); navigate(`/predictions/${fightId}`); }}
      className="flex items-center gap-1 text-[10px] text-primary/70 hover:text-primary font-semibold transition-colors group"
    >
      {hasUpdates && <Newspaper className="w-3 h-3 text-primary animate-pulse" />}
      View Details & Odds
      <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
    </button>
  );
}

export default function FightCard({
  fight,
  onPredict,
  wallet,
  userEntries,
  onClaim,
  claiming,
  isHot,
  onWalletRequired,
  isSoccerEvent,
  eventHasStarted,
}: {
  fight: Fight;
  onPredict: (fight: Fight, pick: "fighter_a" | "fighter_b") => void;
  wallet: string | null;
  userEntries: any[];
  onClaim: (fightId: string) => void;
  claiming: boolean;
  isHot?: boolean;
  onWalletRequired?: () => void;
  isSoccerEvent?: boolean;
  eventHasStarted?: boolean;
}) {
  const { poolA, poolB } = getPoolUsd(fight);
  const { oddsA, oddsB, noData, resolving } = calcOdds(poolA, poolB, fight.price_a, fight.price_b, fight.source);
  const totalPool = poolA + poolB;
  const isPolymarket = fight.source === "polymarket";
  const isFeatured = fight.featured === true;

  const isClaimable = ["confirmed", "settled"].includes(fight.status);
  const isFinished = ["locked", "confirmed", "settled", "result_selected"].includes(fight.status);
  const winnerName = fight.winner === "fighter_a" ? fight.fighter_a_name : fight.winner === "fighter_b" ? fight.fighter_b_name : null;
  const hasWinningEntries =
    isClaimable &&
    fight.winner &&
    userEntries.some((e) => e.fighter_pick === fight.winner && !e.claimed);

  const claimsOpen =
    fight.claims_open_at && new Date() >= new Date(fight.claims_open_at);

  const displayStatus = (eventHasStarted && fight.status === "open") ? "locked" : fight.status;
  const badge = STATUS_BADGE[displayStatus] || STATUS_BADGE.open;
  const canPredict = displayStatus === "open" && !resolving;

  const sport = detectSport(fight);
  const isSoccer = isSoccerEvent || sport === "soccer";
  const hasLogos = isSoccer && !!(fight.home_logo && fight.away_logo);

  const titleParts = fight.title.split(' — ');
  const fightLabel = titleParts[0] || fight.title;
  const weight = fight.weight_class || titleParts[1] || null;
  const fightClass = fight.fight_class || titleParts[2] || null;

  const featuredBorder = isFeatured ? "border-primary/40 shadow-[0_0_20px_hsl(var(--primary)/0.12)]" : "border-border/50";

  if (isSoccer) {
    return (
      <Card className={`bg-card overflow-hidden relative ${isFeatured ? 'border-primary/40 shadow-[0_0_20px_hsl(var(--primary)/0.12)]' : 'border-primary/20'}`}>
        {isFeatured && (
          <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-[9px] font-bold px-2.5 py-0.5 rounded-bl-lg uppercase tracking-wider z-10">
            Featured
          </div>
        )}
        <div className="px-4 py-2.5 border-b border-border/20 flex items-center justify-between">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Match Prediction</span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badge.className}`}>
            {badge.label}
          </span>
        </div>

        <div className="px-4 sm:px-6 pt-3 pb-1">
          <p className="text-xs sm:text-sm font-semibold text-center text-foreground/80 flex items-center justify-center gap-1.5">
            <HelpCircle className="w-3.5 h-3.5 text-primary/60 flex-shrink-0" />
            {buildQuestion(fight, true)}
          </p>
        </div>

        <div className="px-4 pt-3 pb-3 sm:px-6">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-5" dir="ltr">
            <SoccerTeamColumn
              name={resolveOutcomeName(fight.fighter_a_name, "a", fight)}
              odds={oddsA}
              poolAmount={poolA}
              canPredict={canPredict}
              onPredict={() => wallet ? onPredict(fight, "fighter_a") : onWalletRequired?.()}
              logo={hasLogos ? fight.home_logo : undefined}
              isWinner={fight.winner === "fighter_a" && isClaimable}
            />
            <div className="flex flex-col items-center gap-1">
              <span className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest">vs</span>
            </div>
            <SoccerTeamColumn
              name={resolveOutcomeName(fight.fighter_b_name, "b", fight)}
              odds={oddsB}
              poolAmount={poolB}
              canPredict={canPredict}
              onPredict={() => wallet ? onPredict(fight, "fighter_b") : onWalletRequired?.()}
              logo={hasLogos ? fight.away_logo : undefined}
              isWinner={fight.winner === "fighter_b" && isClaimable}
            />
          </div>
        </div>

        {/* Pool strip */}
        <div className="bg-primary/8 border-t border-primary/15 px-4 sm:px-6 py-3">
          {isPolymarket ? (
            <PolymarketPoolStrip fight={fight} />
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Prize Pool</span>
                <span className="text-lg sm:text-xl font-bold text-primary font-['Cinzel'] leading-tight">
                  ${totalPool.toFixed(2)}
                </span>
              </div>
              <div className="flex gap-3 text-[10px] text-muted-foreground">
                <div className="text-center">
                  <span className="block font-bold text-foreground text-xs">${poolA.toFixed(2)}</span>
                  <span>Home</span>
                </div>
                <div className="text-center">
                  <span className="block font-bold text-foreground text-xs">${poolB.toFixed(2)}</span>
                  <span>Away</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Venue / referee info + View Details */}
        <div className="px-4 sm:px-6 py-2 border-t border-border/10 flex items-center justify-between">
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            {fight.venue && <span>📍 {fight.venue}</span>}
            {fight.referee && <span>🏁 {fight.referee}</span>}
          </div>
          <ViewDetailsLink fightId={fight.id} hasUpdates={fight.has_updates} />
        </div>

        {/* Draw info */}
        {["draw", "refund_pending", "refunds_processing", "refunds_complete"].includes(fight.status) && (
          <div className="mx-4 sm:mx-6 mb-3 bg-muted/30 border border-border/30 rounded-lg p-3 text-center">
            <p className="text-xs font-bold text-muted-foreground">
              {fight.status === "refunds_complete" ? "✅ Refunds complete" :
               fight.status === "refunds_processing" ? "⏳ Refunds processing..." :
               fight.status === "refund_pending" ? "📋 Refunds queued" :
               "🤝 Draw / No Contest"}
            </p>
          </div>
        )}

        {/* Winner banner for finished soccer fights */}
        {isFinished && winnerName && !["draw", "refund_pending", "refunds_processing", "refunds_complete"].includes(fight.status) && (
          <div className="mx-4 sm:mx-6 mb-3 bg-primary/10 border border-primary/20 rounded-lg p-3 text-center">
            <div className="flex items-center justify-center gap-1.5">
              <Trophy className="w-4 h-4 text-primary" />
              <span className="text-sm font-bold text-primary">Winner: {winnerName}</span>
            </div>
            {fight.method && (
              <p className="text-[10px] text-muted-foreground mt-1">via {fight.method}</p>
            )}
          </div>
        )}

        {/* Auto-payout status for winners */}
        {isClaimable && fight.winner && userEntries.some((e) => e.fighter_pick === fight.winner && e.claimed && e.tx_signature) && (
          <div className="mx-4 sm:mx-6 mb-4 bg-green-500/10 border border-green-500/20 rounded-lg p-3 text-center">
            <p className="text-xs font-bold text-green-400 mb-0.5">✅ Paid — Winnings sent to your wallet</p>
            <p className="text-[10px] text-muted-foreground">
              USDC was automatically transferred to your connected wallet.
            </p>
          </div>
        )}
        {hasWinningEntries && claimsOpen && (
          <div className="mx-4 sm:mx-6 mb-4 bg-primary/10 border border-primary/20 rounded-lg p-3 text-center">
            <p className="text-xs font-bold text-primary mb-0.5">🎉 You won!</p>
            <p className="text-[11px] text-muted-foreground mb-2">
              Winnings are being automatically sent to your wallet.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="text-xs"
              onClick={() => onClaim(fight.id)}
              disabled={claiming}
            >
              {claiming ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
              Claim Now (if not received)
            </Button>
          </div>
        )}
        {hasWinningEntries && !claimsOpen && (
          <div className="mx-4 sm:mx-6 mb-4 bg-primary/10 border border-primary/20 rounded-lg p-3 text-center">
            <p className="text-xs font-bold text-primary mb-1">🎉 You won!</p>
            <p className="text-[11px] text-muted-foreground">
              Winnings will be automatically sent to your wallet shortly.
            </p>
          </div>
        )}
      </Card>
    );
  }

  // ── Non-soccer (combat sports) card ──
  return (
    <Card className={`bg-card overflow-hidden relative ${featuredBorder}`}>
      {isFeatured && (
        <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-[9px] font-bold px-2.5 py-0.5 rounded-bl-lg uppercase tracking-wider z-10">
          Featured
        </div>
      )}
      <div className="px-4 py-3 border-b border-border/30">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-foreground font-['Cinzel']">{fightLabel}</h3>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badge.className}`}>
            {badge.label}
          </span>
        </div>
        {(weight || fightClass || fight.method) && (
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {weight && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-300">{weight}</span>
            )}
            {fightClass && (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                fightClass.startsWith('A') ? 'bg-primary/30 text-primary' :
                fightClass.startsWith('B') ? 'bg-secondary text-secondary-foreground' :
                'bg-muted text-muted-foreground'
              }`}>{fightClass}</span>
            )}
            {fight.method && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                {fight.method}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="p-4">
        <p className="text-xs sm:text-sm font-semibold text-center text-foreground/80 mb-3 flex items-center justify-center gap-1.5">
          <HelpCircle className="w-3.5 h-3.5 text-primary/60 flex-shrink-0" />
          {buildQuestion(fight, false)}
        </p>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3" dir="ltr">
          <FighterColumn
            name={fight.fighter_a_name}
            poolAmount={poolA}
            odds={oddsA}
            isWinner={fight.winner === "fighter_a" && isClaimable}
            canPredict={canPredict}
            onPredict={() => wallet ? onPredict(fight, "fighter_a") : onWalletRequired?.()}
            photo={fight.fighter_a_photo}
            record={fight.fighter_a_record}
            sport={sport}
          />
          <div className="flex flex-col items-center gap-0.5">
            <Swords className="w-5 h-5 text-primary/60" />
            <span className="text-[10px] text-muted-foreground font-bold">VS</span>
          </div>
          <FighterColumn
            name={fight.fighter_b_name}
            poolAmount={poolB}
            odds={oddsB}
            isWinner={fight.winner === "fighter_b" && isClaimable}
            canPredict={canPredict}
            onPredict={() => wallet ? onPredict(fight, "fighter_b") : onWalletRequired?.()}
            photo={fight.fighter_b_photo}
            record={fight.fighter_b_record}
            sport={sport}
          />
        </div>

        {/* Pool / odds strip */}
        <div className="mt-3 pt-3 border-t border-border/30">
          {isPolymarket ? (
            <PolymarketPoolStrip fight={fight} />
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">Total Pool</span>
              <span className="text-xs font-bold text-primary">${totalPool.toFixed(2)}</span>
            </div>
          )}
        </div>

        {/* Venue / referee + View Details */}
        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            {fight.venue && <span>📍 {fight.venue}</span>}
            {fight.referee && <span>🏁 {fight.referee}</span>}
          </div>
          <ViewDetailsLink fightId={fight.id} hasUpdates={fight.has_updates} />
        </div>

        {/* Draw info */}
        {["draw", "refund_pending", "refunds_processing", "refunds_complete"].includes(fight.status) && (
          <div className="mt-3 bg-muted/30 border border-border/30 rounded-lg p-3 text-center">
            <p className="text-xs font-bold text-muted-foreground">
              {fight.status === "refunds_complete" ? "✅ Refunds complete" :
               fight.status === "refunds_processing" ? "⏳ Refunds processing..." :
               fight.status === "refund_pending" ? "📋 Refunds queued" :
               "🤝 Draw / No Contest"}
            </p>
          </div>
        )}

        {/* Winner banner for finished fights */}
        {isFinished && winnerName && !["draw", "refund_pending", "refunds_processing", "refunds_complete"].includes(fight.status) && (
          <div className="mt-3 bg-primary/10 border border-primary/20 rounded-lg p-3 text-center">
            <div className="flex items-center justify-center gap-1.5">
              <Trophy className="w-4 h-4 text-primary" />
              <span className="text-sm font-bold text-primary">Winner: {winnerName}</span>
            </div>
            {fight.method && (
              <p className="text-[10px] text-muted-foreground mt-1">via {fight.method}</p>
            )}
          </div>
        )}

        {/* Auto-payout status for winners */}
        {isClaimable && fight.winner && userEntries.some((e) => e.fighter_pick === fight.winner && e.claimed && e.tx_signature) && (
          <div className="mt-3 bg-green-500/10 border border-green-500/20 rounded-lg p-3 text-center">
            <p className="text-xs font-bold text-green-400 mb-0.5">✅ Paid — Winnings sent to your wallet</p>
            <p className="text-[10px] text-muted-foreground">
              USDC was automatically transferred to your connected wallet.
            </p>
          </div>
        )}
        {hasWinningEntries && claimsOpen && (
          <div className="mt-3 bg-primary/10 border border-primary/20 rounded-lg p-3 text-center">
            <p className="text-xs font-bold text-primary mb-0.5">🎉 You won!</p>
            <p className="text-[11px] text-muted-foreground mb-2">
              Winnings are being automatically sent to your wallet.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="text-xs"
              onClick={() => onClaim(fight.id)}
              disabled={claiming}
            >
              {claiming ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
              Claim Now (if not received)
            </Button>
          </div>
        )}
        {hasWinningEntries && !claimsOpen && (
          <div className="mt-3 bg-primary/10 border border-primary/20 rounded-lg p-3 text-center">
            <p className="text-xs font-bold text-primary mb-1">🎉 You won!</p>
            <p className="text-[11px] text-muted-foreground">
              Winnings will be automatically sent to your wallet shortly.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}

function FighterColumn({
  name, poolAmount, odds, isWinner, canPredict, onPredict, logo, isSoccer, photo, record, sport,
}: {
  name: string; poolAmount: number; odds: number; isWinner: boolean;
  canPredict: boolean; onPredict: () => void;
  logo?: string | null; isSoccer?: boolean; photo?: string | null;
  record?: string | null; sport?: SportType;
}) {
  const [imgError, setImgError] = useState(false);
  const showLogo = logo && !imgError;
  const showPhoto = !showLogo && photo && !imgError;
  const effectiveSport = sport || "combat";

  return (
    <div className="text-center">
      {showLogo && (
        <img
          src={logo}
          alt=""
          className={`object-contain mx-auto ${isSoccer ? 'w-10 h-10 sm:w-12 sm:h-12 mb-2 drop-shadow-md' : 'w-7 h-7 mb-1.5'}`}
          onError={() => setImgError(true)}
          loading="lazy"
        />
      )}
      {showPhoto && (
        <img
          src={photo!}
          alt={name}
          className="w-[4.5rem] h-[4.5rem] sm:w-20 sm:h-20 rounded-full object-cover object-top mx-auto mb-1.5 ring-2 ring-primary/30 shadow-lg"
          onError={() => setImgError(true)}
          loading="lazy"
        />
      )}
      {!showLogo && !showPhoto && (
        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-muted/40 flex items-center justify-center mx-auto mb-1.5">
          {effectiveSport === "over_under" ? (
            isOverSide(name) ? <ArrowUp className="w-6 h-6 text-green-400" /> : <ArrowDown className="w-6 h-6 text-red-400" />
          ) : (
            <span className="text-lg">{SportFallbackEmoji(effectiveSport, name)}</span>
          )}
        </div>
      )}
      <p className={`font-bold text-foreground ${isSoccer && showLogo ? 'text-base sm:text-lg' : showLogo ? 'text-[15px]' : 'text-sm'}`}>{name}</p>
      {record && (
        <p className="text-[10px] text-muted-foreground font-medium mt-0.5">{record}</p>
      )}
      <p className={`text-muted-foreground mt-1 ${isSoccer ? 'text-xs sm:text-sm' : 'text-xs'}`}>
        {poolAmount > 0 ? `$${poolAmount.toFixed(2)} USDC` : "Market-backed"}
      </p>
      <p className={`text-primary font-bold ${isSoccer ? 'text-xl sm:text-2xl' : 'text-lg'}`}>{odds > 0 ? `${odds.toFixed(2)}x` : '—'}</p>
      {canPredict && (
        <Button size="sm" className={`mt-2 w-full bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.97] transition-all ${isSoccer ? 'text-sm py-2.5 font-bold' : 'text-xs'}`} onClick={onPredict}>
          Predict
        </Button>
      )}
      {isWinner && (
        <div className="mt-2 flex items-center justify-center gap-1 text-primary">
          <Trophy className="w-4 h-4" />
          <span className="text-xs font-bold">WINNER</span>
        </div>
      )}
    </div>
  );
}

function SoccerTeamColumn({
  name, odds, poolAmount, canPredict, onPredict, logo, isWinner,
}: {
  name: string; odds: number; poolAmount: number; canPredict: boolean; onPredict: () => void;
  logo?: string | null; isWinner: boolean;
}) {
  const [logoError, setLogoError] = useState(false);
  const showLogo = logo && !logoError;

  return (
    <div className="text-center flex flex-col items-center gap-1">
      {showLogo ? (
        <img
          src={logo}
          alt=""
          className="w-10 h-10 sm:w-12 sm:h-12 object-contain drop-shadow-md"
          onError={() => setLogoError(true)}
          loading="lazy"
        />
      ) : (
        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-muted/40 flex items-center justify-center text-lg">
          ⚽
        </div>
      )}
      <p className="font-bold text-foreground text-sm sm:text-base leading-tight mt-0.5">{name}</p>
      <p className="text-[10px] text-muted-foreground">
        {poolAmount > 0 ? `$${poolAmount.toFixed(2)} USDC` : "Market-backed"}
      </p>
      <p className="text-xl sm:text-2xl font-bold text-primary leading-none">{odds > 0 ? `${odds.toFixed(2)}x` : '—'}</p>
      {canPredict && (
        <Button
          size="sm"
          className="mt-1.5 w-full bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.97] transition-all text-sm py-2.5 font-bold"
          onClick={onPredict}
        >
          Predict
        </Button>
      )}
      {isWinner && (
        <div className="mt-1 flex items-center justify-center gap-1 text-primary">
          <Trophy className="w-4 h-4" />
          <span className="text-xs font-bold">WINNER</span>
        </div>
      )}
    </div>
  );
}
