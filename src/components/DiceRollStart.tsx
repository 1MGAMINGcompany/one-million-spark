import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Dice5 } from "lucide-react";
import { cn } from "@/lib/utils";

interface DiceRollStartProps {
  onComplete: (playerStarts: boolean) => void;
  playerName?: string;
  opponentName?: string;
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
  onComplete, 
  playerName = "You",
  opponentName = "Opponent" 
}: DiceRollStartProps) {
  const [phase, setPhase] = useState<"waiting" | "rolling" | "result">("waiting");
  const [playerDice, setPlayerDice] = useState<number[]>([1, 1]);
  const [opponentDice, setOpponentDice] = useState<number[]>([1, 1]);
  const [winner, setWinner] = useState<"player" | "opponent" | "tie" | null>(null);
  const [rollCount, setRollCount] = useState(0);

  // Roll animation effect
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

    const timeout = setTimeout(() => {
      clearInterval(interval);
      
      // Final roll
      const pDice = [
        Math.floor(Math.random() * 6) + 1,
        Math.floor(Math.random() * 6) + 1
      ];
      const oDice = [
        Math.floor(Math.random() * 6) + 1,
        Math.floor(Math.random() * 6) + 1
      ];
      
      setPlayerDice(pDice);
      setOpponentDice(oDice);
      
      const playerTotal = pDice[0] + pDice[1];
      const opponentTotal = oDice[0] + oDice[1];
      
      if (playerTotal > opponentTotal) {
        setWinner("player");
        setPhase("result");
      } else if (opponentTotal > playerTotal) {
        setWinner("opponent");
        setPhase("result");
      } else {
        // Tie - need to reroll (doubles)
        setWinner("tie");
        setPhase("result");
        setRollCount(prev => prev + 1);
      }
    }, 1500);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [phase, rollCount]);

  const handleRoll = useCallback(() => {
    setPhase("rolling");
    setWinner(null);
  }, []);

  const handleContinue = useCallback(() => {
    if (winner === "tie") {
      // Reroll on tie
      handleRoll();
    } else if (winner) {
      onComplete(winner === "player");
    }
  }, [winner, onComplete, handleRoll]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-sm">
      <div className="relative max-w-lg w-full mx-4 p-8 rounded-2xl border border-primary/30 bg-card/95 shadow-[0_0_60px_-10px_hsl(45_93%_54%_/_0.3)]">
        {/* Decorative corners */}
        <div className="absolute top-2 left-2 w-8 h-8 border-l-2 border-t-2 border-primary/40 rounded-tl-lg" />
        <div className="absolute top-2 right-2 w-8 h-8 border-r-2 border-t-2 border-primary/40 rounded-tr-lg" />
        <div className="absolute bottom-2 left-2 w-8 h-8 border-l-2 border-b-2 border-primary/40 rounded-bl-lg" />
        <div className="absolute bottom-2 right-2 w-8 h-8 border-r-2 border-b-2 border-primary/40 rounded-br-lg" />

        <h2 className="text-center font-display text-2xl mb-2 text-primary">
          Roll to Start
        </h2>
        <p className="text-center text-muted-foreground text-sm mb-8">
          Highest total goes first
        </p>

        {/* Dice Display */}
        <div className="flex justify-between items-center mb-8">
          {/* Player Side */}
          <div className="text-center flex-1">
            <p className="text-sm font-medium text-primary mb-3">{playerName}</p>
            <div className="flex justify-center gap-2">
              <Die3D value={playerDice[0]} rolling={phase === "rolling"} color="gold" />
              <Die3D value={playerDice[1]} rolling={phase === "rolling"} color="gold" />
            </div>
            {phase === "result" && (
              <p className="mt-2 text-lg font-bold text-primary">
                {playerDice[0] + playerDice[1]}
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
                {opponentDice[0] + opponentDice[1]}
              </p>
            )}
          </div>
        </div>

        {/* Result Message */}
        {phase === "result" && winner && (
          <div className={cn(
            "text-center mb-6 py-3 px-4 rounded-lg",
            winner === "player" && "bg-green-500/20 text-green-400",
            winner === "opponent" && "bg-red-500/20 text-red-400",
            winner === "tie" && "bg-primary/20 text-primary"
          )}>
            {winner === "player" && `${playerName} rolled higher! You go first.`}
            {winner === "opponent" && `${opponentName} rolled higher! They go first.`}
            {winner === "tie" && "It's a tie! Roll again."}
          </div>
        )}

        {/* Action Button */}
        <div className="text-center">
          {phase === "waiting" && (
            <Button onClick={handleRoll} size="lg" className="gap-2">
              <Dice5 className="w-5 h-5" />
              Roll Dice
            </Button>
          )}
          
          {phase === "rolling" && (
            <Button disabled size="lg" className="gap-2">
              Rolling...
            </Button>
          )}
          
          {phase === "result" && (
            <Button onClick={handleContinue} size="lg">
              {winner === "tie" ? "Roll Again" : "Start Game"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
