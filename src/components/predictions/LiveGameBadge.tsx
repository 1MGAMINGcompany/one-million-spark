import type { LiveGameState } from "@/hooks/useSportsWebSocket";
import type { OperatorTheme } from "@/lib/operatorThemes";

interface LiveGameBadgeProps {
  state: LiveGameState;
  theme?: OperatorTheme;
  className?: string;
}

/**
 * Sport-aware live game status badge.
 * Shows period, elapsed time, and score based on sport type.
 */
export default function LiveGameBadge({ state, theme, className = "" }: LiveGameBadgeProps) {
  if (state.ended) {
    return (
      <span
        className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${className}`}
        style={{
          backgroundColor: theme ? `${theme.primary}18` : undefined,
          color: theme?.textSecondary || undefined,
        }}
      >
        <span className="text-green-500">✓</span> Final
        {state.score && <span className="ml-1 font-mono">{state.score}</span>}
      </span>
    );
  }

  if (!state.live) return null;

  const sport = (state.sport || "").toLowerCase();
  const periodLabel = formatPeriod(state.period, state.elapsed, sport);

  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${className}`}
      style={{
        backgroundColor: theme ? "#ef444422" : undefined,
        color: theme ? "#ef4444" : undefined,
      }}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
      LIVE
      {periodLabel && <span className="ml-0.5 font-mono">{periodLabel}</span>}
      {state.score && <span className="ml-1 font-mono">{state.score}</span>}
    </span>
  );
}

function formatPeriod(period?: string, elapsed?: string, sport?: string): string {
  if (!period && !elapsed) return "";
  const p = period || "";
  const e = elapsed || "";

  // NHL / Hockey
  if (sport?.includes("hockey") || sport?.includes("nhl") || sport?.includes("ice")) {
    const label = p.startsWith("P") ? p : `P${p}`;
    return e ? `${label} ${e}` : label;
  }

  // NBA / Basketball
  if (sport?.includes("basketball") || sport?.includes("nba")) {
    const label = p.startsWith("Q") ? p : `Q${p}`;
    return e ? `${label} ${e}` : label;
  }

  // Soccer / Football
  if (sport?.includes("soccer") || sport?.includes("football") || sport?.includes("futbol")) {
    const halfLabel = p === "2" || p === "2H" ? "2H" : p === "1" || p === "1H" ? "1H" : p;
    return e ? `${halfLabel} ${e}'` : halfLabel;
  }

  // Baseball / MLB
  if (sport?.includes("baseball") || sport?.includes("mlb")) {
    return e ? `${p} ${e}` : p;
  }

  // Tennis
  if (sport?.includes("tennis")) {
    return p ? `Set ${p}` : "";
  }

  // Cricket
  if (sport?.includes("cricket")) {
    return p || "";
  }

  // Generic fallback
  if (p && e) return `${p} ${e}`;
  return p || e;
}

/** Score display component for inline use between team names */
export function LiveScoreDisplay({
  state,
  theme,
}: {
  state: LiveGameState;
  theme?: OperatorTheme;
}) {
  if (!state.score && state.scoreA == null) return null;

  return (
    <span
      className="text-sm font-bold font-mono tabular-nums"
      style={{ color: theme?.primary || "#ef4444" }}
    >
      {state.score || `${state.scoreA ?? 0}-${state.scoreB ?? 0}`}
    </span>
  );
}
