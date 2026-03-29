import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Lock, Trophy, ChevronDown, ChevronUp } from "lucide-react";

interface Props {
  event: any;
  fight: any | null;
  onAction: (action: string, eventId: string, extra?: any) => Promise<void>;
}

export default function OperatorEventActions({ event, fight, onAction }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [settling, setSettling] = useState(false);
  const [selectedWinner, setSelectedWinner] = useState<string | null>(null);

  const fightStatus = fight?.status || "unknown";
  const isOpen = fightStatus === "open";
  const isLocked = fightStatus === "locked" || event.status === "closed";
  const isSettled = fightStatus === "settled" || fightStatus === "confirmed";
  const hasWinner = !!fight?.winner;
  const poolTotal = Number(fight?.pool_a_usd || 0) + Number(fight?.pool_b_usd || 0);

  const handleSettle = async () => {
    if (!selectedWinner || !fight) return;
    setSettling(true);
    await onAction("settle_event", event.id, {
      fight_id: fight.id,
      winner: selectedWinner,
    });
    setSettling(false);
    setExpanded(false);
  };

  return (
    <div className="bg-white/[0.03] border border-white/5 rounded-xl overflow-hidden">
      <div
        className="p-4 flex items-center justify-between cursor-pointer hover:bg-white/[0.02] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{event.title}</div>
          <div className="text-sm text-white/40 flex items-center gap-2 flex-wrap">
            <span>{event.sport}</span>
            <span>•</span>
            <span>{event.event_date ? new Date(event.event_date).toLocaleDateString() : "No date"}</span>
            {event.is_featured && <span className="text-yellow-400 text-xs">⭐ Featured</span>}
            {poolTotal > 0 && <span className="text-green-400 text-xs">${poolTotal.toFixed(2)} pool</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-1 rounded-full ${
            isSettled ? "bg-purple-500/10 text-purple-400" :
            isLocked ? "bg-orange-500/10 text-orange-400" :
            isOpen ? "bg-green-500/10 text-green-400" :
            "bg-white/5 text-white/40"
          }`}>
            {isSettled ? (hasWinner ? "Settled" : "Confirmed") :
             isLocked ? "Locked" :
             isOpen ? "Live" : fightStatus}
          </span>
          {expanded ? <ChevronUp size={16} className="text-white/30" /> : <ChevronDown size={16} className="text-white/30" />}
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t border-white/5 pt-3 space-y-3">
          {/* Pool info */}
          {fight && (
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="bg-white/[0.02] rounded-lg p-2 text-center">
                <div className="text-white/40 text-xs">{event.team_a}</div>
                <div className="font-medium">${Number(fight.pool_a_usd || 0).toFixed(2)}</div>
                <div className="text-[10px] text-white/30">{Number(fight.shares_a || 0)} shares</div>
              </div>
              <div className="bg-white/[0.02] rounded-lg p-2 text-center">
                <div className="text-white/40 text-xs">{event.team_b}</div>
                <div className="font-medium">${Number(fight.pool_b_usd || 0).toFixed(2)}</div>
                <div className="text-[10px] text-white/30">{Number(fight.shares_b || 0)} shares</div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            {isOpen && (
              <Button
                size="sm"
                variant="outline"
                className="border-orange-500/30 text-orange-400 hover:bg-orange-500/10"
                onClick={(e) => { e.stopPropagation(); onAction("close_event", event.id, { fight_id: fight?.id }); }}
              >
                <Lock size={14} /> Close Predictions
              </Button>
            )}

            {(isLocked || isOpen) && !isSettled && (
              <div className="w-full space-y-2 mt-1">
                <div className="text-xs text-white/50 font-medium">Set Winner:</div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={selectedWinner === "fighter_a" ? "default" : "outline"}
                    className={selectedWinner === "fighter_a"
                      ? "bg-blue-600 hover:bg-blue-500 border-0"
                      : "border-white/10 text-white hover:bg-white/5"
                    }
                    onClick={(e) => { e.stopPropagation(); setSelectedWinner("fighter_a"); }}
                  >
                    {event.team_a}
                  </Button>
                  <Button
                    size="sm"
                    variant={selectedWinner === "fighter_b" ? "default" : "outline"}
                    className={selectedWinner === "fighter_b"
                      ? "bg-blue-600 hover:bg-blue-500 border-0"
                      : "border-white/10 text-white hover:bg-white/5"
                    }
                    onClick={(e) => { e.stopPropagation(); setSelectedWinner("fighter_b"); }}
                  >
                    {event.team_b}
                  </Button>
                  <Button
                    size="sm"
                    variant={selectedWinner === "draw" ? "default" : "outline"}
                    className={selectedWinner === "draw"
                      ? "bg-blue-600 hover:bg-blue-500 border-0"
                      : "border-white/10 text-white hover:bg-white/5"
                    }
                    onClick={(e) => { e.stopPropagation(); setSelectedWinner("draw"); }}
                  >
                    Draw
                  </Button>
                </div>
                {selectedWinner && (
                  <Button
                    size="sm"
                    disabled={settling}
                    className="bg-purple-600 hover:bg-purple-500 border-0 w-full"
                    onClick={(e) => { e.stopPropagation(); handleSettle(); }}
                  >
                    <Trophy size={14} /> {settling ? "Settling..." : "Confirm & Settle"}
                  </Button>
                )}
              </div>
            )}

            {isSettled && hasWinner && (
              <div className="text-sm text-purple-300">
                Winner: <span className="font-bold">
                  {fight.winner === "fighter_a" ? event.team_a :
                   fight.winner === "fighter_b" ? event.team_b : "Draw"}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
