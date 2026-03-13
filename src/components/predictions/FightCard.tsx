import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Swords, Trophy, Loader2, Flame } from "lucide-react";

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
}

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
}: {
  fight: Fight;
  onPredict: (fight: Fight, pick: "fighter_a" | "fighter_b") => void;
  wallet: string | null;
  userEntries: any[];
  onClaim: (fightId: string) => void;
  claiming: boolean;
  isHot?: boolean;
}) {
  const { oddsA, oddsB } = calcOdds(fight.pool_a_lamports, fight.pool_b_lamports);
  const totalPool = (fight.pool_a_lamports + fight.pool_b_lamports) / LAMPORTS;

  const hasWinningEntries =
    fight.status === "resolved" &&
    fight.winner &&
    userEntries.some((e) => e.fighter_pick === fight.winner && !e.claimed);

  const claimsOpen =
    fight.claims_open_at && new Date() >= new Date(fight.claims_open_at);

  // Parse title: "Fight 8 — 165 lbs — C-Class" or "Main Event — 139 lbs — A-Class"
  const titleParts = fight.title.split(' — ');
  const fightLabel = titleParts[0] || fight.title;
  const weight = titleParts[1] || null;
  const fightClass = titleParts[2] || null;

  return (
    <Card className="bg-card border-border/50 overflow-hidden relative">
      {/* Hot badge */}
      {isHot && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1 bg-destructive/20 border border-destructive/40 text-destructive rounded-full px-2 py-0.5">
          <Flame className="w-3 h-3" />
          <span className="text-[10px] font-bold uppercase">Hot</span>
        </div>
      )}

      {/* Header */}
      <div className="px-4 py-3 border-b border-border/30">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-foreground font-['Cinzel']">
            {fightLabel}
          </h3>
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              fight.status === "open"
                ? "bg-green-500/20 text-green-400"
                : fight.status === "locked"
                ? "bg-yellow-500/20 text-yellow-400"
                : "bg-primary/20 text-primary"
            }`}
          >
            {fight.status === "open"
              ? "OPEN"
              : fight.status === "locked"
              ? "LOCKED"
              : "RESOLVED"}
          </span>
        </div>
        {(weight || fightClass) && (
          <div className="flex items-center gap-2 mt-1">
            {weight && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-accent/20 text-accent-foreground">
                {weight}
              </span>
            )}
            {fightClass && (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                fightClass.startsWith('A') ? 'bg-primary/30 text-primary' :
                fightClass.startsWith('B') ? 'bg-secondary text-secondary-foreground' :
                'bg-muted text-muted-foreground'
              }`}>
                {fightClass}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Fighters */}
      <div className="p-4">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          {/* Fighter A */}
          <div className="text-center">
            <p className="font-bold text-foreground text-sm">{fight.fighter_a_name}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {(fight.pool_a_lamports / LAMPORTS).toFixed(2)} SOL
            </p>
            <p className="text-primary font-bold text-lg">{oddsA.toFixed(2)}x</p>
             {fight.status === "open" && (
              <Button
                size="sm"
                className="mt-2 w-full bg-primary text-primary-foreground hover:bg-primary/90 text-xs"
                onClick={() => wallet ? onPredict(fight, "fighter_a") : onWalletRequired?.()}
              >
                Predict
              </Button>
            )}
            {fight.status === "resolved" && fight.winner === "fighter_a" && (
              <div className="mt-2 flex items-center justify-center gap-1 text-primary">
                <Trophy className="w-4 h-4" />
                <span className="text-xs font-bold">WINNER</span>
              </div>
            )}
          </div>

          {/* VS */}
          <div className="flex flex-col items-center">
            <Swords className="w-5 h-5 text-primary/60" />
            <span className="text-[10px] text-muted-foreground font-bold">VS</span>
          </div>

          {/* Fighter B */}
          <div className="text-center">
            <p className="font-bold text-foreground text-sm">{fight.fighter_b_name}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {(fight.pool_b_lamports / LAMPORTS).toFixed(2)} SOL
            </p>
            <p className="text-primary font-bold text-lg">{oddsB.toFixed(2)}x</p>
             {fight.status === "open" && (
              <Button
                size="sm"
                className="mt-2 w-full bg-primary text-primary-foreground hover:bg-primary/90 text-xs"
                onClick={() => wallet ? onPredict(fight, "fighter_b") : onWalletRequired?.()}
              >
                Predict
              </Button>
            )}
            {fight.status === "resolved" && fight.winner === "fighter_b" && (
              <div className="mt-2 flex items-center justify-center gap-1 text-primary">
                <Trophy className="w-4 h-4" />
                <span className="text-xs font-bold">WINNER</span>
              </div>
            )}
          </div>
        </div>

        {/* Total pool */}
        <div className="mt-3 pt-2 border-t border-border/30 flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">Total Pool</span>
          <span className="text-xs font-bold text-primary">{totalPool.toFixed(2)} SOL</span>
        </div>

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
          <p className="text-xs text-center text-muted-foreground mt-3">
            Claims open shortly after resolution...
          </p>
        )}
      </div>
    </Card>
  );
}

export type { Fight };
