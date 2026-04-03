import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { BROAD_SPORTS } from "@/lib/sportLeagues";
import type { OperatorTheme } from "@/lib/operatorThemes";

interface SportPickerModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (sportKey: string) => void;
  sportCounts: Record<string, number>;
  totalCount: number;
  theme: OperatorTheme;
}

export default function SportPickerModal({
  open,
  onClose,
  onSelect,
  sportCounts,
  totalCount,
  theme,
}: SportPickerModalProps) {
  const { t } = useTranslation();
  const sorted = useMemo(() => {
    return Object.entries(sportCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([key, count]) => ({
        key,
        label: BROAD_SPORTS[key]?.label || key,
        emoji: BROAD_SPORTS[key]?.emoji || "🏆",
        count,
      }));
  }, [sportCounts]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        className="relative w-full sm:max-w-md max-h-[80vh] rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col"
        style={{ backgroundColor: theme.cardBg }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: `1px solid ${theme.cardBorder}` }}
        >
          <h2 className="text-lg font-bold" style={{ color: theme.textPrimary }}>
            {t("operator.allSports")}
          </h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:opacity-70">
            <X className="w-5 h-5" style={{ color: theme.textMuted }} />
          </button>
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1 px-3 py-2">
          {/* All Sports */}
          <button
            onClick={() => { onSelect("ALL"); onClose(); }}
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl transition-colors hover:opacity-80"
            style={{ backgroundColor: theme.surfaceBg }}
          >
            <div className="flex items-center gap-3">
              <span className="text-lg">🔥</span>
              <span className="font-semibold text-sm" style={{ color: theme.textPrimary }}>
                {t("operator.allSports")}
              </span>
            </div>
            <span
              className="text-xs font-bold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: theme.primary + "18", color: theme.primary }}
            >
              {totalCount}
            </span>
          </button>

          <div className="mt-2 space-y-1">
            {sorted.map(sport => (
              <button
                key={sport.key}
                onClick={() => { onSelect(sport.key); onClose(); }}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl transition-colors hover:opacity-80"
                style={{ backgroundColor: "transparent" }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = theme.surfaceBg)}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">{sport.emoji}</span>
                  <span className="font-medium text-sm" style={{ color: theme.textPrimary }}>
                    {sport.label}
                  </span>
                </div>
                <span
                  className="text-xs font-medium px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: theme.surfaceBg, color: theme.textSecondary }}
                >
                  {sport.count}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
