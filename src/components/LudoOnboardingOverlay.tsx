/**
 * Money's First-Game Ludo Tutorial Overlay.
 * 
 * A contextual, multi-step onboarding featuring Money (the AI monkey)
 * in a floating speech-cloud bubble that points toward the relevant UI element.
 * Shows only on the user's very first AI Ludo game (localStorage).
 */
import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";

const STORAGE_KEY = "ludo-onboarding-done";

type TutorialStep =
  | "ROLL_DICE"        // Step 1: Press here to roll
  | "NEED_SIX"         // Step 2: You need a 6
  | "AI_TURN"          // Step 3: AI is playing
  | "ROLLED_SIX"       // Step 4: You rolled a 6, tap piece
  | "BONUS_ROLL"       // Step 5: You get to roll again
  | "DONE";            // Finished

interface Props {
  phase: string;
  isHumanTurn: boolean;
  hasMovableTokens: boolean;
  isGameOver: boolean;
  diceValue: number | null;
  currentPlayerIsAI: boolean;
}

// Position config per step
const STEP_CONFIG: Record<Exclude<TutorialStep, "DONE">, {
  position: "bottom" | "top" | "center";
  arrowDirection: "down" | "up" | "none";
}> = {
  ROLL_DICE:  { position: "bottom", arrowDirection: "down" },
  NEED_SIX:   { position: "center", arrowDirection: "none" },
  AI_TURN:    { position: "top", arrowDirection: "up" },
  ROLLED_SIX: { position: "center", arrowDirection: "down" },
  BONUS_ROLL: { position: "bottom", arrowDirection: "down" },
};

