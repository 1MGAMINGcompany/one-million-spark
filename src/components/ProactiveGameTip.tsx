/**
 * Proactive context tip — auto-appears on first visit to an AI game page.
 * Shows a floating pill near the bottom for 5 seconds, then auto-dismisses.
 * Each game type tip shows only once ever (localStorage).
 */
import { useState, useEffect } from "react";

interface Props {
  gameType: string;
  tip: string;
}

export default function ProactiveGameTip({ gameType, tip }: Props) {
  const storageKey = `aihelper-tip-shown-${gameType}`;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(storageKey)) return;
    } catch { return; }

    const showTimer = setTimeout(() => {
      setVisible(true);
      try { localStorage.setItem(storageKey, "1"); } catch {}
    }, 2000);

    return () => clearTimeout(showTimer);
  }, [storageKey]);

  useEffect(() => {
    if (!visible) return;
    const hideTimer = setTimeout(() => setVisible(false), 5000);
    return () => clearTimeout(hideTimer);
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[9990] animate-in slide-in-from-bottom duration-300 cursor-pointer"
      onClick={() => setVisible(false)}
    >
      <div className="bg-primary/90 text-primary-foreground px-5 py-2.5 rounded-full text-sm font-medium shadow-lg backdrop-blur-sm flex items-center gap-2">
        <span>💡</span>
        <span>{tip}</span>
      </div>
    </div>
  );
}
