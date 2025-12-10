import { useState, useEffect, useCallback } from "react";
import { Square, PieceSymbol } from "chess.js";

export type CaptureAnimationType = "default" | "knight" | "king";

export interface CaptureAnimation {
  id: string;
  square: Square;
  type: CaptureAnimationType;
  timestamp: number;
}

interface CaptureAnimationLayerProps {
  animations: CaptureAnimation[];
  onAnimationComplete: (id: string) => void;
  squareSize: number;
  enabled: boolean;
}

const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
const ranks = ["8", "7", "6", "5", "4", "3", "2", "1"];

const getSquarePosition = (square: Square) => {
  const file = square[0];
  const rank = square[1];
  const col = files.indexOf(file);
  const row = ranks.indexOf(rank);
  return { col, row };
};

// Default capture: Sword slash + gold dust
const DefaultCaptureAnimation = ({ onComplete }: { onComplete: () => void }) => {
  useEffect(() => {
    const timer = setTimeout(onComplete, 400);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* Sword slash */}
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs>
          <linearGradient id="slashGradient" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="hsl(45 93% 70%)" stopOpacity="0" />
            <stop offset="20%" stopColor="hsl(45 93% 80%)" stopOpacity="1" />
            <stop offset="50%" stopColor="hsl(45 93% 70%)" stopOpacity="1" />
            <stop offset="80%" stopColor="hsl(45 93% 60%)" stopOpacity="1" />
            <stop offset="100%" stopColor="hsl(45 93% 50%)" stopOpacity="0" />
          </linearGradient>
          <filter id="slashGlow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <line
          x1="0"
          y1="100"
          x2="100"
          y2="0"
          stroke="url(#slashGradient)"
          strokeWidth="6"
          strokeLinecap="round"
          filter="url(#slashGlow)"
          style={{
            strokeDasharray: 150,
            strokeDashoffset: 150,
            animation: "slashDraw 0.15s ease-out forwards",
          }}
        />
      </svg>

      {/* Gold dust burst */}
      <div className="absolute inset-0 flex items-center justify-center">
        {Array.from({ length: 12 }).map((_, i) => {
          const angle = (i / 12) * 360;
          return (
            <div
              key={i}
              className="absolute w-2 h-2 rounded-full"
              style={{
                background: `radial-gradient(circle, hsl(45 93% 75%), hsl(45 93% 54%))`,
                boxShadow: "0 0 6px hsl(45 93% 54% / 0.8)",
                animation: `dustBurst 0.35s ease-out ${80 + i * 10}ms forwards`,
                opacity: 0,
                ["--burst-angle" as string]: `${angle}deg`,
              }}
            />
          );
        })}
      </div>
    </div>
  );
};

// Knight capture: Bite effect + gold dust
const KnightCaptureAnimation = ({ onComplete }: { onComplete: () => void }) => {
  useEffect(() => {
    const timer = setTimeout(onComplete, 400);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* Bite effect */}
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs>
          <linearGradient id="teethGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="hsl(45 93% 75%)" />
            <stop offset="100%" stopColor="hsl(45 93% 50%)" />
          </linearGradient>
          <filter id="teethGlow">
            <feGaussianBlur stdDeviation="1" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {/* Top teeth */}
        <path
          d="M5 -30 L5 15 L20 28 L35 15 L50 28 L65 15 L80 28 L95 15 L95 -30"
          fill="url(#teethGrad)"
          filter="url(#teethGlow)"
          style={{
            animation: "biteTop 0.2s ease-out forwards",
          }}
        />
        {/* Bottom teeth */}
        <path
          d="M5 130 L5 85 L20 72 L35 85 L50 72 L65 85 L80 72 L95 85 L95 130"
          fill="url(#teethGrad)"
          filter="url(#teethGlow)"
          style={{
            animation: "biteBottom 0.2s ease-out forwards",
          }}
        />
      </svg>

      {/* Gold dust burst */}
      <div className="absolute inset-0 flex items-center justify-center">
        {Array.from({ length: 8 }).map((_, i) => {
          const angle = (i / 8) * 360;
          return (
            <div
              key={i}
              className="absolute w-1.5 h-1.5 rounded-full"
              style={{
                background: `radial-gradient(circle, hsl(45 93% 75%), hsl(45 93% 54%))`,
                boxShadow: "0 0 4px hsl(45 93% 54% / 0.7)",
                animation: `dustBurst 0.3s ease-out ${120 + i * 12}ms forwards`,
                opacity: 0,
                ["--burst-angle" as string]: `${angle}deg`,
              }}
            />
          );
        })}
      </div>
    </div>
  );
};