export default function LudoOnboardingOverlay({
  phase,
  isHumanTurn,
  hasMovableTokens,
  isGameOver,
  diceValue,
  currentPlayerIsAI,
}: Props) {
  const { t } = useTranslation();

  const [step, setStep] = useState<TutorialStep>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) ? "DONE" : "ROLL_DICE";
    } catch {
      return "DONE";
    }
  });

  // Track if user has moved after rolling a 6 (for bonus roll detection)
  const [movedWithSix, setMovedWithSix] = useState(false);
  const [prevPhase, setPrevPhase] = useState(phase);

  const dismiss = useCallback(() => {
    setStep("DONE");
    try { localStorage.setItem(STORAGE_KEY, "1"); } catch {}
  }, []);

  // State machine transitions
  useEffect(() => {
    if (step === "DONE") return;

    // Game over → dismiss
    if (isGameOver) { dismiss(); return; }

    switch (step) {
      case "ROLL_DICE":
        // Wait for roll → check result
        if (phase === "ROLLED" && isHumanTurn) {
          if (diceValue === 6 && hasMovableTokens) {
            setStep("ROLLED_SIX");
          } else {
            setStep("NEED_SIX");
          }
        }
        break;

      case "NEED_SIX":
        // Once AI starts playing
        if (currentPlayerIsAI) {
          setStep("AI_TURN");
        }
        // Or if somehow human gets another turn with a 6
        if (isHumanTurn && phase === "ROLLED" && diceValue === 6 && hasMovableTokens) {
          setStep("ROLLED_SIX");
        }
        break;

      case "AI_TURN":
        // When it becomes human's turn again
        if (isHumanTurn && phase === "WAITING_ROLL") {
          setStep("ROLL_DICE");
        }
        // If human rolled a 6
        if (isHumanTurn && phase === "ROLLED" && diceValue === 6 && hasMovableTokens) {
          setStep("ROLLED_SIX");
        }
        break;

      case "ROLLED_SIX":
        // After human selects a token and phase transitions
        if (prevPhase === "ROLLED" && phase === "WAITING_ROLL" && isHumanTurn) {
          // They moved with a 6 → bonus roll!
          setMovedWithSix(true);
          setStep("BONUS_ROLL");
        }
        if (currentPlayerIsAI) {
          // Turn passed to AI, tutorial done
          dismiss();
        }
        break;

      case "BONUS_ROLL":
        // After they roll again, tutorial is complete
        if (phase === "ROLLED" && isHumanTurn) {
          dismiss();
        }
        if (currentPlayerIsAI) {
          dismiss();
        }
        break;
    }

    setPrevPhase(phase);
  }, [step, phase, isHumanTurn, hasMovableTokens, isGameOver, diceValue, currentPlayerIsAI, prevPhase, dismiss]);

  if (step === "DONE") return null;

  // Message per step
  const messages: Record<Exclude<TutorialStep, "DONE">, string> = {
    ROLL_DICE: t("tips.onboardingRoll", "Press here to roll the dice! 🎲"),
    NEED_SIX: t("tips.onboardingNeedSix", "You need a 6 to get a piece out! AI's turn now."),
    AI_TURN: t("tips.onboardingAITurn", "Now it's AI's turn to play..."),
    ROLLED_SIX: t("tips.onboardingRolledSix", "You rolled a 6! Tap the glowing piece to move it. 👆"),
    BONUS_ROLL: t("tips.onboardingBonusRoll", "Great! Because you rolled a 6, you get to roll again! 🎲"),
  };

  // Only show when the step condition is actually active
  const shouldShow = (() => {
    switch (step) {
      case "ROLL_DICE": return isHumanTurn && phase === "WAITING_ROLL";
      case "NEED_SIX": return true;
      case "AI_TURN": return currentPlayerIsAI;
      case "ROLLED_SIX": return isHumanTurn && hasMovableTokens;
      case "BONUS_ROLL": return isHumanTurn && phase === "WAITING_ROLL";
      default: return false;
    }
  })();

  if (!shouldShow) return null;

  const config = STEP_CONFIG[step];
  const message = messages[step];

  // Position classes
  const positionClass =
    config.position === "bottom" ? "bottom-28 left-1/2 -translate-x-1/2" :
    config.position === "top" ? "top-28 left-1/2 -translate-x-1/2" :
    "top-1/3 left-1/2 -translate-x-1/2";

  return (
    <div className="fixed inset-0 z-[9998] pointer-events-none">
      <div className={`absolute ${positionClass} pointer-events-auto animate-in fade-in zoom-in-95 duration-300`}>
        {/* Arrow pointing up */}
        {config.arrowDirection === "up" && (
          <div className="flex justify-center mb-[-1px]">
            <div className="w-0 h-0 border-l-[10px] border-r-[10px] border-b-[10px] border-l-transparent border-r-transparent border-b-amber-50" />
          </div>
        )}

        {/* Cloud bubble */}
        <div className="relative bg-amber-50 rounded-2xl shadow-xl border border-amber-200/60 px-2.5 py-2 max-w-[260px] flex items-center gap-3">
          {/* Close button */}
          <button
            onClick={dismiss}
            className="absolute top-1.5 right-1.5 p-0.5 rounded-full text-amber-400 hover:text-amber-600 hover:bg-amber-100 transition-colors"
            aria-label="Close tutorial"
          >
            <X size={14} />
          </button>

          {/* Money image */}
          <div className="flex-shrink-0 w-10 h-10 rounded-xl overflow-hidden bg-amber-100">
            <img
              src="/images/monkey-idle.png"
              alt="Money"
              className="w-full h-full object-contain"
            />
          </div>

          {/* Message */}
          <p className="text-sm font-medium text-amber-900 pr-4 leading-snug">
            {message}
          </p>
        </div>

        {/* Arrow pointing down */}
        {config.arrowDirection === "down" && (
          <div className="flex justify-center mt-[-1px]">
            <div className="w-0 h-0 border-l-[10px] border-r-[10px] border-t-[10px] border-l-transparent border-r-transparent border-t-amber-50" />
          </div>
        )}
      </div>
    </div>
  );
}
