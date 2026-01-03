import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Dice5, Loader2, LogOut, Flag } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";

interface DiceRollStartProps {
  roomPda: string;
  myWallet: string;
  player1Wallet: string;
  player2Wallet: string;
  onComplete: (startingWallet: string) => void;
  // Exit handlers
  onLeave?: () => void;
  onForfeit?: () => void;
  isLeaving?: boolean;
  isForfeiting?: boolean;
}

interface StartRollResult {
  p1: { wallet: string; dice: number[]; total: number };
  p2: { wallet: string; dice: number[]; total: number };
  reroll_count: number;
  winner: string;
}

// Single 3D-styled die component
const Die3D = ({ 
  value, 
  rolling, 
  color = "gold",
  size = "md"
}: { 
  value: number; 
  rolling: boolean;
  color?: "gold" | "obsidian";
  size?: "sm" | "md" | "lg";
}) => {
  const sizeClasses = {
    sm: "w-10 h-10",
    md: "w-14 h-14",
    lg: "w-20 h-20"
  };
  
  const pipSize = {
    sm: "w-1.5 h-1.5",
    md: "w-2 h-2",
    lg: "w-3 h-3"
  };

  const pipPositions: Record<number, { top: string; left: string }[]> = {
    1: [{ top: "50%", left: "50%" }],
    2: [{ top: "25%", left: "25%" }, { top: "75%", left: "75%" }],
    3: [{ top: "25%", left: "25%" }, { top: "50%", left: "50%" }, { top: "75%", left: "75%" }],
    4: [{ top: "25%", left: "25%" }, { top: "25%", left: "75%" }, { top: "75%", left: "25%" }, { top: "75%", left: "75%" }],
    5: [{ top: "25%", left: "25%" }, { top: "25%", left: "75%" }, { top: "50%", left: "50%" }, { top: "75%", left: "25%" }, { top: "75%", left: "75%" }],
    6: [{ top: "25%", left: "25%" }, { top: "25%", left: "75%" }, { top: "50%", left: "25%" }, { top: "50%", left: "75%" }, { top: "75%", left: "25%" }, { top: "75%", left: "75%" }],
  };

  const isGold = color === "gold";

  return (
    <div
      className={cn(
        sizeClasses[size],
        "relative rounded-lg shadow-xl transition-all duration-300",
        rolling && "animate-[spin_0.15s_linear_infinite]"
      )}
      style={{
        background: isGold
          ? "linear-gradient(145deg, hsl(45 70% 85%) 0%, hsl(40 60% 75%) 50%, hsl(35 50% 65%) 100%)"
          : "linear-gradient(145deg, hsl(220 15% 25%) 0%, hsl(220 12% 15%) 50%, hsl(220 10% 10%) 100%)",
        boxShadow: isGold
          ? "0 4px 15px hsl(45 80% 40% / 0.4), inset 0 1px 2px rgba(255,255,255,0.3)"
          : "0 4px 15px rgba(0,0,0,0.5), inset 0 1px 2px rgba(255,255,255,0.1)",
        border: isGold ? "2px solid hsl(35 60% 50%)" : "2px solid hsl(45 70% 45%)"
      }}
    >
      {/* Pips */}
      {pipPositions[value]?.map((pos, i) => (
        <div
          key={i}
          className={cn(
            pipSize[size],
            "absolute rounded-full -translate-x-1/2 -translate-y-1/2"
          )}
          style={{
            top: pos.top,
            left: pos.left,
            background: isGold
              ? "linear-gradient(145deg, hsl(35 70% 25%) 0%, hsl(30 60% 15%) 100%)"
              : "linear-gradient(145deg, hsl(45 90% 60%) 0%, hsl(40 80% 45%) 100%)",
            boxShadow: isGold
              ? "inset 0 1px 2px rgba(0,0,0,0.3)"
              : "0 0 4px hsl(45 90% 50% / 0.5)"
          }}
        />
      ))}
      
      {/* Shine overlay */}
      <div 
        className="absolute inset-0 rounded-lg pointer-events-none"
        style={{
          background: "linear-gradient(135deg, rgba(255,255,255,0.3) 0%, transparent 50%)"
        }}
      />
    </div>
  );
};

