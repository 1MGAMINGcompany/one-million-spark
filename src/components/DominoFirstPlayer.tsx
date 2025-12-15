import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import DominoTile3D from "@/components/DominoTile3D";
import { useSound } from "@/contexts/SoundContext";

interface DominoFirstPlayerProps {
  onComplete: (playerStarts: boolean, startingTile: [number, number] | null) => void;
  playerName?: string;
  opponentName?: string;
  seed?: number; // Deterministic seed for tile shuffle
}

// All doubles in descending order
const DOUBLES: [number, number][] = [
  [6, 6], [5, 5], [4, 4], [3, 3], [2, 2], [1, 1], [0, 0]
];

// Deterministic shuffle using LCG (same as rules.json)
function lcgShuffle<T>(arr: T[], seed: number): T[] {
  const result = [...arr];
  let s = seed;
  const a = 1664525;
  const c = 1013904223;
  const m = 2147483648;
  
  for (let i = result.length - 1; i > 0; i--) {
    s = (a * s + c) % m;
    const j = s % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Generate player hands deterministically
function generateHands(seed: number): { playerHand: [number, number][], opponentHand: [number, number][] } {
  // Full double-six set
  const allTiles: [number, number][] = [];
  for (let i = 0; i <= 6; i++) {
    for (let j = i; j <= 6; j++) {
      allTiles.push([i, j]);
    }
  }
  
  const shuffled = lcgShuffle(allTiles, seed);
  return {
    playerHand: shuffled.slice(0, 7),
    opponentHand: shuffled.slice(7, 14)
  };
}

// Find highest double in hand
function findHighestDouble(hand: [number, number][]): [number, number] | null {
  for (const double of DOUBLES) {
    if (hand.some(tile => tile[0] === double[0] && tile[1] === double[1])) {
      return double;
    }
  }
  return null;
}

// Find highest pip count tile
function findHighestPipTile(hand: [number, number][]): [number, number] {
  let highest = hand[0];
  let highestSum = hand[0][0] + hand[0][1];
  
  for (const tile of hand) {
    const sum = tile[0] + tile[1];
    if (sum > highestSum) {
      highestSum = sum;
      highest = tile;
    }
  }
  return highest;
}

export function DominoFirstPlayer({ 
  onComplete, 
  playerName = "You", 
  opponentName = "Opponent",
  seed = Date.now()
}: DominoFirstPlayerProps) {
  const { play } = useSound();
  const [phase, setPhase] = useState<"intro" | "revealing" | "result">("intro");
  const [playerHand, setPlayerHand] = useState<[number, number][]>([]);
  const [opponentHand, setOpponentHand] = useState<[number, number][]>([]);
  const [playerDouble, setPlayerDouble] = useState<[number, number] | null>(null);
  const [opponentDouble, setOpponentDouble] = useState<[number, number] | null>(null);
  const [winner, setWinner] = useState<"player" | "opponent" | null>(null);
  const [winningTile, setWinningTile] = useState<[number, number] | null>(null);
  const [tiebreaker, setTiebreaker] = useState(false);

  useEffect(() => {
    // Generate hands from seed
    const { playerHand: ph, opponentHand: oh } = generateHands(seed);
    setPlayerHand(ph);
    setOpponentHand(oh);
  }, [seed]);

  const handleReveal = () => {
    play("domino_shuffle");
    setPhase("revealing");

    // Find doubles
    const pDouble = findHighestDouble(playerHand);
    const oDouble = findHighestDouble(opponentHand);

    setTimeout(() => {
      setPlayerDouble(pDouble);
      setOpponentDouble(oDouble);
      play("domino_place");

      setTimeout(() => {
        // Determine winner
        let result: "player" | "opponent";
        let tile: [number, number];
        let usedTiebreaker = false;

        if (pDouble && oDouble) {
          // Both have doubles - higher wins
          if (pDouble[0] > oDouble[0]) {
            result = "player";
            tile = pDouble;
          } else if (oDouble[0] > pDouble[0]) {
            result = "opponent";
            tile = oDouble;
          } else {
            // Same double (shouldn't happen with proper shuffle)
            result = "player";
            tile = pDouble;
          }
        } else if (pDouble && !oDouble) {
          // Only player has double
          result = "player";
          tile = pDouble;
        } else if (!pDouble && oDouble) {
          // Only opponent has double
          result = "opponent";
          tile = oDouble;
        } else {
          // Neither has double - use highest pip count
          usedTiebreaker = true;
          const pHighest = findHighestPipTile(playerHand);
          const oHighest = findHighestPipTile(opponentHand);
          const pSum = pHighest[0] + pHighest[1];
          const oSum = oHighest[0] + oHighest[1];
          
          if (pSum >= oSum) {
            result = "player";
            tile = pHighest;
          } else {
            result = "opponent";
            tile = oHighest;
          }
        }

        setWinner(result);
        setWinningTile(tile);
        setTiebreaker(usedTiebreaker);
        setPhase("result");
        play(result === "player" ? "chess_win" : "backgammon_move");
      }, 1500);
    }, 800);
  };

  const handleContinue = () => {
    onComplete(winner === "player", winningTile);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-primary/30 rounded-2xl p-8 max-w-lg w-full text-center space-y-6 shadow-2xl">
        <h2 className="text-2xl font-cinzel text-primary">
          {phase === "intro" && "Determine First Player"}
          {phase === "revealing" && "Checking Doubles..."}
          {phase === "result" && (winner === "player" ? `${playerName} Go First!` : `${opponentName} Goes First`)}
        </h2>

        <p className="text-muted-foreground text-sm">
          {phase === "intro" && "According to Dominos rules, the player with the highest double goes first."}
          {phase === "revealing" && "Revealing highest doubles from each hand..."}
          {phase === "result" && !tiebreaker && "Highest double determines the starting player."}
          {phase === "result" && tiebreaker && "No doubles found - highest pip count wins."}
        </p>

        {/* Display area */}
        <div className="flex justify-center gap-8 py-4">
          {/* Player's double */}
          <div className="text-center space-y-2">
            <p className="text-sm font-medium text-foreground">{playerName}</p>
            <div className={`transition-all duration-500 ${phase === "intro" ? "opacity-0 scale-75" : "opacity-100 scale-100"}`}>
              {playerDouble ? (
                <div className={`${winner === "player" ? "ring-2 ring-green-500 rounded-lg" : ""}`}>
                  <DominoTile3D left={playerDouble[0]} right={playerDouble[1]} isSelected={winner === "player"} />
                </div>
              ) : phase !== "intro" ? (
                <div className="w-16 h-32 flex items-center justify-center border-2 border-dashed border-muted-foreground/30 rounded-lg">
                  <span className="text-muted-foreground text-xs">No Double</span>
                </div>
              ) : null}
            </div>
          </div>

          {/* VS */}
          <div className="flex items-center">
            <span className="text-primary font-bold text-xl">VS</span>
          </div>

          {/* Opponent's double */}
          <div className="text-center space-y-2">
            <p className="text-sm font-medium text-foreground">{opponentName}</p>
            <div className={`transition-all duration-500 ${phase === "intro" ? "opacity-0 scale-75" : "opacity-100 scale-100"}`}>
              {opponentDouble ? (
                <div className={`${winner === "opponent" ? "ring-2 ring-green-500 rounded-lg" : ""}`}>
                  <DominoTile3D left={opponentDouble[0]} right={opponentDouble[1]} isSelected={winner === "opponent"} />
                </div>
              ) : phase !== "intro" ? (
                <div className="w-16 h-32 flex items-center justify-center border-2 border-dashed border-muted-foreground/30 rounded-lg">
                  <span className="text-muted-foreground text-xs">No Double</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* Result message */}
        {phase === "result" && winningTile && (
          <p className={`text-lg font-semibold ${winner === "player" ? "text-green-500" : "text-amber-500"}`}>
            {!tiebreaker 
              ? `[${winningTile[0]}|${winningTile[1]}] is the highest double!`
              : `[${winningTile[0]}|${winningTile[1]}] has the highest pip count!`
            }
          </p>
        )}

        {/* Action button */}
        {phase === "intro" && (
          <Button 
            onClick={handleReveal}
            className="w-full bg-gradient-to-r from-primary to-amber-600 hover:from-primary/90 hover:to-amber-600/90"
            size="lg"
          >
            Reveal Doubles
          </Button>
        )}

        {phase === "result" && (
          <Button 
            onClick={handleContinue}
            className="w-full"
            size="lg"
          >
            Continue to Game
          </Button>
        )}
      </div>
    </div>
  );
}
