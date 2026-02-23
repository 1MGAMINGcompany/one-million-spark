/**
 * First-game Ludo onboarding overlay.
 * Step 1: "Roll the dice" arrow pointing at dice
 * Step 2: "Tap a piece to move it" arrow pointing at movable tokens
 * Shows only once ever (localStorage: ludo-onboarding-done).
 */
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";

const STORAGE_KEY = "ludo-onboarding-done";

interface Props {
  phase: string; // "WAITING_ROLL" | "ROLLED" | etc
  isHumanTurn: boolean;
  hasMovableTokens: boolean;
  isGameOver: boolean;
}

export default function LudoOnboardingOverlay({ phase, isHumanTurn, hasMovableTokens, isGameOver }: Props) {
  const { t } = useTranslation();
  const [step, setStep] = useState<0 | 1 | 2>(() => {
    try { return localStorage.getItem(STORAGE_KEY) ? 2 : 0; } catch { return 2; }
  });

  // Step 0 → show "Roll the dice" when it's human's turn and waiting for roll
  // Step 1 → show "Tap a piece" after rolling
  // Step 2 → done

  useEffect(() => {
    if (step === 0 && isHumanTurn && phase === "WAITING_ROLL") {
      // Ready to show step 1 (it will render below)
    }
    if (step === 0 && phase === "ROLLED" && isHumanTurn) {
      setStep(1);
    }
    if (step === 1 && (!isHumanTurn || phase === "WAITING_ROLL")) {
      // Human finished their move, onboarding done
      setStep(2);
      try { localStorage.setItem(STORAGE_KEY, "1"); } catch {}
    }
  }, [step, phase, isHumanTurn]);

  useEffect(() => {
    if (isGameOver && step < 2) {
      setStep(2);
      try { localStorage.setItem(STORAGE_KEY, "1"); } catch {}
    }
  }, [isGameOver, step]);

  if (step === 2) return null;

  return (
    <div className="fixed inset-0 z-[9998] pointer-events-none">
      {/* Semi-transparent backdrop */}
      <div className="absolute inset-0 bg-black/30 pointer-events-auto" onClick={() => { setStep(2); try { localStorage.setItem(STORAGE_KEY, "1"); } catch {} }} />

      {step === 0 && isHumanTurn && phase === "WAITING_ROLL" && (
        <div className="absolute bottom-32 left-1/2 -translate-x-1/2 flex flex-col items-center animate-bounce pointer-events-none">
          <div className="bg-primary text-primary-foreground px-4 py-2 rounded-full text-sm font-bold shadow-lg">
            🎲 {t('tips.onboardingRoll')}
          </div>
          <div className="w-0 h-0 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-primary" />
        </div>
      )}

      {step === 1 && isHumanTurn && hasMovableTokens && (
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 flex flex-col items-center animate-bounce pointer-events-none">
          <div className="bg-primary text-primary-foreground px-4 py-2 rounded-full text-sm font-bold shadow-lg">
            👆 {t('tips.onboardingMove')}
          </div>
          <div className="w-0 h-0 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-primary" />
        </div>
      )}
    </div>
  );
}
