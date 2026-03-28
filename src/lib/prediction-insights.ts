/**
 * Local prediction market insight engine.
 * Produces solid insights without any external API.
 * All functions are pure — no side effects, no API calls.
 */

export interface MarketData {
  title: string;
  sport?: string;
  sideA: string;
  sideB: string;
  priceA: number;   // 0–1 probability
  priceB: number;
  poolAUsd: number;
  poolBUsd: number;
  polymarketVolumeUsd?: number;
}

/* ── Derived metrics ── */

export function getTotalVolume(m: MarketData): number {
  if ((m.polymarketVolumeUsd ?? 0) > 0) return m.polymarketVolumeUsd!;
  return m.poolAUsd + m.poolBUsd;
}

export type TrendLabel = "Rising" | "Falling" | "Stable";
export function getTrendLabel(m: MarketData): TrendLabel {
  const pA = m.priceA;
  const pB = m.priceB;
  if (pA > 0.65 || pB > 0.65) return "Rising";
  if (pA < 0.35 && pB < 0.35) return "Falling";
  return "Stable";
}

export type LiquidityLabel = "High" | "Medium" | "Low";
export function getLiquidityLabel(m: MarketData): LiquidityLabel {
  const vol = getTotalVolume(m);
  if (vol >= 50_000) return "High";
  if (vol >= 5_000) return "Medium";
  return "Low";
}

export type ConfidenceLabel = "Strong Favorite" | "Moderate Lean" | "Close Market" | "Uncertain";
export function getConfidenceLabel(m: MarketData): ConfidenceLabel {
  const maxP = Math.max(m.priceA, m.priceB);
  if (maxP >= 0.80) return "Strong Favorite";
  if (maxP >= 0.60) return "Moderate Lean";
  if (maxP >= 0.45) return "Close Market";
  return "Uncertain";
}

/* ── Market signals ── */
export interface MarketSignal {
  label: string;
  color: string; // tailwind classes
}

export function getMarketSignals(m: MarketData): MarketSignal[] {
  const signals: MarketSignal[] = [];
  const vol = getTotalVolume(m);
  const trend = getTrendLabel(m);
  const liq = getLiquidityLabel(m);
  const delta = Math.abs(m.priceA - m.priceB);
  const maxP = Math.max(m.priceA, m.priceB);

  // Activity
  if (vol >= 50_000) signals.push({ label: "High Activity", color: "text-green-400 bg-green-500/10" });
  else if (vol >= 5_000) signals.push({ label: "Moderate Activity", color: "text-blue-400 bg-blue-500/10" });

  // Liquidity
  if (liq === "Low" && vol > 0) signals.push({ label: "Low Liquidity", color: "text-yellow-400 bg-yellow-500/10" });

  // Trend
  if (trend === "Rising") signals.push({ label: "Trending Up", color: "text-green-400 bg-green-500/10" });
  if (trend === "Falling") signals.push({ label: "Trending Down", color: "text-red-400 bg-red-500/10" });

  // Spread
  if (delta > 0.4) signals.push({ label: "Sharp Move", color: "text-orange-400 bg-orange-500/10" });
  else if (delta < 0.12 && maxP > 0) signals.push({ label: "Balanced Market", color: "text-blue-400 bg-blue-500/10" });

  // Favorites
  if (maxP >= 0.80) signals.push({ label: "Heavy Favorite", color: "text-primary bg-primary/10" });
  else if (maxP >= 0.45 && maxP < 0.55) signals.push({ label: "Close Market", color: "text-muted-foreground bg-muted/30" });

  return signals.slice(0, 4);
}

/* ── Caution message ── */
export function getCautionMessage(m: MarketData): string {
  const liq = getLiquidityLabel(m);
  const conf = getConfidenceLabel(m);
  const trend = getTrendLabel(m);
  const delta = Math.abs(m.priceA - m.priceB);

  if (liq === "Low")
    return "Low liquidity can make this market move quickly.";
  if (conf === "Close Market")
    return "This is a close market with no strong favorite.";
  if (trend === "Rising" && delta > 0.3)
    return "Recent movement suggests momentum, but volatility remains possible.";
  if (conf === "Strong Favorite")
    return "This market shows strong activity and clearer price direction.";
  return "Insights are informational and not guaranteed outcomes.";
}

/* ── Local AI insight ── */
export function generateLocalInsight(m: MarketData): string {
  const favored = m.priceA >= m.priceB ? m.sideA : m.sideB;
  const maxP = Math.max(m.priceA, m.priceB);
  const pct = maxP > 0 ? Math.round(maxP * 100) : 50;
  const vol = getTotalVolume(m);
  const liq = getLiquidityLabel(m);
  const trend = getTrendLabel(m);
  const conf = getConfidenceLabel(m);

  const parts: string[] = [];

  // Opening
  if (conf === "Strong Favorite") {
    parts.push(`${favored} is currently favored at ${pct}%, with stronger price support from the market.`);
  } else if (conf === "Moderate Lean") {
    parts.push(`${favored} holds a moderate edge at ${pct}%, though the market hasn't fully committed.`);
  } else if (conf === "Close Market") {
    parts.push(`This is a tight market with no dominant favorite — both sides are priced near ${pct}%.`);
  } else {
    parts.push(`Market pricing is still developing for this matchup.`);
  }

  // Trend
  if (trend === "Rising") {
    parts.push("Recent activity shows upward price movement, suggesting growing market confidence.");
  } else if (trend === "Falling") {
    parts.push("Market sentiment appears to be shifting — watch for further changes.");
  } else {
    parts.push("The market is currently stable with no strong directional bias.");
  }

  // Volume
  if (vol >= 50_000) {
    parts.push("High trading volume indicates strong market interest and more reliable pricing.");
  } else if (vol >= 5_000) {
    parts.push("Moderate volume — enough liquidity for reasonable price signals.");
  } else if (vol > 0) {
    parts.push("Volume is still light, so prices may react more sharply to new entries.");
  }

  return parts.join(" ");
}

/* ── Format helpers ── */
export function fmtVolume(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  if (v > 0) return `$${v.toFixed(0)}`;
  return "—";
}

export function fmtProbability(p: number): string {
  if (p <= 0) return "—";
  if (p < 0.01) return "<1%";
  if (p > 0.99) return ">99%";
  return `${Math.round(p * 100)}%`;
}

/* ── Build MarketData from Fight ── */
export function fightToMarketData(fight: {
  title: string;
  fighter_a_name: string;
  fighter_b_name: string;
  price_a?: number | null;
  price_b?: number | null;
  pool_a_usd?: number;
  pool_b_usd?: number;
  polymarket_volume_usd?: number | null;
}): MarketData {
  return {
    title: fight.title,
    sideA: fight.fighter_a_name,
    sideB: fight.fighter_b_name,
    priceA: fight.price_a ?? 0,
    priceB: fight.price_b ?? 0,
    poolAUsd: fight.pool_a_usd ?? 0,
    poolBUsd: fight.pool_b_usd ?? 0,
    polymarketVolumeUsd: fight.polymarket_volume_usd ?? undefined,
  };
}
