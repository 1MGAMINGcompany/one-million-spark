/**
 * Money's First-Game Dominos Tutorial Overlay.
 * Shows only on the user's very first AI Dominos game (localStorage).
 */
import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";

const STORAGE_KEY = "dominos-onboarding-done";

type Step = "PLAY_TILE" | "MATCH_ENDS" | "DRAW_TIP" | "AI_TURN" | "DONE";

interface Props {
  isPlayerTurn: boolean;
  isThinking: boolean;
  gameOver: boolean;
  chainLength: number;
  hasLegalMoves: boolean;
  boneyardCount: number;
  playerTurnCount: number;
}

const STEP_CONFIG: Record<Exclude<Step, "DONE">, {
  position: "bottom" | "top" | "center";
  arrowDirection: "down" | "up" | "none";
}> = {
  PLAY_TILE:  { position: "bottom", arrowDirection: "down" },
  MATCH_ENDS: { position: "center", arrowDirection: "none" },
  DRAW_TIP:   { position: "bottom", arrowDirection: "down" },
  AI_TURN:    { position: "top", arrowDirection: "up" },
};

export default function DominosOnboardingOverlay({ isPlayerTurn, isThinking, gameOver, chainLength, hasLegalMoves, boneyardCount, playerTurnCount }: Props) {
  const { t } = useTranslation();

  const [step, setStep] = useState<Step>(() => {
    try { return localStorage.getItem(STORAGE_KEY) ? "DONE" : "PLAY_TILE"; } catch { return "DONE"; }
  });

  const [seenDrawTip, setSeenDrawTip] = useState(false);

  const dismiss = useCallback(() => {
    setStep("DONE");
    try { localStorage.setItem(STORAGE_KEY, "1"); } catch {}
  }, []);

  useEffect(() => {
    if (step === "DONE") return;
    if (gameOver) { dismiss(); return; }

    // Auto-dismiss after 2 player turns
    if (playerTurnCount >= 2) { dismiss(); return; }

    switch (step) {
      case "PLAY_TILE":
        if (isThinking || !isPlayerTurn) setStep("AI_TURN");
        if (chainLength > 0 && isPlayerTurn) setStep("MATCH_ENDS");
        break;

      case "MATCH_ENDS":
        if (isThinking || !isPlayerTurn) setStep("AI_TURN");
        if (isPlayerTurn && !hasLegalMoves && !seenDrawTip) {
          setStep("DRAW_TIP");
          setSeenDrawTip(true);
        }
        break;

      case "DRAW_TIP":
        if (isThinking || !isPlayerTurn) setStep("AI_TURN");
        if (hasLegalMoves) setStep("MATCH_ENDS");
        break;

      case "AI_TURN":
        if (isPlayerTurn && !isThinking) {
          if (chainLength === 0) {
            setStep("PLAY_TILE");
          } else if (!hasLegalMoves && !seenDrawTip) {
            setStep("DRAW_TIP");
            setSeenDrawTip(true);
          } else {
            setStep("MATCH_ENDS");
          }
        }
        break;
    }
  }, [step, isPlayerTurn, isThinking, gameOver, chainLength, hasLegalMoves, boneyardCount, playerTurnCount, seenDrawTip, dismiss]);

  if (step === "DONE") return null;

  const messages: Record<Exclude<Step, "DONE">, string> = {
    PLAY_TILE: t("tips.dominoPlayTile", "Tap a tile from your hand to play it! 🎯"),
    MATCH_ENDS: t("tips.dominoMatchEnds", "Match a tile to either end of the chain! 🔗"),
    DRAW_TIP: t("tips.dominoDrawTip", "No matching tiles? Draw from the boneyard! 📦"),
    AI_TURN: t("tips.dominoAITurn", "AI is choosing a tile... 🤔"),
  };

  const shouldShow = (() => {
    switch (step) {
      case "PLAY_TILE": return isPlayerTurn && !isThinking;
      case "MATCH_ENDS": return isPlayerTurn && !isThinking;
      case "DRAW_TIP": return isPlayerTurn && !isThinking && !hasLegalMoves;
      case "AI_TURN": return isThinking;
      default: return false;
    }
  })();

  if (!shouldShow) return null;

  const config = STEP_CONFIG[step];
  const message = messages[step];

  const positionClass =
    config.position === "bottom" ? "bottom-28 left-1/2 -translate-x-1/2" :
    config.position === "top" ? "top-28 left-1/2 -translate-x-1/2" :
    "top-1/3 left-1/2 -translate-x-1/2";

  return (
    <div className="fixed inset-0 z-[9998] pointer-events-none">
      <div className={`absolute ${positionClass} pointer-events-auto animate-in fade-in zoom-in-95 duration-300`}>
        {config.arrowDirection === "up" && (
          <div className="flex justify-center mb-[-1px]">
            <div className="w-0 h-0 border-l-[10px] border-r-[10px] border-b-[10px] border-l-transparent border-r-transparent border-b-amber-50" />
          </div>
        )}
        <div className="relative bg-amber-50 rounded-2xl shadow-xl border border-amber-200/60 px-3 py-3 max-w-[320px] flex items-center gap-3">
          <button onClick={dismiss} className="absolute top-1.5 right-1.5 p-0.5 rounded-full text-amber-400 hover:text-amber-600 hover:bg-amber-100 transition-colors" aria-label="Close tutorial">
            <X size={14} />
          </button>
          <div className="flex-shrink-0 w-14 h-14 rounded-xl overflow-hidden bg-amber-100">
            <img src="/images/monkey-idle.png" alt="Money" className="w-full h-full object-contain" />
          </div>
          <p className="text-sm font-medium text-amber-900 pr-4 leading-snug">{message}</p>
        </div>
        {config.arrowDirection === "down" && (
          <div className="flex justify-center mt-[-1px]">
            <div className="w-0 h-0 border-l-[10px] border-r-[10px] border-t-[10px] border-l-transparent border-r-transparent border-t-amber-50" />
          </div>
        )}
      </div>
    </div>
  );
}
