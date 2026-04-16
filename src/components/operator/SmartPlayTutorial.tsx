import { useState } from "react";
import { useTranslation } from "react-i18next";
import { X, ChevronRight } from "lucide-react";
import type { OperatorTheme } from "@/lib/operatorThemes";

const TUTORIAL_KEY = "1mg-smart-play-tutorial-seen";

interface Props {
  theme: OperatorTheme;
  onClose: () => void;
}

export function hasSeenTutorial(): boolean {
  try { return localStorage.getItem(TUTORIAL_KEY) === "1"; } catch { return false; }
}

export function markTutorialSeen(): void {
  try { localStorage.setItem(TUTORIAL_KEY, "1"); } catch {}
}

export function resetTutorial(): void {
  try { localStorage.removeItem(TUTORIAL_KEY); } catch {}
}

export default function SmartPlayTutorial({ theme, onClose }: Props) {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);

  const STEPS = [
    {
      emoji: "🎯",
      title: t("smartPlay.tutorialStep1Title"),
      desc: t("smartPlay.tutorialStep1Desc"),
    },
    {
      emoji: "📈",
      title: t("smartPlay.tutorialStep2Title"),
      desc: t("smartPlay.tutorialStep2Desc"),
    },
    {
      emoji: "💰",
      title: t("smartPlay.tutorialStep3Title"),
      desc: t("smartPlay.tutorialStep3Desc"),
    },
  ];

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      markTutorialSeen();
      onClose();
    }
  };

  const handleSkip = () => {
    markTutorialSeen();
    onClose();
  };

  const s = STEPS[step];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={handleSkip}>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-sm rounded-2xl p-6 shadow-2xl"
        style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.cardBorder}` }}
        onClick={e => e.stopPropagation()}
      >
        <button onClick={handleSkip} className="absolute top-3 right-3 p-1 rounded-full hover:opacity-70">
          <X className="w-4 h-4" style={{ color: theme.textMuted }} />
        </button>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 mb-5">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className="h-1.5 rounded-full transition-all"
              style={{
                width: i === step ? 24 : 8,
                backgroundColor: i === step ? theme.primary : theme.surfaceBg,
              }}
            />
          ))}
        </div>

        <div className="text-center space-y-3">
          <span className="text-4xl">{s.emoji}</span>
          <h3 className="text-lg font-bold" style={{ color: theme.textPrimary }}>{s.title}</h3>
          <p className="text-sm leading-relaxed" style={{ color: theme.textSecondary }}>{s.desc}</p>
        </div>

        <button
          onClick={handleNext}
          className="mt-6 w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 transition-all"
          style={{ backgroundColor: theme.primary, color: theme.primaryForeground }}
        >
          {step < STEPS.length - 1 ? (
            <>{t("smartPlay.next")} <ChevronRight className="w-4 h-4" /></>
          ) : (
            t("smartPlay.gotIt")
          )}
        </button>

        <button
          onClick={handleSkip}
          className="mt-2 w-full py-2 text-xs font-medium transition-opacity hover:opacity-70"
          style={{ color: theme.textMuted }}
        >
          {t("smartPlay.skip")}
        </button>
      </div>
    </div>
  );
}
