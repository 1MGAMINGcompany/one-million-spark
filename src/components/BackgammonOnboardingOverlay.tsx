/**
 * Money's First-Game Backgammon Tutorial Overlay.
 * Shows only on the user's very first AI Backgammon game (localStorage).
 */
import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";

const STORAGE_KEY = "backgammon-onboarding-done";

type Step = "ROLL_DICE" | "SELECT_CHECKER" | "MOVE_TO" | "AI_TURN" | "DONE";

interface Props {
  currentPlayer: "player" | "ai";
  isThinking: boolean;
  gameOver: boolean;
  hasDice: boolean;
  hasSelectedPoint: boolean;
  hasRemainingMoves: boolean;
}

const STEP_CONFIG: Record<Exclude<Step, "DONE">, {
  position: "bottom" | "top" | "center";
  arrowDirection: "down" | "up" | "none";
}> = {
  ROLL_DICE:      { position: "bottom", arrowDirection: "down" },
  SELECT_CHECKER: { position: "center", arrowDirection: "none" },
  MOVE_TO:        { position: "center", arrowDirection: "none" },
  AI_TURN:        { position: "top", arrowDirection: "up" },
};

export default function BackgammonOnboardingOverlay({ currentPlayer, isThinking, gameOver, hasDice, hasSelectedPoint, hasRemainingMoves }: Props) {
  const { t } = useTranslation();

  const [step, setStep] = useState<Step>(() => {
    try { return localStorage.getItem(STORAGE_KEY) ? "DONE" : "ROLL_DICE"; } catch { return "DONE"; }
  });

  const [playerTurnsDone, setPlayerTurnsDone] = useState(0);

  const dismiss = useCallback(() => {
    setStep("DONE");
    try { localStorage.setItem(STORAGE_KEY, "1"); } catch {}
  }, []);

  useEffect(() => {
    if (step === "DONE") return;
    if (gameOver) { dismiss(); return; }

    // Auto-dismiss after first full player turn
    if (playerTurnsDone >= 1) { dismiss(); return; }

    switch (step) {
      case "ROLL_DICE":
        if (hasDice && currentPlayer === "player") setStep("SELECT_CHECKER");
        if (currentPlayer === "ai") setStep("AI_TURN");
        break;

      case "SELECT_CHECKER":
        if (hasSelectedPoint) setStep("MOVE_TO");
        if (currentPlayer === "ai") {
          setPlayerTurnsDone(prev => prev + 1);
          setStep("AI_TURN");
        }
        break;

      case "MOVE_TO":
        if (!hasSelectedPoint && !hasRemainingMoves && currentPlayer === "ai") {
          setPlayerTurnsDone(prev => prev + 1);
          setStep("AI_TURN");
        }
        if (!hasSelectedPoint && hasRemainingMoves) setStep("SELECT_CHECKER");
        break;

      case "AI_TURN":
        if (currentPlayer === "player" && !isThinking) {
          setStep("ROLL_DICE");
        }
        break;
    }
  }, [step, currentPlayer, isThinking, gameOver, hasDice, hasSelectedPoint, hasRemainingMoves, playerTurnsDone, dismiss]);

  if (step === "DONE") return null;

  const messages: Record<Exclude<Step, "DONE">, string> = {
    ROLL_DICE: t("tips.bgRollDice", "Tap 'Roll Dice' to start your turn! 🎲"),
    SELECT_CHECKER: t("tips.bgSelectChecker", "Tap a highlighted checker to move it! 👆"),
    MOVE_TO: t("tips.bgMoveTo", "Now tap a highlighted point to move there!"),
    AI_TURN: t("tips.bgAITurn", "AI is rolling and moving... 🤔"),
  };

  const shouldShow = (() => {
    switch (step) {
      case "ROLL_DICE": return currentPlayer === "player" && !hasDice && !isThinking;
      case "SELECT_CHECKER": return currentPlayer === "player" && hasDice && !hasSelectedPoint;
      case "MOVE_TO": return currentPlayer === "player" && hasSelectedPoint;
      case "AI_TURN": return isThinking || currentPlayer === "ai";
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
