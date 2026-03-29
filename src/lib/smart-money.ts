/**
 * Smart Money signal engine.
 * Derives whale / momentum / activity signals from available market data.
 * Pure functions — no API calls, no side effects.
 */

export type ActivityLabel = "Unusual Activity" | "Strong Activity" | "Normal Activity" | "Light Activity";
export type MomentumLabel = "Momentum Building" | "Stable Market" | "Volatile Movement" | "Thin Market";
export type WhaleSignal = "Large Entry Detected" | "Multiple Large Entries" | "No Unusual Entries";

export interface SmartMoneyData {
  activity: ActivityLabel;
  momentum: MomentumLabel;
  whaleSignal: WhaleSignal;
  quickRead: string;
  hasSignal: boolean;
}

interface MarketInput {
  priceA: number;
  priceB: number;
  poolAUsd: number;
  poolBUsd: number;
  totalVolume: number;
  entryCount?: number;
  largestEntryUsd?: number;
  avgEntryUsd?: number;
}

/* ── Activity ── */
export function getActivityLabel(m: MarketInput): ActivityLabel {
  const vol = m.totalVolume;
  if (vol >= 100_000) return "Unusual Activity";
  if (vol >= 25_000) return "Strong Activity";
  if (vol >= 2_000) return "Normal Activity";
  return "Light Activity";
}

/* ── Momentum ── */
export function getMomentumLabel(m: MarketInput): MomentumLabel {
  const totalPool = m.poolAUsd + m.poolBUsd;
  const delta = Math.abs(m.priceA - m.priceB);
  const maxP = Math.max(m.priceA, m.priceB);

  if (totalPool < 500 && m.totalVolume < 1_000) return "Thin Market";
  if (delta > 0.4 && maxP > 0.7) return "Momentum Building";
  if (delta > 0.25) return "Volatile Movement";
  return "Stable Market";
}

/* ── Whale / Large entry detection ── */
export function getWhaleSignal(m: MarketInput): WhaleSignal {
  const avgEntry = m.avgEntryUsd ?? 0;
  const largest = m.largestEntryUsd ?? 0;
  const entryCount = m.entryCount ?? 0;

  // If we have granular entry data
  if (largest > 0 && avgEntry > 0) {
    const ratio = largest / avgEntry;
    if (ratio >= 5 && entryCount >= 3) return "Multiple Large Entries";
    if (ratio >= 3) return "Large Entry Detected";
  }

  // Derive from pool imbalance as proxy
  const totalPool = m.poolAUsd + m.poolBUsd;
  if (totalPool > 0) {
    const imbalance = Math.abs(m.poolAUsd - m.poolBUsd) / totalPool;
    if (imbalance > 0.6 && totalPool > 5_000) return "Large Entry Detected";
  }

  return "No Unusual Entries";
}

/* ── Quick read ── */
function buildQuickRead(activity: ActivityLabel, momentum: MomentumLabel, whale: WhaleSignal): string {
  if (whale === "Multiple Large Entries")
    return "Multiple larger entries suggest stronger conviction on one side.";
  if (whale === "Large Entry Detected")
    return "A recent larger entry may indicate informed positioning.";
  if (momentum === "Momentum Building")
    return "Price momentum is building — activity favors one direction.";
  if (activity === "Unusual Activity")
    return "Higher-than-normal activity suggests growing market interest.";
  if (momentum === "Thin Market")
    return "Lower liquidity means fewer entries can move price faster.";
  if (activity === "Light Activity")
    return "Light activity — price signals may be less reliable.";
  return "Activity is balanced with no dominant smart-money signal.";
}

/* ── Main builder ── */
export function buildSmartMoneySummary(m: MarketInput): SmartMoneyData {
  const activity = getActivityLabel(m);
  const momentum = getMomentumLabel(m);
  const whaleSignal = getWhaleSignal(m);
  const quickRead = buildQuickRead(activity, momentum, whaleSignal);

  const hasSignal =
    activity !== "Normal Activity" ||
    momentum !== "Stable Market" ||
    whaleSignal !== "No Unusual Entries";

  return { activity, momentum, whaleSignal, quickRead, hasSignal };
}

/* ── Detect large entries from a list of entry amounts ── */
export function detectLargeEntries(amounts: number[]): {
  count: number;
  largest: number;
  avg: number;
  threshold: number;
} {
  if (amounts.length === 0) return { count: 0, largest: 0, avg: 0, threshold: 0 };
  const sorted = [...amounts].sort((a, b) => b - a);
  const avg = amounts.reduce((s, v) => s + v, 0) / amounts.length;
  const threshold = avg * 3;
  const large = sorted.filter((v) => v >= threshold);
  return { count: large.length, largest: sorted[0], avg, threshold };
}
