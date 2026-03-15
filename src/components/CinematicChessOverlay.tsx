/**
 * CinematicChessOverlay – lightweight proof-of-concept overlay.
 *
 * Renders an absolute overlay above the chess board that briefly animates
 * a highlighted piece marker from source square to destination square with
 * a cinematic fade / zoom effect. Auto-dismisses after `duration` ms.
 *
 * pointer-events: none – never blocks interaction.
 * Wrapped in an ErrorBoundary-style try/catch render – fails silently.
 */

import { useEffect, useState, memo } from "react";
import type { CinematicEvent } from "@/lib/buildCinematicEvent";

interface Props {
  event: CinematicEvent;
  duration: number; // ms
  boardFlipped: boolean;
}

// Map algebraic square to grid position (0-7, 0-7)
function squareToGrid(sq: string, flipped: boolean): { col: number; row: number } {
  const file = sq.charCodeAt(0) - 97; // a=0 … h=7
  const rank = parseInt(sq[1], 10) - 1; // 1=0 … 8=7
  if (flipped) {
    return { col: 7 - file, row: rank };
  }
  return { col: file, row: 7 - rank };
}

// Piece emoji for the marker
const PIECE_EMOJI: Record<string, string> = {
  king: "♚",
  queen: "♛",
  rook: "♜",
  bishop: "♝",
  knight: "♞",
  pawn: "♟",
};

function CinematicChessOverlayInner({ event, duration, boardFlipped }: Props) {
  const [phase, setPhase] = useState<"enter" | "move" | "exit">("enter");

  const from = squareToGrid(event.from, boardFlipped);
  const to = squareToGrid(event.to, boardFlipped);

  useEffect(() => {
    // enter → move → exit
    const t1 = setTimeout(() => setPhase("move"), 100);
    const t2 = setTimeout(() => setPhase("exit"), duration - 300);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [duration]);

  // Percent positions (each square = 12.5%)
  const fromX = from.col * 12.5 + 6.25;
  const fromY = from.row * 12.5 + 6.25;
  const toX = to.col * 12.5 + 6.25;
  const toY = to.row * 12.5 + 6.25;

  const currentX = phase === "enter" ? fromX : toX;
  const currentY = phase === "enter" ? fromY : toY;

  const isCapture = event.isCapture;
  const isMate = event.isMate;

  return (
    <div
      className="absolute inset-0 pointer-events-none z-40 overflow-hidden rounded-lg"
      style={{
        opacity: phase === "exit" ? 0 : 1,
        transition: `opacity ${phase === "exit" ? 300 : 150}ms ease-out`,
      }}
    >
      {/* Subtle vignette overlay */}
      <div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(ellipse at center, transparent 40%, hsl(0 0% 0% / 0.25) 100%)",
          opacity: phase === "enter" ? 0 : 0.6,
          transition: "opacity 300ms ease-out",
        }}
      />

      {/* Source square highlight */}
      <div
        className="absolute rounded-sm"
        style={{
          left: `${from.col * 12.5}%`,
          top: `${from.row * 12.5}%`,
          width: "12.5%",
          height: "12.5%",
          background: "hsl(45 93% 54% / 0.25)",
          boxShadow: "inset 0 0 12px hsl(45 93% 54% / 0.4)",
          opacity: phase === "exit" ? 0 : 0.8,
          transition: "opacity 200ms ease-out",
        }}
      />

      {/* Destination square highlight */}
      <div
        className="absolute rounded-sm"
        style={{
          left: `${to.col * 12.5}%`,
          top: `${to.row * 12.5}%`,
          width: "12.5%",
          height: "12.5%",
          background: isCapture
            ? "hsl(0 70% 50% / 0.3)"
            : "hsl(45 93% 54% / 0.35)",
          boxShadow: isCapture
            ? "inset 0 0 16px hsl(0 70% 50% / 0.5)"
            : "inset 0 0 12px hsl(45 93% 54% / 0.5)",
          opacity: phase === "enter" ? 0 : 0.9,
          transition: "opacity 200ms ease-out",
        }}
      />

      {/* Animated piece marker */}
      <div
        className="absolute flex items-center justify-center"
        style={{
          left: `${currentX}%`,
          top: `${currentY}%`,
          transform: `translate(-50%, -50%) scale(${phase === "enter" ? 1.3 : phase === "move" ? 1 : 0.8})`,
          transition: `left ${duration * 0.5}ms cubic-bezier(0.25, 0.46, 0.45, 0.94), 
                       top ${duration * 0.5}ms cubic-bezier(0.25, 0.46, 0.45, 0.94),
                       transform 300ms ease-out,
                       opacity 200ms ease-out`,
          opacity: phase === "exit" ? 0 : 1,
          filter: `drop-shadow(0 0 ${isMate ? "20px" : "10px"} hsl(45 93% 54% / ${isMate ? "0.8" : "0.5"}))`,
        }}
      >
        <span
          className="text-3xl sm:text-4xl select-none"
          style={{
            color: event.color === "white" ? "hsl(45 93% 80%)" : "hsl(220 20% 25%)",
            textShadow: event.color === "white"
              ? "0 2px 8px hsl(45 93% 54% / 0.6)"
              : "0 2px 8px hsl(0 0% 0% / 0.6)",
          }}
        >
          {PIECE_EMOJI[event.piece] ?? "♟"}
        </span>
      </div>

      {/* Capture burst */}
      {isCapture && phase === "move" && (
        <div
          className="absolute rounded-full animate-ping"
          style={{
            left: `${toX}%`,
            top: `${toY}%`,
            transform: "translate(-50%, -50%)",
            width: "8%",
            height: "8%",
            background: "hsl(0 70% 50% / 0.3)",
            animationDuration: "600ms",
            animationIterationCount: "1",
          }}
        />
      )}

      {/* Checkmate flash */}
      {isMate && phase === "move" && (
        <div
          className="absolute inset-0"
          style={{
            background: "hsl(45 93% 54% / 0.15)",
            animation: "pulse 800ms ease-out 1",
          }}
        />
      )}

      {/* SAN label */}
      <div
        className="absolute bottom-2 right-2 px-2 py-1 rounded bg-black/60 backdrop-blur-sm"
        style={{
          opacity: phase === "exit" ? 0 : 0.9,
          transition: "opacity 200ms ease-out",
        }}
      >
        <span className="text-xs font-mono text-primary font-bold">
          {event.san}
        </span>
      </div>
    </div>
  );
}

/**
 * Error-safe wrapper – if anything throws, renders nothing.
 */
function CinematicChessOverlay(props: Props) {
  try {
    return <CinematicChessOverlayInner {...props} />;
  } catch {
    return null;
  }
}

export default memo(CinematicChessOverlay);
