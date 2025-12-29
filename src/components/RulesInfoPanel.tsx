import { useState } from "react";
import { ChevronDown, ChevronUp, Shield, Coins, Clock, AlertTriangle, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

interface RulesInfoPanelProps {
  stakeSol: number;
  isRanked: boolean;
  className?: string;
}

export function RulesInfoPanel({ stakeSol, isRanked, className }: RulesInfoPanelProps) {
  const [expanded, setExpanded] = useState(false);

  // Only show for ranked games
  if (!isRanked) return null;

  const potSol = stakeSol * 2;
  const feeSol = potSol * 0.05;
  const payoutSol = potSol - feeSol;

  return (
    <div className={cn("fixed bottom-20 left-4 z-30", className)}>
      <div className="bg-card/95 backdrop-blur-sm border rounded-lg shadow-lg overflow-hidden max-w-xs">
        {/* Header - always visible */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between gap-2 p-3 hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Match Rules</span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400 font-medium">
              Ranked
            </span>
          </div>
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        {/* Expanded content */}
        {expanded && (
          <div className="px-3 pb-3 space-y-2 border-t">
            {/* Stake */}
            <div className="flex items-center gap-2 pt-2">
              <Coins className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
              <span className="text-xs text-muted-foreground">Stake:</span>
              <span className="text-xs font-mono font-medium ml-auto">
                {stakeSol > 0 ? `${stakeSol.toFixed(4)} SOL` : "Free"}
              </span>
            </div>

            {/* Pot & Fee */}
            {stakeSol > 0 && (
              <>
                <div className="flex items-center gap-2">
                  <Trophy className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                  <span className="text-xs text-muted-foreground">Winner payout:</span>
                  <span className="text-xs font-mono font-medium text-emerald-500 ml-auto">
                    {payoutSol.toFixed(4)} SOL
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground ml-5">Platform fee:</span>
                  <span className="text-xs font-mono text-muted-foreground ml-auto">
                    5% ({feeSol.toFixed(4)} SOL)
                  </span>
                </div>
              </>
            )}

            {/* Turn time */}
            <div className="flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
              <span className="text-xs text-muted-foreground">Turn time:</span>
              <span className="text-xs font-medium ml-auto">Reasonable pace</span>
            </div>

            {/* Forfeit rule */}
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
              <span className="text-xs text-muted-foreground">Forfeit:</span>
              <span className="text-xs font-medium ml-auto">Disconnect/AFK = loss</span>
            </div>

            {/* Divider */}
            <div className="border-t pt-2 mt-2">
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Both players accepted these rules before the match started. 
                Payouts are executed on-chain.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
