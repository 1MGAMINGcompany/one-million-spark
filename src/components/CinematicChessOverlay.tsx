/**
 * CinematicChessOverlay – orchestrates cinematic chess move animation.
 *
 * Attempts to render the 3D Three.js scene. If WebGL is unavailable,
 * canvas init fails, or the scene throws, falls back to the existing
 * lightweight 2D placeholder animation.
 *
 * pointer-events: none – never blocks interaction.
 */

import { useState, useEffect, memo, lazy, Suspense } from "react";
import type { CinematicEvent } from "@/lib/buildCinematicEvent";

// Lazy-load the 3D scene to keep the main bundle light
const CinematicChess3DScene = lazy(() => import("@/components/CinematicChess3DScene"));

interface Props {
  event: CinematicEvent;
  duration: number; // ms
  boardFlipped: boolean;
}

// ─── WebGL detection ──────────────────────────────────────────────────────────

function isWebGLAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(
      canvas.getContext("webgl2") ||
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl")
    );
  } catch {
    return false;
  }
}

// ─── 2D Fallback (original placeholder) ───────────────────────────────────────

function squareToGrid(sq: string, flipped: boolean): { col: number; row: number } {
  const file = sq.charCodeAt(0) - 97;
  const rank = parseInt(sq[1], 10) - 1;
  if (flipped) return { col: 7 - file, row: rank };
  return { col: file, row: 7 - rank };
}

const PIECE_EMOJI: Record<string, string> = {
  king: "♚", queen: "♛", rook: "♜", bishop: "♝", knight: "♞", pawn: "♟",
};

function Fallback2DOverlay({ event, duration, boardFlipped }: Props) {
  const [phase, setPhase] = useState<"enter" | "move" | "exit">("enter");

  const from = squareToGrid(event.from, boardFlipped);
  const to = squareToGrid(event.to, boardFlipped);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("move"), 100);
    const t2 = setTimeout(() => setPhase("exit"), duration - 300);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [duration]);

  const fromX = from.col * 12.5 + 6.25;
  const fromY = from.row * 12.5 + 6.25;
  const toX = to.col * 12.5 + 6.25;
  const toY = to.row * 12.5 + 6.25;
  const currentX = phase === "enter" ? fromX : toX;
  const currentY = phase === "enter" ? fromY : toY;

  return (
    <div
      className="absolute inset-0 pointer-events-none z-40 overflow-hidden rounded-lg"
      style={{ opacity: phase === "exit" ? 0 : 1, transition: `opacity ${phase === "exit" ? 300 : 150}ms ease-out` }}
    >
      <div className="absolute inset-0" style={{
        background: "radial-gradient(ellipse at center, transparent 40%, hsl(0 0% 0% / 0.25) 100%)",
        opacity: phase === "enter" ? 0 : 0.6, transition: "opacity 300ms ease-out",
      }} />
      <div className="absolute rounded-sm" style={{
        left: `${from.col * 12.5}%`, top: `${from.row * 12.5}%`, width: "12.5%", height: "12.5%",
        background: "hsl(45 93% 54% / 0.25)", boxShadow: "inset 0 0 12px hsl(45 93% 54% / 0.4)",
        opacity: phase === "exit" ? 0 : 0.8, transition: "opacity 200ms ease-out",
      }} />
      <div className="absolute rounded-sm" style={{
        left: `${to.col * 12.5}%`, top: `${to.row * 12.5}%`, width: "12.5%", height: "12.5%",
        background: event.isCapture ? "hsl(0 70% 50% / 0.3)" : "hsl(45 93% 54% / 0.35)",
        boxShadow: event.isCapture ? "inset 0 0 16px hsl(0 70% 50% / 0.5)" : "inset 0 0 12px hsl(45 93% 54% / 0.5)",
        opacity: phase === "enter" ? 0 : 0.9, transition: "opacity 200ms ease-out",
      }} />
      <div className="absolute flex items-center justify-center" style={{
        left: `${currentX}%`, top: `${currentY}%`,
        transform: `translate(-50%, -50%) scale(${phase === "enter" ? 1.3 : phase === "move" ? 1 : 0.8})`,
        transition: `left ${duration * 0.5}ms cubic-bezier(0.25,0.46,0.45,0.94), top ${duration * 0.5}ms cubic-bezier(0.25,0.46,0.45,0.94), transform 300ms ease-out, opacity 200ms ease-out`,
        opacity: phase === "exit" ? 0 : 1,
        filter: `drop-shadow(0 0 ${event.isMate ? "20px" : "10px"} hsl(45 93% 54% / ${event.isMate ? "0.8" : "0.5"}))`,
      }}>
        <span className="text-3xl sm:text-4xl select-none" style={{
          color: event.color === "white" ? "hsl(45, 93%, 80%)" : "hsl(220, 20%, 25%)",
          textShadow: event.color === "white" ? "0 2px 8px hsl(45 93% 54% / 0.6)" : "0 2px 8px hsl(0 0% 0% / 0.6)",
        }}>
          {PIECE_EMOJI[event.piece] ?? "♟"}
        </span>
      </div>
      {event.isCapture && phase === "move" && (
        <div className="absolute rounded-full animate-ping" style={{
          left: `${toX}%`, top: `${toY}%`, transform: "translate(-50%, -50%)",
          width: "8%", height: "8%", background: "hsl(0 70% 50% / 0.3)",
          animationDuration: "600ms", animationIterationCount: "1",
        }} />
      )}
      {event.isMate && phase === "move" && (
        <div className="absolute inset-0" style={{
          background: "hsl(45 93% 54% / 0.15)", animation: "pulse 800ms ease-out 1",
        }} />
      )}
      <div className="absolute bottom-2 right-2 px-2 py-1 rounded bg-black/60 backdrop-blur-sm" style={{
        opacity: phase === "exit" ? 0 : 0.9, transition: "opacity 200ms ease-out",
      }}>
        <span className="text-xs font-mono text-primary font-bold">{event.san}</span>
      </div>
    </div>
  );
}

// ─── Main Orchestrator ────────────────────────────────────────────────────────

function CinematicChessOverlayInner({ event, duration, boardFlipped }: Props) {
  const [use3D, setUse3D] = useState(() => isWebGLAvailable());
  const [threed_done, setThreedDone] = useState(false);

  // If 3D completed or errored, we're done — parent will unmount us via activeEvent → null
  if (threed_done) return null;

  if (!use3D) {
    return <Fallback2DOverlay event={event} duration={duration} boardFlipped={boardFlipped} />;
  }

  return (
    <Suspense fallback={<Fallback2DOverlay event={event} duration={duration} boardFlipped={boardFlipped} />}>
      <ErrorBoundary3D fallback={<Fallback2DOverlay event={event} duration={duration} boardFlipped={boardFlipped} />}>
        <CinematicChess3DScene
          event={event}
          duration={duration}
          boardFlipped={boardFlipped}
          onComplete={() => setThreedDone(true)}
          onError={() => setUse3D(false)}
        />
      </ErrorBoundary3D>
    </Suspense>
  );
}

// ─── Error Boundary ───────────────────────────────────────────────────────────

import { Component, type ReactNode, type ErrorInfo } from "react";

class ErrorBoundary3D extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // Fail silently — 3D is decorative only
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

// ─── Exported wrapper ─────────────────────────────────────────────────────────

function CinematicChessOverlay(props: Props) {
  try {
    return <CinematicChessOverlayInner {...props} />;
  } catch {
    return null;
  }
}

export default memo(CinematicChessOverlay);
