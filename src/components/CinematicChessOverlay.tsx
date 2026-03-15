/**
 * CinematicChessOverlay – orchestrates cinematic chess move animation.
 *
 * Supports persistent mode: the 3D scene stays mounted across multiple
 * moves and only swoop-outs when isDismissing=true.
 *
 * pointer-events: none – never blocks interaction.
 */

import { useState, useEffect, useMemo, memo, lazy, Suspense, Component, type ReactNode, type ErrorInfo } from "react";
import type { CinematicEvent } from "@/lib/buildCinematicEvent";
import type { CinematicTier } from "@/hooks/useCinematicMode";
import { getCinematicPhrase } from "@/lib/cinematicPhrases";
import { supabase } from "@/integrations/supabase/client";

const CinematicChess3DScene = lazy(() => import("@/components/CinematicChess3DScene"));
const _preload = import("@/components/CinematicChess3DScene");

interface Props {
  event: CinematicEvent;
  duration: number;
  boardFlipped: boolean;
  tier?: CinematicTier;
  isDismissing?: boolean;
  onDismissComplete?: () => void;
  /** Whether this is the very first event (triggers swoop-in) */
  isFirstEntry?: boolean;
  /** Chess skin ID for themed rendering */
  skinId?: string;
}

// ─── 2D Fallback ──────────────────────────────────────────────────────────────

function squareToGrid(sq: string, flipped: boolean) {
  const file = sq.charCodeAt(0) - 97;
  const rank = parseInt(sq[1], 10) - 1;
  return flipped ? { col: 7 - file, row: rank } : { col: file, row: 7 - rank };
}

const PIECE_EMOJI: Record<string, string> = { king:"♚", queen:"♛", rook:"♜", bishop:"♝", knight:"♞", pawn:"♟" };

function Fallback2DOverlay({ event, duration, boardFlipped }: Props) {
  const [phase, setPhase] = useState<"enter"|"move"|"exit">("enter");
  const from = squareToGrid(event.from, boardFlipped);
  const to = squareToGrid(event.to, boardFlipped);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("move"), 100);
    const t2 = setTimeout(() => setPhase("exit"), duration - 300);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [duration]);

  const fromX = from.col * 12.5 + 6.25, fromY = from.row * 12.5 + 6.25;
  const toX = to.col * 12.5 + 6.25, toY = to.row * 12.5 + 6.25;
  const currentX = phase === "enter" ? fromX : toX;
  const currentY = phase === "enter" ? fromY : toY;

  return (
    <div className="absolute inset-0 pointer-events-none z-40 overflow-hidden rounded-lg"
      style={{ opacity: phase === "exit" ? 0 : 1, transition: `opacity ${phase === "exit" ? 300 : 150}ms ease-out` }}>
      <div className="absolute inset-0" style={{
        background: "radial-gradient(ellipse at center, transparent 40%, hsl(0 0% 0% / 0.25) 100%)",
        opacity: phase === "enter" ? 0 : 0.6, transition: "opacity 300ms ease-out",
      }}/>
      <div className="absolute rounded-sm" style={{
        left: `${from.col*12.5}%`, top: `${from.row*12.5}%`, width:"12.5%", height:"12.5%",
        background:"hsl(45 93% 54% / 0.25)", boxShadow:"inset 0 0 12px hsl(45 93% 54% / 0.4)",
        opacity: phase === "exit" ? 0 : 0.8, transition:"opacity 200ms ease-out",
      }}/>
      <div className="absolute rounded-sm" style={{
        left:`${to.col*12.5}%`, top:`${to.row*12.5}%`, width:"12.5%", height:"12.5%",
        background: event.isCapture ? "hsl(0 70% 50% / 0.3)" : "hsl(45 93% 54% / 0.35)",
        boxShadow: event.isCapture ? "inset 0 0 16px hsl(0 70% 50% / 0.5)" : "inset 0 0 12px hsl(45 93% 54% / 0.5)",
        opacity: phase === "enter" ? 0 : 0.9, transition:"opacity 200ms ease-out",
      }}/>
      <div className="absolute flex items-center justify-center" style={{
        left:`${currentX}%`, top:`${currentY}%`,
        transform:`translate(-50%,-50%) scale(${phase==="enter"?1.3:phase==="move"?1:0.8})`,
        transition:`left ${duration*0.5}ms cubic-bezier(0.25,0.46,0.45,0.94), top ${duration*0.5}ms cubic-bezier(0.25,0.46,0.45,0.94), transform 300ms ease-out, opacity 200ms ease-out`,
        opacity: phase === "exit" ? 0 : 1,
        filter:`drop-shadow(0 0 ${event.isMate?"20px":"10px"} hsl(45 93% 54% / ${event.isMate?"0.8":"0.5"}))`,
      }}>
        <span className="text-3xl sm:text-4xl select-none" style={{
          color: event.color === "white" ? "hsl(45,93%,80%)" : "hsl(220,20%,25%)",
          textShadow: event.color === "white" ? "0 2px 8px hsl(45 93% 54% / 0.6)" : "0 2px 8px hsl(0 0% 0% / 0.6)",
        }}>
          {PIECE_EMOJI[event.piece] ?? "♟"}
        </span>
      </div>
      {event.isCapture && phase === "move" && (
        <div className="absolute rounded-full animate-ping" style={{
          left:`${toX}%`, top:`${toY}%`, transform:"translate(-50%,-50%)",
          width:"8%", height:"8%", background:"hsl(0 70% 50% / 0.3)",
          animationDuration:"600ms", animationIterationCount:"1",
        }}/>
      )}
      {event.isMate && phase === "move" && (
        <div className="absolute inset-0" style={{ background:"hsl(45 93% 54% / 0.15)", animation:"pulse 800ms ease-out 1" }}/>
      )}
      <div className="absolute bottom-2 right-2 px-2 py-1 rounded bg-black/60 backdrop-blur-sm"
        style={{ opacity: phase === "exit" ? 0 : 0.9, transition:"opacity 200ms ease-out" }}>
        <span className="text-xs font-mono text-primary font-bold">{event.san}</span>
      </div>
    </div>
  );
}

