import { useState, useEffect } from "react";
import { Square, PieceSymbol } from "chess.js";

// Configuration flag for disabling animations
export const CAPTURE_ANIMATIONS_ENABLED = true;

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
    const timer = setTimeout(onComplete, 500);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* Sword slash */}
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100">
        <defs>
          <linearGradient id="slashGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="hsl(45 93% 70%)" stopOpacity="0" />
            <stop offset="30%" stopColor="hsl(45 93% 70%)" stopOpacity="1" />
            <stop offset="70%" stopColor="hsl(45 93% 54%)" stopOpacity="1" />
            <stop offset="100%" stopColor="hsl(45 93% 40%)" stopOpacity="0" />
          </linearGradient>
          <filter id="slashBlur">
            <feGaussianBlur stdDeviation="1" />
          </filter>
        </defs>
        <line
          x1="-10"
          y1="110"
          x2="110"
          y2="-10"
          stroke="url(#slashGradient)"
          strokeWidth="4"
          strokeLinecap="round"
          filter="url(#slashBlur)"
          className="animate-[slashIn_0.2s_ease-out_forwards]"
        />
      </svg>

      {/* Gold dust burst */}
      <div className="absolute inset-0 flex items-center justify-center">
        {Array.from({ length: 10 }).map((_, i) => {
          const angle = (i / 10) * 360;
          const delay = 100 + i * 20;
          return (
            <div
              key={i}
              className="absolute w-1.5 h-1.5 rounded-full animate-[dustBurst_0.4s_ease-out_forwards]"
              style={{
                background: `linear-gradient(135deg, hsl(45 93% 65%), hsl(45 93% 54%))`,
                boxShadow: "0 0 4px hsl(45 93% 54% / 0.6)",
                animationDelay: `${delay}ms`,
                "--burst-angle": `${angle}deg`,
              } as React.CSSProperties}
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
    const timer = setTimeout(onComplete, 450);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* Bite effect - top jaw */}
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100">
        <defs>
          <linearGradient id="teethGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="hsl(45 93% 70%)" />
            <stop offset="100%" stopColor="hsl(45 93% 50%)" />
          </linearGradient>
        </defs>
        {/* Top teeth */}
        <path
          d="M10 -20 L10 20 L25 30 L40 20 L40 30 L55 20 L55 30 L70 20 L70 30 L85 20 L85 -20"
          fill="url(#teethGradient)"
          className="animate-[biteTop_0.2s_ease-out_forwards]"
        />
        {/* Bottom teeth */}
        <path
          d="M10 120 L10 80 L25 70 L40 80 L40 70 L55 80 L55 70 L70 80 L70 70 L85 80 L85 120"
          fill="url(#teethGradient)"
          className="animate-[biteBottom_0.2s_ease-out_forwards]"
        />
      </svg>

      {/* Gold dust burst (smaller) */}
      <div className="absolute inset-0 flex items-center justify-center">
        {Array.from({ length: 8 }).map((_, i) => {
          const angle = (i / 8) * 360;
          const delay = 150 + i * 15;
          return (
            <div
              key={i}
              className="absolute w-1 h-1 rounded-full animate-[dustBurst_0.3s_ease-out_forwards]"
              style={{
                background: `linear-gradient(135deg, hsl(45 93% 65%), hsl(45 93% 54%))`,
                boxShadow: "0 0 3px hsl(45 93% 54% / 0.5)",
                animationDelay: `${delay}ms`,
                "--burst-angle": `${angle}deg`,
              } as React.CSSProperties}
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
      {/* Shockwave ring */}
      <div 
        className="absolute inset-0 flex items-center justify-center"
      >
        <div 
          className="w-4 h-4 rounded-full border-2 border-primary animate-[shockwave_0.5s_ease-out_forwards]"
          style={{
            boxShadow: "0 0 8px hsl(45 93% 54% / 0.8), inset 0 0 4px hsl(45 93% 54% / 0.4)"
          }}
        />
      </div>

      {/* Secondary shockwave */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div 
          className="w-4 h-4 rounded-full border border-primary/60 animate-[shockwave_0.5s_ease-out_0.1s_forwards]"
        />
      </div>

      {/* Large gold dust explosion */}
      <div className="absolute inset-0 flex items-center justify-center">
        {Array.from({ length: 16 }).map((_, i) => {
          const angle = (i / 16) * 360;
          const delay = 50 + i * 15;
          const size = i % 2 === 0 ? 2 : 1.5;
          return (
            <div
              key={i}
              className="absolute rounded-full animate-[kingDustBurst_0.55s_ease-out_forwards]"
              style={{
                width: `${size * 4}px`,
                height: `${size * 4}px`,
                background: `radial-gradient(circle, hsl(45 93% 70%), hsl(45 93% 54%))`,
                boxShadow: "0 0 6px hsl(45 93% 54% / 0.8)",
                animationDelay: `${delay}ms`,
                "--burst-angle": `${angle}deg`,
                "--burst-distance": `${60 + (i % 3) * 15}px`,
              } as React.CSSProperties}
            />
          );
        })}
      </div>

      {/* Central flash */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div 
          className="w-8 h-8 rounded-full bg-primary/80 animate-[flashPulse_0.3s_ease-out_forwards]"
          style={{
            boxShadow: "0 0 20px hsl(45 93% 54%), 0 0 40px hsl(45 93% 54% / 0.5)"
          }}
        />
      </div>
    </div>
  );
};

export function CaptureAnimationLayer({ 
  animations, 
  onAnimationComplete,
  squareSize 
}: CaptureAnimationLayerProps) {
  if (!CAPTURE_ANIMATIONS_ENABLED) return null;

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