export function DiceRollStart({ 
  roomPda,
  myWallet,
  player1Wallet,
  player2Wallet,
  onComplete,
  onLeave,
  onForfeit,
  isLeaving = false,
  isForfeiting = false,
}: DiceRollStartProps) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<"waiting" | "loading" | "rolling" | "result">("waiting");
  const [playerDice, setPlayerDice] = useState<number[]>([1, 1]);
  const [opponentDice, setOpponentDice] = useState<number[]>([1, 1]);
  const [result, setResult] = useState<StartRollResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showFallback, setShowFallback] = useState(false);
  
  // Timeout ref for 15s fallback
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fallbackUsedRef = useRef(false);
  
  // Determine which player is "me" for display purposes
  const isPlayer1 = myWallet.toLowerCase() === player1Wallet.toLowerCase();
  const myName = t("common.you") || "You";
  const opponentName = t("game.opponent") || "Opponent";

  /**
   * Compute deterministic starter from roomPda
   * Both clients will compute the same result
   */
  const computeDeterministicStarter = useCallback((): string => {
    // Simple hash: sum of char codes mod 2
    const sum = roomPda.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const starterIndex = sum % 2;
    return starterIndex === 0 ? player1Wallet : player2Wallet;
  }, [roomPda, player1Wallet, player2Wallet]);

  // 15-second timeout for fallback
  useEffect(() => {
    // Start 15s timeout when component mounts
    timeoutRef.current = setTimeout(() => {
      if (phase !== "result" && !fallbackUsedRef.current) {
        console.log("[DiceRollStart] Timeout - using deterministic fallback");
        setShowFallback(true);
        fallbackUsedRef.current = true;
        
        // Compute deterministic starter WITHOUT writing to Supabase
        const starterWallet = computeDeterministicStarter();
        console.log("[DiceRollStart] Deterministic starter:", starterWallet);
        
        // Auto-proceed with fallback after a brief delay
        setTimeout(() => {
          onComplete(starterWallet);
        }, 1000);
      }
    }, 15000);
    
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [phase, computeDeterministicStarter, onComplete]);

  // Clear timeout when dice roll completes
  useEffect(() => {
    if (phase === "result" && timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      setShowFallback(false);
    }
  }, [phase]);

  // Check if roll is already finalized on mount
  useEffect(() => {
    const checkExistingRoll = async () => {
      try {
        const { data: session } = await supabase
          .from("game_sessions")
          .select("start_roll_finalized, start_roll, starting_player_wallet")
          .eq("room_pda", roomPda)
          .maybeSingle();

        if (session?.start_roll_finalized && session.start_roll && session.starting_player_wallet) {
          // Roll already exists - display it
          const rollData = session.start_roll as unknown as StartRollResult;
          setResult(rollData);
          
          // Set dice values for display
          if (isPlayer1) {
            setPlayerDice(rollData.p1.dice);
            setOpponentDice(rollData.p2.dice);
          } else {
            setPlayerDice(rollData.p2.dice);
            setOpponentDice(rollData.p1.dice);
          }
          
          setPhase("result");
        }
      } catch (err) {
        console.error("[DiceRollStart] Failed to check existing roll:", err);
      }
    };

    checkExistingRoll();
  }, [roomPda, isPlayer1]);

  // Rolling animation effect
  useEffect(() => {
    if (phase !== "rolling") return;

    const interval = setInterval(() => {
      setPlayerDice([
        Math.floor(Math.random() * 6) + 1,
        Math.floor(Math.random() * 6) + 1
      ]);
      setOpponentDice([
        Math.floor(Math.random() * 6) + 1,
        Math.floor(Math.random() * 6) + 1
      ]);
    }, 100);

    // After animation, set final values from result
    const timeout = setTimeout(() => {
      clearInterval(interval);
      
      if (result) {
        if (isPlayer1) {
          setPlayerDice(result.p1.dice);
          setOpponentDice(result.p2.dice);
        } else {
          setPlayerDice(result.p2.dice);
          setOpponentDice(result.p1.dice);
        }
        setPhase("result");
      }
    }, 1200);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [phase, result, isPlayer1]);

  const handleRoll = useCallback(async () => {
    setPhase("loading");
    setError(null);

    try {
      // Call the RPC to compute deterministic roll
      const { data, error: rpcError } = await supabase.rpc("compute_start_roll", {
        p_room_pda: roomPda,
      });

      if (rpcError) {
        console.error("[DiceRollStart] RPC error:", rpcError);
        setError(rpcError.message || "Failed to compute roll");
        setPhase("waiting");
        return;
      }

      // Type assertion for the RPC response
      const rpcResult = data as unknown as { starting_player_wallet: string; start_roll: StartRollResult } | null;
      
      if (!rpcResult || !rpcResult.start_roll) {
        setError("Failed to get roll result");
        setPhase("waiting");
        return;
      }

      const rollResult = rpcResult.start_roll;
      setResult(rollResult);
      
      // Start the animation phase
      setPhase("rolling");
    } catch (err: any) {
      console.error("[DiceRollStart] Error:", err);
      setError(err.message || "Unexpected error");
      setPhase("waiting");
    }
  }, [roomPda]);

  const handleContinue = useCallback(() => {
    if (result) {
      onComplete(result.winner);
    }
  }, [result, onComplete]);

  // Get my total and opponent total for display
  const myTotal = result 
    ? (isPlayer1 ? result.p1.total : result.p2.total)
    : playerDice[0] + playerDice[1];
  const opponentTotal = result
    ? (isPlayer1 ? result.p2.total : result.p1.total)
    : opponentDice[0] + opponentDice[1];
  
  const isWinner = result?.winner.toLowerCase() === myWallet.toLowerCase();
  const exitDisabled = isLeaving || isForfeiting;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-sm">
      <div className="relative max-w-lg w-full mx-4 p-8 rounded-2xl border border-primary/30 bg-card/95 shadow-[0_0_60px_-10px_hsl(45_93%_54%_/_0.3)]">
        {/* Decorative corners */}
        <div className="absolute top-2 left-2 w-8 h-8 border-l-2 border-t-2 border-primary/40 rounded-tl-lg" />
        <div className="absolute top-2 right-2 w-8 h-8 border-r-2 border-t-2 border-primary/40 rounded-tr-lg" />
        <div className="absolute bottom-2 left-2 w-8 h-8 border-l-2 border-b-2 border-primary/40 rounded-bl-lg" />
        <div className="absolute bottom-2 right-2 w-8 h-8 border-r-2 border-b-2 border-primary/40 rounded-br-lg" />

        <h2 className="text-center font-display text-2xl mb-2 text-primary">
          {t("diceRoll.rollToStart") || "Roll to Start"}
        </h2>
        <p className="text-center text-muted-foreground text-sm mb-8">
          {t("diceRoll.highestGoesFirst") || "Highest total goes first"}
        </p>

        {/* Dice Display */}
        <div className="flex justify-between items-center mb-8">
          {/* My Side */}
          <div className="text-center flex-1">
            <p className="text-sm font-medium text-primary mb-3">{myName}</p>
            <div className="flex justify-center gap-2">
              <Die3D value={playerDice[0]} rolling={phase === "rolling"} color="gold" />
              <Die3D value={playerDice[1]} rolling={phase === "rolling"} color="gold" />
            </div>
            {phase === "result" && (
              <p className="mt-2 text-lg font-bold text-primary">
                {myTotal}
              </p>
            )}
          </div>

          {/* VS */}
          <div className="px-4">
            <span className="text-2xl font-display text-muted-foreground/50">VS</span>
          </div>

          {/* Opponent Side */}
          <div className="text-center flex-1">
            <p className="text-sm font-medium text-muted-foreground mb-3">{opponentName}</p>
            <div className="flex justify-center gap-2">
              <Die3D value={opponentDice[0]} rolling={phase === "rolling"} color="obsidian" />
              <Die3D value={opponentDice[1]} rolling={phase === "rolling"} color="obsidian" />
            </div>
            {phase === "result" && (
              <p className="mt-2 text-lg font-bold text-muted-foreground">
                {opponentTotal}
              </p>
            )}
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="text-center mb-6 py-3 px-4 rounded-lg bg-destructive/20 text-destructive">
            {error}
          </div>
        )}

        {/* Fallback Message */}
        {showFallback && phase !== "result" && (
          <div className="text-center mb-6 py-3 px-4 rounded-lg bg-amber-500/20 text-amber-400">
            <p className="text-sm">
              {t("diceRoll.usingFallback") || "Connection slow - using deterministic start order..."}
            </p>
          </div>
        )}

        {/* Result Message */}
        {phase === "result" && result && (
          <div className={cn(
            "text-center mb-6 py-3 px-4 rounded-lg",
            isWinner ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
          )}>
            {isWinner 
              ? `${myName} ${t("diceRoll.rolledHigher") || "rolled higher! You go first."}`
              : `${opponentName} ${t("diceRoll.theyGoFirst") || "rolled higher! They go first."}`
            }
            {result.reroll_count > 0 && (
              <span className="block text-xs mt-1 opacity-70">
                ({t("diceRoll.resolvedAfter") || "Resolved after"} {result.reroll_count} {t("diceRoll.tieBreaker") || "tie-breaker"}{result.reroll_count > 1 ? 's' : ''})
              </span>
            )}
          </div>
        )}

        {/* Action Button */}
        <div className="text-center">
          {phase === "waiting" && !showFallback && (
            <Button onClick={handleRoll} size="lg" className="gap-2">
              <Dice5 className="w-5 h-5" />
              {t("diceRoll.rollDice") || "Roll Dice"}
            </Button>
          )}
          
          {phase === "loading" && (
            <Button disabled size="lg" className="gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              {t("diceRoll.computing") || "Computing..."}
            </Button>
          )}
          
          {phase === "rolling" && (
            <Button disabled size="lg" className="gap-2">
              {t("diceRoll.rolling") || "Rolling..."}
            </Button>
          )}
          
          {phase === "result" && (
            <Button onClick={handleContinue} size="lg">
              {t("diceRoll.startGame") || "Start Game"}
            </Button>
          )}
        </div>

        {/* Exit buttons - always visible */}
        {(onLeave || onForfeit) && (
          <div className="mt-6 pt-4 border-t border-primary/20 flex justify-center gap-4">
            {onLeave && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onLeave}
                disabled={exitDisabled}
                className="text-muted-foreground hover:text-foreground"
              >
                {isLeaving ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <LogOut className="w-4 h-4 mr-2" />
                )}
                {t("forfeit.leave") || "Leave"}
              </Button>
            )}
            {onForfeit && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onForfeit}
                disabled={exitDisabled}
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                {isForfeiting ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Flag className="w-4 h-4 mr-2" />
                )}
                {t("forfeit.leaveAndForfeit") || "Leave & Forfeit"}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
