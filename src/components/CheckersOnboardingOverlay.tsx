/**
 * Money's First-Game Checkers Tutorial Overlay.
 * Shows only on the user's very first AI Checkers game (localStorage).
 */
import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";

const STORAGE_KEY = "checkers-onboarding-done";

type Step = "SELECT_PIECE" | "MOVE_PIECE" | "AI_TURN" | "CAPTURE_TIP" | "DONE";

interface Props {
  currentPlayer: "gold" | "obsidian";
  isAiThinking: boolean;
  gameOver: boolean;
  selectedPiece: boolean;
  hasCaptures: boolean;
  moveCount: number;
}

const STEP_CONFIG: Record<Exclude<Step, "DONE">, {
  position: "bottom" | "top" | "center";
  arrowDirection: "down" | "up" | "none";
}> = {
  SELECT_PIECE: { position: "center", arrowDirection: "none" },
  MOVE_PIECE:   { position: "center", arrowDirection: "none" },
  AI_TURN:      { position: "top", arrowDirection: "up" },
  CAPTURE_TIP:  { position: "center", arrowDirection: "none" },
};

export default function CheckersOnboardingOverlay({ currentPlayer, isAiThinking, gameOver, selectedPiece, hasCaptures, moveCount }: Props) {
  const { t } = useTranslation();

  const [step, setStep] = useState<Step>(() => {
    try { return localStorage.getItem(STORAGE_KEY) ? "DONE" : "SELECT_PIECE"; } catch { return "DONE"; }
  });

  const [seenCaptureTip, setSeenCaptureTip] = useState(false);

  const dismiss = useCallback(() => {
    setStep("DONE");
    try { localStorage.setItem(STORAGE_KEY, "1"); } catch {}
  }, []);

  useEffect(() => {
    if (step === "DONE") return;
    if (gameOver) { dismiss(); return; }

    // Auto-dismiss after 2 full turns (4 moves total)
    if (moveCount >= 4) { dismiss(); return; }

    switch (step) {
      case "SELECT_PIECE":
        if (selectedPiece) setStep("MOVE_PIECE");
        if (isAiThinking) setStep("AI_TURN");
        break;

      case "MOVE_PIECE":
        if (isAiThinking || currentPlayer === "obsidian") setStep("AI_TURN");
        break;

      case "AI_TURN":
        if (currentPlayer === "gold" && !isAiThinking) {
          if (hasCaptures && !seenCaptureTip) {
            setStep("CAPTURE_TIP");
            setSeenCaptureTip(true);
          } else {
            setStep("SELECT_PIECE");
          }
        }
        break;

      case "CAPTURE_TIP":
        if (isAiThinking || currentPlayer === "obsidian") setStep("AI_TURN");
        if (selectedPiece) dismiss();
        break;
    }
  }, [step, currentPlayer, isAiThinking, gameOver, selectedPiece, hasCaptures, moveCount, seenCaptureTip, dismiss]);

  if (step === "DONE") return null;

  const messages: Record<Exclude<Step, "DONE">, string> = {
    SELECT_PIECE: t("tips.checkersSelectPiece", "Tap one of your gold pieces to select it! 👆"),
    MOVE_PIECE: t("tips.checkersMovePiece", "Now tap a highlighted square to move!"),
    AI_TURN: t("tips.checkersAITurn", "AI is making its move... 🤔"),
    CAPTURE_TIP: t("tips.checkersCaptureTip", "You must capture when possible! Tap the piece that can jump. ⚡"),
  };

  const shouldShow = (() => {
    switch (step) {
      case "SELECT_PIECE": return currentPlayer === "gold" && !isAiThinking && !selectedPiece;
      case "MOVE_PIECE": return currentPlayer === "gold" && !isAiThinking && selectedPiece;
      case "AI_TURN": return isAiThinking;
      case "CAPTURE_TIP": return currentPlayer === "gold" && !isAiThinking;
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
        <div className="relative bg-amber-50 rounded-2xl shadow-xl border border-amber-200/60 px-2.5 py-2 max-w-[260px] flex items-center gap-3">
          <button onClick={dismiss} className="absolute top-1.5 right-1.5 p-0.5 rounded-full text-amber-400 hover:text-amber-600 hover:bg-amber-100 transition-colors" aria-label="Close tutorial">
            <X size={14} />
          </button>
          <div className="flex-shrink-0 w-10 h-10 rounded-xl overflow-hidden bg-amber-100">
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