// ─── Error Boundary ───────────────────────────────────────────────────────────

class ErrorBoundary3D extends Component<{ children: ReactNode; fallback: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(_e: Error, _i: ErrorInfo) { /* silent */ }
  render() { return this.state.hasError ? this.props.fallback : this.props.children; }
}

// ─── Phrase Bubble ────────────────────────────────────────────────────────────

function PhraseBubble({ phrase, duration }: { phrase: string; duration: number }) {
  const [visible, setVisible] = useState(false);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const showTimer = setTimeout(() => setVisible(true), 200);
    const fadeTimer = setTimeout(() => setFading(true), duration - 400);
    return () => { clearTimeout(showTimer); clearTimeout(fadeTimer); };
  }, [duration]);

  if (!visible) return null;

  return (
    <div
      className="absolute top-3 left-1/2 -translate-x-1/2 z-50 pointer-events-none"
      style={{
        opacity: fading ? 0 : 1,
        transform: `translateX(-50%) translateY(${fading ? "-8px" : "0"})`,
        transition: "opacity 300ms ease-out, transform 300ms ease-out",
      }}
    >
      <div className="px-3 py-1.5 rounded-full bg-black/70 backdrop-blur-sm border border-primary/30 shadow-[0_0_12px_-4px_hsl(45_93%_54%_/_0.4)]">
        <span className="text-xs font-medium text-primary whitespace-nowrap">
          {phrase}
        </span>
      </div>
    </div>
  );
}

// ─── Analytics ────────────────────────────────────────────────────────────────

function logPhraseShown(tier: CinematicTier) {
  try {
    const sessionId = typeof sessionStorage !== "undefined"
      ? (sessionStorage.getItem("1mg_session_id") || "unknown")
      : "unknown";
    supabase.from("monkey_analytics").insert({
      session_id: sessionId,
      event: "cinematic_phrase_shown",
      context: "chess",
      metadata: tier,
    }).then();
  } catch { /* silent */ }
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

function CinematicChessOverlayInner({
  event, duration, boardFlipped, tier = "2d-fallback",
  isDismissing = false, onDismissComplete, isFirstEntry = true, skinId,
}: Props) {
  const [use3D, setUse3D] = useState(tier === "3d-full" || tier === "3d-lite");
  const [done, setDone] = useState(false);

  const phrase = useMemo(() => getCinematicPhrase(event), [event]);

  useEffect(() => {
    if (phrase) logPhraseShown(tier);
  }, [phrase, tier]);

  if (done) return null;

  const phraseBubble = phrase ? <PhraseBubble phrase={phrase} duration={duration} /> : null;

  const fallback = (
    <>
      <Fallback2DOverlay event={event} duration={duration} boardFlipped={boardFlipped} />
      {phraseBubble}
    </>
  );

  if (!use3D || tier === "2d-fallback") return fallback;

  return (
    <>
      <Suspense fallback={null}>
        <ErrorBoundary3D fallback={fallback}>
          <CinematicChess3DScene
            event={event}
            duration={duration}
            boardFlipped={boardFlipped}
            tier={tier}
            isFirstEntry={isFirstEntry}
            isDismissing={isDismissing}
            skinId={skinId}
            onComplete={() => {
              setDone(true);
              onDismissComplete?.();
            }}
            onMoveComplete={() => {
              // Move animation done — scene stays mounted in persistent mode
            }}
            onError={() => setUse3D(false)}
          />
        </ErrorBoundary3D>
      </Suspense>
      {phraseBubble}
    </>
  );
}

function CinematicChessOverlay(props: Props) {
  try { return <CinematicChessOverlayInner {...props} />; }
  catch { return null; }
}

export default memo(CinematicChessOverlay);