// King capture: Dramatic gold explosion with shockwave
const KingCaptureAnimation = ({ onComplete }: { onComplete: () => void }) => {
  useEffect(() => {
    const timer = setTimeout(onComplete, 650);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* Central flash */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div 
          className="w-6 h-6 rounded-full"
          style={{
            background: "radial-gradient(circle, hsl(45 93% 80%), hsl(45 93% 54%))",
            boxShadow: "0 0 20px hsl(45 93% 54%), 0 0 40px hsl(45 93% 54% / 0.6)",
            animation: "flashPulse 0.35s ease-out forwards",
          }}
        />
      </div>

      {/* Shockwave rings */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div 
          className="w-4 h-4 rounded-full border-2"
          style={{
            borderColor: "hsl(45 93% 54%)",
            boxShadow: "0 0 8px hsl(45 93% 54% / 0.8)",
            animation: "shockwave 0.5s ease-out forwards",
          }}
        />
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div 
          className="w-4 h-4 rounded-full border"
          style={{
            borderColor: "hsl(45 93% 54% / 0.6)",
            animation: "shockwave 0.5s ease-out 0.08s forwards",
          }}
        />
      </div>

      {/* Large gold dust explosion */}
      <div className="absolute inset-0 flex items-center justify-center">
        {Array.from({ length: 16 }).map((_, i) => {
          const angle = (i / 16) * 360;
          const size = i % 2 === 0 ? 2.5 : 2;
          return (
            <div
              key={i}
              className="absolute rounded-full"
              style={{
                width: `${size * 4}px`,
                height: `${size * 4}px`,
                background: `radial-gradient(circle, hsl(45 93% 80%), hsl(45 93% 54%))`,
                boxShadow: "0 0 8px hsl(45 93% 54% / 0.9)",
                animation: `kingDustBurst 0.55s ease-out ${30 + i * 12}ms forwards`,
                opacity: 0,
                ["--burst-angle" as string]: `${angle}deg`,
                ["--burst-distance" as string]: `${55 + (i % 3) * 12}px`,
              }}
            />
          );
        })}
      </div>
    </div>
  );
};

export function CaptureAnimationLayer({ 
  animations, 
  onAnimationComplete,
  squareSize,
  enabled
}: CaptureAnimationLayerProps) {
  if (!enabled || animations.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none z-20">
      {animations.map((animation) => {
        const { col, row } = getSquarePosition(animation.square);
        const left = col * squareSize;
        const top = row * squareSize;

        return (
          <div
            key={animation.id}
            className="absolute"
            style={{
              left: `${left}px`,
              top: `${top}px`,
              width: `${squareSize}px`,
              height: `${squareSize}px`,
            }}
          >
            {animation.type === "default" && (
              <DefaultCaptureAnimation onComplete={() => onAnimationComplete(animation.id)} />
            )}
            {animation.type === "knight" && (
              <KnightCaptureAnimation onComplete={() => onAnimationComplete(animation.id)} />
            )}
            {animation.type === "king" && (
              <KingCaptureAnimation onComplete={() => onAnimationComplete(animation.id)} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// Helper function to determine animation type based on attacker and captured piece
export function getCaptureAnimationType(
  attackerPiece: PieceSymbol,
  capturedPiece: PieceSymbol
): CaptureAnimationType {
  if (capturedPiece === "k") {
    return "king";
  }
  if (attackerPiece === "n") {
    return "knight";
  }
  return "default";
}

// Hook to manage capture animations
export function useCaptureAnimations(enabled: boolean) {
  const [animations, setAnimations] = useState<CaptureAnimation[]>([]);

  const triggerAnimation = useCallback((
    attackerPiece: PieceSymbol,
    capturedPiece: PieceSymbol,
    targetSquare: Square
  ) => {
    if (!enabled) return;
    
    const animationType = getCaptureAnimationType(attackerPiece, capturedPiece);
    const newAnimation: CaptureAnimation = {
      id: `${targetSquare}-${Date.now()}-${Math.random()}`,
      square: targetSquare,
      type: animationType,
      timestamp: Date.now(),
    };
    
    // Limit to max 2 concurrent animations
    setAnimations(prev => {
      const limited = prev.slice(-1);
      return [...limited, newAnimation];
    });
  }, [enabled]);

  const handleAnimationComplete = useCallback((id: string) => {
    setAnimations(prev => prev.filter(a => a.id !== id));
  }, []);

  return {
    animations,
    triggerAnimation,
    handleAnimationComplete,
  };
}
