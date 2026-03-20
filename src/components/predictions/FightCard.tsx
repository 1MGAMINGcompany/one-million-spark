import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Swords, Trophy, Loader2, HelpCircle } from "lucide-react";

interface Fight {
  id: string;
  title: string;
  fighter_a_name: string;
  fighter_b_name: string;
  pool_a_lamports: number;
  pool_b_lamports: number;
  // New USD columns (used when available)
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
}

/** Build a clear human-readable prediction question from the fight data */
function buildQuestion(fight: Fight, isSoccer: boolean): string {
  // Polymarket titles are already questions (e.g. "Will Villarreal CF win?")
  if (fight.source === "polymarket" && fight.title && fight.title.includes("?")) {
    return fight.title;
  }
  if (isSoccer) {
    return `Who will win: ${fight.fighter_a_name} or ${fight.fighter_b_name}?`;
  }
  return `Who wins: ${fight.fighter_a_name} vs ${fight.fighter_b_name}?`;
}

/** Sport-specific fallback icon */
function SportFallbackIcon({ isSoccer, className }: { isSoccer: boolean; className?: string }) {
  if (isSoccer) {
    return <span className={className || "text-2xl"}>⚽</span>;
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

function calcOdds(poolA: number, poolB: number, priceA?: number | null, priceB?: number | null) {
  // Prefer Polymarket prices when available (0–1 range → odds = 1/price)
  if (priceA && priceA > 0 && priceB && priceB > 0) {
    return {
      oddsA: +(1 / priceA).toFixed(2),
      oddsB: +(1 / priceB).toFixed(2),
    };
  }
  const total = poolA + poolB;
  if (total === 0) return { oddsA: 2.0, oddsB: 2.0 };
  return {
    oddsA: poolA > 0 ? total / poolA : 0,
    oddsB: poolB > 0 ? total / poolB : 0,
  };
}

/** Get USD pool value — prefers new USD columns, falls back to legacy lamports / 1e9 */
function getPoolUsd(fight: Fight): { poolA: number; poolB: number } {
  if ((fight.pool_a_usd != null && fight.pool_a_usd > 0) || (fight.pool_b_usd != null && fight.pool_b_usd > 0)) {
    return { poolA: fight.pool_a_usd ?? 0, poolB: fight.pool_b_usd ?? 0 };
  }
  // Legacy fallback: treat lamports as 1:1 USD placeholder
  return { poolA: fight.pool_a_lamports / 1_000_000_000, poolB: fight.pool_b_lamports / 1_000_000_000 };
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
  const { oddsA, oddsB } = calcOdds(poolA, poolB, fight.price_a, fight.price_b);
  const totalPool = poolA + poolB;
  const isPolymarketPool = fight.source === "polymarket" && totalPool === 0;

  const isClaimable = ["confirmed", "settled"].includes(fight.status);
  const hasWinningEntries =
    isClaimable &&
    fight.winner &&
    userEntries.some((e) => e.fighter_pick === fight.winner && !e.claimed);

  const claimsOpen =
    fight.claims_open_at && new Date() >= new Date(fight.claims_open_at);

  const displayStatus = (eventHasStarted && fight.status === "open") ? "locked" : fight.status;
  const badge = STATUS_BADGE[displayStatus] || STATUS_BADGE.open;
  const canPredict = displayStatus === "open";

  const isSoccer = isSoccerEvent || fight.source === "api-football";
  const hasLogos = isSoccer && !!(fight.home_logo && fight.away_logo);

  const titleParts = fight.title.split(' — ');
  const fightLabel = titleParts[0] || fight.title;
  const weight = fight.weight_class || titleParts[1] || null;
  const fightClass = fight.fight_class || titleParts[2] || null;

  if (isSoccer) {
    return (
      <Card className="bg-card border-primary/20 overflow-hidden relative">
        <div className="px-4 py-2 border-b border-border/20 flex items-center justify-between">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Match Prediction</span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badge.className}`}>
            {badge.label}
          </span>
        </div>

        <div className="px-4 pt-5 pb-3 sm:px-6">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-5" dir="ltr">
            <SoccerTeamColumn
              name={fight.fighter_a_name}
              odds={oddsA}
              canPredict={canPredict}
              onPredict={() => wallet ? onPredict(fight, "fighter_a") : onWalletRequired?.()}
              logo={hasLogos ? fight.home_logo : undefined}
              isWinner={fight.winner === "fighter_a" && isClaimable}
            />
            <div className="flex flex-col items-center gap-1">
              <span className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest">vs</span>
            </div>
            <SoccerTeamColumn
              name={fight.fighter_b_name}
              odds={oddsB}
              canPredict={canPredict}
              onPredict={() => wallet ? onPredict(fight, "fighter_b") : onWalletRequired?.()}
              logo={hasLogos ? fight.away_logo : undefined}
              isWinner={fight.winner === "fighter_b" && isClaimable}
            />
          </div>
        </div>

        {/* Pool strip */}
        <div className="bg-primary/8 border-t border-primary/15 px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              {isPolymarketPool ? "Liquidity" : "Prize Pool"}
            </span>
            <span className="text-lg sm:text-xl font-bold text-primary font-['Cinzel'] leading-tight">
              {isPolymarketPool ? "Polymarket" : `$${totalPool.toFixed(2)}`}
            </span>
          </div>
          {!isPolymarketPool && (
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
          )}
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

        {hasWinningEntries && claimsOpen && (
          <div className="px-4 sm:px-6 pb-4">
            <Button
              className="w-full bg-gradient-to-r from-primary to-accent text-primary-foreground font-bold"
              onClick={() => onClaim(fight.id)}
              disabled={claiming}
            >
              {claiming ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trophy className="w-4 h-4 mr-2" />}
              Claim Reward
            </Button>
          </div>
        )}
        {hasWinningEntries && !claimsOpen && (
          <div className="mx-4 sm:mx-6 mb-4 bg-primary/10 border border-primary/20 rounded-lg p-3 text-center">
            <p className="text-xs font-bold text-primary mb-1">🎉 You won!</p>
            <p className="text-[11px] text-muted-foreground">
              Rewards will become claimable shortly.
            </p>
          </div>
        )}
      </Card>
    );
  }

  // ── Non-soccer (combat sports) card ──
  return (
    <Card className="bg-card border-border/50 overflow-hidden relative">
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
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3" dir="ltr">
          <FighterColumn
            name={fight.fighter_a_name}
            poolAmount={poolA}
            odds={oddsA}
            isWinner={fight.winner === "fighter_a" && isClaimable}
            canPredict={canPredict}
            onPredict={() => wallet ? onPredict(fight, "fighter_a") : onWalletRequired?.()}
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
          />
        </div>

        <div className="mt-3 pt-3 border-t border-border/30 flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">{isPolymarketPool ? "Liquidity" : "Total Pool"}</span>
          <span className="text-xs font-bold text-primary">
            {isPolymarketPool ? "Polymarket" : `$${totalPool.toFixed(2)}`}
          </span>
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

        {hasWinningEntries && claimsOpen && (
          <Button
            className="w-full mt-3 bg-gradient-to-r from-primary to-accent text-primary-foreground font-bold"
            onClick={() => onClaim(fight.id)}
            disabled={claiming}
          >
            {claiming ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trophy className="w-4 h-4 mr-2" />}
            Claim Reward
          </Button>
        )}
        {hasWinningEntries && !claimsOpen && (
          <div className="mt-3 bg-primary/10 border border-primary/20 rounded-lg p-3 text-center">
            <p className="text-xs font-bold text-primary mb-1">🎉 You won!</p>
            <p className="text-[11px] text-muted-foreground">
              Rewards will become claimable shortly.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}

function FighterColumn({
  name, poolAmount, odds, isWinner, canPredict, onPredict, logo, isSoccer,
}: {
  name: string; poolAmount: number; odds: number; isWinner: boolean;
  canPredict: boolean; onPredict: () => void;
  logo?: string | null; isSoccer?: boolean;
}) {
  const [logoError, setLogoError] = useState(false);
  const showLogo = logo && !logoError;

  return (
    <div className="text-center">
      {showLogo && (
        <img
          src={logo}
          alt=""
          className={`object-contain mx-auto ${isSoccer ? 'w-10 h-10 sm:w-12 sm:h-12 mb-2 drop-shadow-md' : 'w-7 h-7 mb-1.5'}`}
          onError={() => setLogoError(true)}
          loading="lazy"
        />
      )}
      <p className={`font-bold text-foreground ${isSoccer && showLogo ? 'text-base sm:text-lg' : showLogo ? 'text-[15px]' : 'text-sm'}`}>{name}</p>
      <p className={`text-muted-foreground mt-1 ${isSoccer ? 'text-xs sm:text-sm' : 'text-xs'}`}>
        ${poolAmount.toFixed(2)}
      </p>
      <p className={`text-primary font-bold ${isSoccer ? 'text-xl sm:text-2xl' : 'text-lg'}`}>{odds.toFixed(2)}x</p>
      {canPredict && (
        <Button size="sm" className={`mt-2 w-full bg-primary text-primary-foreground hover:bg-primary/90 ${isSoccer ? 'text-sm py-2.5 font-bold' : 'text-xs'}`} onClick={onPredict}>
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
  name, odds, canPredict, onPredict, logo, isWinner,
}: {
  name: string; odds: number; canPredict: boolean; onPredict: () => void;
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
        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-muted/40 flex items-center justify-center text-muted-foreground text-lg font-bold">
          {name.charAt(0)}
        </div>
      )}
      <p className="font-bold text-foreground text-sm sm:text-base leading-tight mt-0.5">{name}</p>
      <p className="text-xl sm:text-2xl font-bold text-primary leading-none">{odds.toFixed(2)}x</p>
      {canPredict && (
        <Button
          size="sm"
          className="mt-1.5 w-full bg-primary text-primary-foreground hover:bg-primary/90 text-sm py-2.5 font-bold"
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

export type { Fight };
