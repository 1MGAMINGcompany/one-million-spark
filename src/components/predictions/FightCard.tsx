import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Swords, Trophy, Loader2 } from "lucide-react";
import { useSolPrice } from "@/hooks/useSolPrice";

const LAMPORTS = 1_000_000_000;

interface Fight {
  id: string;
  title: string;
  fighter_a_name: string;
  fighter_b_name: string;
  pool_a_lamports: number;
  pool_b_lamports: number;
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

function calcOdds(poolA: number, poolB: number) {
  const total = poolA + poolB;
  if (total === 0) return { oddsA: 2.0, oddsB: 2.0 };
  return {
    oddsA: poolA > 0 ? total / poolA : 0,
    oddsB: poolB > 0 ? total / poolB : 0,
  };
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
}: {
  fight: Fight;
  onPredict: (fight: Fight, pick: "fighter_a" | "fighter_b") => void;
  wallet: string | null;
  userEntries: any[];
  onClaim: (fightId: string) => void;
  claiming: boolean;
  isHot?: boolean;
  onWalletRequired?: () => void;
}) {
  const { formatUsd } = useSolPrice();
  const { oddsA, oddsB } = calcOdds(fight.pool_a_lamports, fight.pool_b_lamports);
  const totalPool = (fight.pool_a_lamports + fight.pool_b_lamports) / LAMPORTS;
  const poolASol = fight.pool_a_lamports / LAMPORTS;
  const poolBSol = fight.pool_b_lamports / LAMPORTS;

  const isClaimable = ["confirmed", "settled"].includes(fight.status);
  const hasWinningEntries =
    isClaimable &&
    fight.winner &&
    userEntries.some((e) => e.fighter_pick === fight.winner && !e.claimed);

  const claimsOpen =
    fight.claims_open_at && new Date() >= new Date(fight.claims_open_at);

  const badge = STATUS_BADGE[fight.status] || STATUS_BADGE.open;

  const isSoccer = fight.source === "api-football";
  const hasLogos = isSoccer && !!(fight.home_logo && fight.away_logo);

  // Parse title
  const titleParts = fight.title.split(' — ');
  const fightLabel = titleParts[0] || fight.title;
  const weight = fight.weight_class || titleParts[1] || null;
  const fightClass = fight.fight_class || titleParts[2] || null;

  return (
    <Card className="bg-card border-border/50 overflow-hidden relative">

      {/* Header */}
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

      {/* Fighters */}
      <div className="p-4">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3" dir="ltr">
          <FighterColumn
            name={fight.fighter_a_name}
            poolSol={poolASol}
            odds={oddsA}
            isWinner={fight.winner === "fighter_a" && isClaimable}
            canPredict={fight.status === "open"}
            onPredict={() => wallet ? onPredict(fight, "fighter_a") : onWalletRequired?.()}
            formatUsd={formatUsd}
            logo={hasLogos ? fight.home_logo : undefined}
          />
          <div className="flex flex-col items-center">
            <Swords className="w-5 h-5 text-primary/60" />
            <span className="text-[10px] text-muted-foreground font-bold">VS</span>
          </div>
          <FighterColumn
            name={fight.fighter_b_name}
            poolSol={poolBSol}
            odds={oddsB}
            isWinner={fight.winner === "fighter_b" && isClaimable}
            canPredict={fight.status === "open"}
            onPredict={() => wallet ? onPredict(fight, "fighter_b") : onWalletRequired?.()}
            formatUsd={formatUsd}
            logo={hasLogos ? fight.away_logo : undefined}
          />
        </div>

        {/* Total pool */}
        <div className="mt-3 pt-2 border-t border-border/30 flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">Total Pool</span>
          <span className="text-xs font-bold text-primary">
            {totalPool.toFixed(2)} SOL
            {formatUsd(totalPool) && <span className="text-[10px] text-muted-foreground font-normal ml-1">{formatUsd(totalPool)}</span>}
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

        {/* Claim button */}
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
  name, poolSol, odds, isWinner, canPredict, onPredict, formatUsd, logo,
}: {
  name: string; poolSol: number; odds: number; isWinner: boolean;
  canPredict: boolean; onPredict: () => void; formatUsd: (sol: number) => string;
  logo?: string | null;
}) {
  const [logoError, setLogoError] = useState(false);
  const showLogo = logo && !logoError;

  return (
    <div className="text-center">
      {showLogo && (
        <img
          src={logo}
          alt=""
          className="w-8 h-8 object-contain mx-auto mb-1"
          onError={() => setLogoError(true)}
          loading="lazy"
        />
      )}
      <p className={`font-bold text-foreground ${showLogo ? 'text-[15px]' : 'text-sm'}`}>{name}</p>
      <p className="text-xs text-muted-foreground mt-1">
        {poolSol.toFixed(2)} SOL
        {formatUsd(poolSol) && <span className="block text-[10px] text-muted-foreground/70">{formatUsd(poolSol)}</span>}
      </p>
      <p className="text-primary font-bold text-lg">{odds.toFixed(2)}x</p>
      {canPredict && (
        <Button size="sm" className="mt-2 w-full bg-primary text-primary-foreground hover:bg-primary/90 text-xs" onClick={onPredict}>
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

export type { Fight };
