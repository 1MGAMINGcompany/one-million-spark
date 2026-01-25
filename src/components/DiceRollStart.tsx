import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dice5, Loader2, LogOut, Flag, RefreshCw, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
import { AudioManager } from "@/lib/AudioManager";

interface DiceRollStartProps {
  bothReady?: boolean;
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
  p1: { wallet: string; die?: number; dice?: number[]; total: number };
  p2: { wallet: string; die?: number; dice?: number[]; total: number };
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
  const [playerDie, setPlayerDie] = useState<number>(1);
  const [opponentDie, setOpponentDie] = useState<number>(1);
  const [result, setResult] = useState<StartRollResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showFallback, setShowFallback] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isPickingStarter, setIsPickingStarter] = useState(false);

  // HARD GATE: In ranked games, do not show Dice UI until both players accepted rules.
  if (isRankedGame && !bothReady) {
    return null;
  }

    const [rankedBlocked, setRankedBlocked] = useState(isRankedGame);
  
  // Timeout ref for 15s fallback
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fallbackUsedRef = useRef(false);
  
  // Determine which player is "me" for display purposes (use trim, not toLowerCase - Base58 is case-sensitive)
  const isPlayer1 = myWallet.trim() === player1Wallet.trim();
  const myName = t("common.you") || "You";
  const opponentName = t("game.opponent") || "Opponent";

    // Ranked safety: hide dice UI until both players are ready (prevents overlap with RulesGate modal)
    if (rankedBlocked && phase !== "result") {
      return null;
    }

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

  // 15-second timeout for fallback UI
  useEffect(() => {
    // Start 15s timeout when component mounts
    timeoutRef.current = setTimeout(() => {
      if (phase !== "result" && !fallbackUsedRef.current) {
        console.log("[DiceRollStart] 15s timeout - showing fallback options");
        setShowFallback(true);
      }
    }, 15000);
    
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [phase]);

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
        // Use Edge Function instead of direct table access (RLS locked)
        const { data: resp, error } = await supabase.functions.invoke("game-session-get", {
          body: { roomPda },
        });
        
        if (error) {
          console.error("[DiceRollStart] Edge function error:", error);
          return;
        }

        const session = resp?.session;



        // If ranked session not created yet (session is null), keep dice hidden until server is ready.


        if (isRankedGame && !session) {


          setRankedBlocked(true);


          return;


        }
        // If this is a ranked session, do NOT show DiceRollStart UI until both players are ready.


        // This prevents the Dice UI from appearing at the same time as the Ranked Match Rules modal.


        const isRankedSession = isRankedGame ||


          session?.mode === "ranked" ||


          session?.is_ranked === true ||


          session?.isRanked === true ||


          session?.ranked === true;



        const readyFromFlags = Boolean(session?.p1_ready && session?.p2_ready);


        const readyFromAcceptances = Boolean(resp?.acceptances?.bothAccepted);


        const readyFromStartRoll = Boolean(session?.start_roll_finalized);



        if (isRankedSession && !(readyFromFlags || readyFromAcceptances || readyFromStartRoll)) {


          setRankedBlocked(true);


        } else {


          setRankedBlocked(false);


        }
        if (session?.start_roll_finalized && session.start_roll && session.starting_player_wallet) {
          // Roll already exists - display it
          const rollData = session.start_roll as unknown as StartRollResult;
          setResult(rollData);
          
          // Set die values for display (support both old 2-dice and new 1-die format)
          if (isPlayer1) {
            setPlayerDie(rollData.p1.die ?? rollData.p1.dice?.[0] ?? 1);
            setOpponentDie(rollData.p2.die ?? rollData.p2.dice?.[0] ?? 1);
          } else {
            setPlayerDie(rollData.p2.die ?? rollData.p2.dice?.[0] ?? 1);
            setOpponentDie(rollData.p1.die ?? rollData.p1.dice?.[0] ?? 1);
          }
          
          setPhase("result");
        }
      } catch (err) {
        console.error("[DiceRollStart] Failed to check existing roll:", err);
      }
    };

    checkExistingRoll();
  }, [roomPda, isPlayer1]);




    // While rankedBlocked, poll the server until both players are ready, then allow dice UI to appear.


    useEffect(() => {


      if (!rankedBlocked) return;



      let cancelled = false;


      const poll = async () => {


        try {


          const { data: resp, error } = await supabase.functions.invoke("game-session-get", {


            body: { roomPda },


          });


          if (cancelled) return;


          if (error) return;



          const session = resp?.session;


          const isRankedSession =


            session?.mode === "ranked" ||


            session?.is_ranked === true ||


            session?.isRanked === true ||


            session?.ranked === true;



          const readyFromFlags = Boolean(session?.p1_ready && session?.p2_ready);


          const readyFromAcceptances = Boolean(resp?.acceptances?.bothAccepted);


          const readyFromStartRoll = Boolean(session?.start_roll_finalized);



          if (!isRankedSession || readyFromFlags || readyFromAcceptances || readyFromStartRoll) {


            setRankedBlocked(false);


          }


        } catch {


          // ignore transient failures


        }


      };



      poll();


      const id = setInterval(poll, 2000);


      return () => {


        cancelled = true;


        clearInterval(id);


      };


    }, [rankedBlocked, roomPda]);
  // Rolling animation effect
  useEffect(() => {
    if (phase !== "rolling") return;

    const interval = setInterval(() => {
      setPlayerDie(Math.floor(Math.random() * 6) + 1);
      setOpponentDie(Math.floor(Math.random() * 6) + 1);
    }, 100);

    // After animation, set final values from result
    const timeout = setTimeout(() => {
      clearInterval(interval);
      
      if (result) {
        if (isPlayer1) {
          setPlayerDie(result.p1.die ?? result.p1.dice?.[0] ?? 1);
          setOpponentDie(result.p2.die ?? result.p2.dice?.[0] ?? 1);
        } else {
          setPlayerDie(result.p2.die ?? result.p2.dice?.[0] ?? 1);
          setOpponentDie(result.p1.die ?? result.p1.dice?.[0] ?? 1);
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
    // Unlock audio on first user gesture (mobile browsers require this)
    AudioManager.unlockAudio();
    
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
      setShowFallback(false);
      
      // Start the animation phase
      setPhase("rolling");
    } catch (err: any) {
      console.error("[DiceRollStart] Error:", err);
      setError(err.message || "Unexpected error");
      setPhase("waiting");
    }
  }, [roomPda]);

  const handleRetrySync = useCallback(async () => {
    setIsRetrying(true);
    setShowFallback(false);
    setError(null);
    
    try {
      await handleRoll();
    } finally {
      setIsRetrying(false);
    }
  }, [handleRoll]);

  const handlePickStarter = useCallback(async () => {
    setIsPickingStarter(true);
    const starterWallet = computeDeterministicStarter();
    
    console.log("[DiceRollStart] Manual pick - starter:", starterWallet);
    
    try {
      // Call edge function to safely set starter (validates caller is participant)
      const { error: fnError } = await supabase.functions.invoke('set-manual-starter', {
        body: { roomPda, starterWallet, callerWallet: myWallet }
      });
      
      if (fnError) {
        console.warn("[DiceRollStart] Edge function error (proceeding anyway):", fnError);
      }
      
      // Proceed with game regardless of edge function result
      fallbackUsedRef.current = true;
      onComplete(starterWallet);
    } catch (e) {
      console.warn("[DiceRollStart] Exception calling edge function (proceeding anyway):", e);
      // Proceed locally on error
      fallbackUsedRef.current = true;
      onComplete(starterWallet);
    } finally {
      setIsPickingStarter(false);
    }
  }, [computeDeterministicStarter, roomPda, myWallet, onComplete]);

  const handleContinue = useCallback(() => {
    if (result) {
      onComplete(result.winner);
    }
  }, [result, onComplete]);

  // Get my total and opponent total for display
  const myTotal = result 
    ? (isPlayer1 ? result.p1.total : result.p2.total)
    : playerDie;
  const opponentTotal = result
    ? (isPlayer1 ? result.p2.total : result.p1.total)
    : opponentDie;
  
  const isWinner = result?.winner.toLowerCase() === myWallet.toLowerCase();
  const exitDisabled = isLeaving || isForfeiting || isRetrying || isPickingStarter;

  // STEP 3 FIX: Use a contained Card instead of fixed inset-0 overlay
  return (
    <div className="w-full min-h-[60vh] flex items-center justify-center p-4">
      <Card className="relative w-full max-w-lg p-6 md:p-8 border-primary/30 bg-card/95 shadow-[0_0_60px_-10px_hsl(45_93%_54%_/_0.3)]">
        {/* Decorative corners */}
        <div className="absolute top-2 left-2 w-8 h-8 border-l-2 border-t-2 border-primary/40 rounded-tl-lg" />
        <div className="absolute top-2 right-2 w-8 h-8 border-r-2 border-t-2 border-primary/40 rounded-tr-lg" />
        <div className="absolute bottom-2 left-2 w-8 h-8 border-l-2 border-b-2 border-primary/40 rounded-bl-lg" />
        <div className="absolute bottom-2 right-2 w-8 h-8 border-r-2 border-b-2 border-primary/40 rounded-br-lg" />

        <h2 className="text-center font-display text-3xl mb-2 text-primary drop-shadow-lg">
          {t("diceRoll.rollToStart") || "Roll to Start"}
        </h2>
        <p className="text-center text-muted-foreground text-sm mb-8">
          {t("diceRoll.highestGoesFirst") || "Highest total goes first"}
        </p>

        {/* Dice Display - with wallet addresses */}
        <div className="flex justify-between items-center mb-8">
          {/* My Side */}
          <div className="text-center flex-1">
            <p className="text-sm font-medium text-amber-400 mb-2">{myName}</p>
            <p className="text-xs font-mono text-muted-foreground/70 mb-3">
              ({myWallet.slice(0, 4)}...{myWallet.slice(-4)})
            </p>
            <div className="flex justify-center">
              <Die3D value={playerDie} rolling={phase === "rolling"} color="gold" size="lg" />
            </div>
            {phase === "result" && (
              <p className="mt-3 text-xl font-bold text-primary">
                {myTotal}
              </p>
            )}
          </div>

          {/* VS */}
          <div className="px-6">
            <span className="text-3xl font-display text-muted-foreground/50">VS</span>
          </div>

          {/* Opponent Side */}
          <div className="text-center flex-1">
            <p className="text-sm font-medium text-slate-400 mb-2">{opponentName}</p>
            <p className="text-xs font-mono text-muted-foreground/70 mb-3">
              ({(isPlayer1 ? player2Wallet : player1Wallet).slice(0, 4)}...{(isPlayer1 ? player2Wallet : player1Wallet).slice(-4)})
            </p>
            <div className="flex justify-center">
              <Die3D value={opponentDie} rolling={phase === "rolling"} color="obsidian" size="lg" />
            </div>
            {phase === "result" && (
              <p className="mt-3 text-xl font-bold text-muted-foreground">
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

        {/* Fallback Panel - shown after 15s timeout */}
        {showFallback && phase !== "result" && (
          <div className="mb-6 p-4 rounded-lg bg-amber-950/30 border border-amber-500/30">
            <p className="text-amber-300 text-sm mb-3 text-center">
              {t("diceRoll.takingTooLong") || "Dice roll taking too long. Choose an option:"}
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              <Button 
                size="sm" 
                variant="outline"
                onClick={handleRetrySync}
                disabled={isRetrying || isPickingStarter}
                className="gap-1"
              >
                {isRetrying ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                {t("diceRoll.retrySync") || "Retry Sync"}
              </Button>
              <Button 
                size="sm" 
                variant="secondary"
                onClick={handlePickStarter}
                disabled={isRetrying || isPickingStarter}
                className="gap-1"
              >
                {isPickingStarter ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Wand2 className="w-4 h-4" />
                )}
                {t("diceRoll.pickStarterAuto") || "Pick Starter (Auto)"}
              </Button>
            </div>
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
            <div className="space-y-4">
              <p className="text-muted-foreground text-sm">
                {t("diceRoll.bothReady") || "Both players ready. Roll to decide who goes first!"}
              </p>
              <Button onClick={handleRoll} size="lg" className="gap-2">
                <Dice5 className="w-5 h-5" />
                {t("diceRoll.rollDice") || "Roll Dice"}
              </Button>
            </div>
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
            <Button onClick={handleContinue} size="lg" className="gap-2">
              {t("diceRoll.continueToGame") || "Continue to Game"}
            </Button>
          )}
        </div>

        {/* Exit Buttons - STEP 6: Only Leave button during dice roll phase */}
        {/* Forfeit is intentionally disabled during pre-game phase - only available during active gameplay */}
        <div className="mt-6 pt-4 border-t border-border/50 flex gap-2 justify-center flex-wrap">
          {onLeave && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onLeave}
              disabled={exitDisabled}
              className="gap-1 text-muted-foreground hover:text-foreground"
            >
              {isLeaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <LogOut className="w-4 h-4" />
              )}
              {t("game.leave") || "Leave"}
            </Button>
          )}
          
          {/* Forfeit intentionally disabled during dice-roll/start phase.
              Forfeit should only be available during active gameplay when stakes are locked. */}
          {void onForfeit}
        </div>
      </Card>
    </div>
  );
}
