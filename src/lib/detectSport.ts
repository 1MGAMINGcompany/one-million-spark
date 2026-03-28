/**
 * Detect sport type from fight data for icon/layout selection.
 */

const SOCCER_KEYWORDS = [
  "MLS", "SOCCER", "FUTBOL", "FÚTBOL", "PREMIER LEAGUE", "LA LIGA",
  "CHAMPIONS LEAGUE", "SERIE A", "BUNDESLIGA", "LIGUE 1", "EREDIVISIE",
  "LIGA MX", "EPL", "COPA", "EURO", "FIFA", "WORLD CUP",
];

export type SportType = "soccer" | "over_under" | "combat" | "nfl" | "nba" | "ncaa" | "nhl" | "mlb" | "tennis" | "golf";

export function detectSport(fight: {
  source?: string | null;
  event_name?: string;
  fighter_a_name?: string;
  fighter_b_name?: string;
  title?: string;
}): SportType {
  // API-Football source is always soccer
  if (fight.source === "api-football") return "soccer";

  // Check event name for sport keywords
  const upper = (fight.event_name || "").toUpperCase();
  if (SOCCER_KEYWORDS.some((k) => upper.includes(k))) return "soccer";

  // US Sports & Others
  if (upper.includes("NFL") || upper.includes("SUPER BOWL")) return "nfl";
  if (upper.includes("NBA") || upper.includes("WNBA")) return "nba";
  if (upper.includes("NCAA") || upper.includes("MARCH MADNESS") || upper.includes("COLLEGE FOOTBALL")) return "ncaa";
  if (upper.includes("NHL") || upper.includes("STANLEY CUP")) return "nhl";
  if (upper.includes("MLB") || upper.includes("WORLD SERIES")) return "mlb";
  if (upper.includes("ATP") || upper.includes("WTA") || upper.includes("TENNIS") || upper.includes("WIMBLEDON")) return "tennis";
  if (upper.includes("PGA") || upper.includes("GOLF") || upper.includes("MASTERS GOLF")) return "golf";

  // Over/Under detection
  const nameA = (fight.fighter_a_name || "").toLowerCase().trim();
  const nameB = (fight.fighter_b_name || "").toLowerCase().trim();
  const title = (fight.title || "").toUpperCase();

  if (
    nameA === "over" || nameA === "under" ||
    nameB === "over" || nameB === "under" ||
    title.includes("O/U") || title.includes("OVER/UNDER")
  ) {
    return "over_under";
  }

  return "combat";
}

/** Check if a fight name represents the "Over" side */
export function isOverSide(name: string): boolean {
  return name.toLowerCase().trim() === "over";
}

const PROP_KEYWORDS = [
  "goes the distance", "total rounds", "method of victory",
  "decision", "knockout", "submission", "stoppage",
  "o/u", "over/under", "round betting", "how will",
  "will the fight", "points spread", "handicap",
];

/**
 * Returns true if a fight is a prop/secondary market (not "who wins").
 * Soccer Yes/No markets are NOT props — they are the main structure.
 */
export function isPropMarket(fight: {
  title?: string;
  fighter_a_name?: string;
  fighter_b_name?: string;
  source?: string | null;
  event_name?: string;
}): boolean {
  // Soccer binary Yes/No markets are the main market, not props
  if (detectSport(fight) === "soccer") return false;

  // Over/Under sport type
  if (detectSport(fight) === "over_under") return true;

  // Title keyword check
  const title = (fight.title || "").toLowerCase();
  if (PROP_KEYWORDS.some(k => title.includes(k))) return true;

  // Fighter names are Yes/No or Over/Under (non-soccer)
  const a = (fight.fighter_a_name || "").toLowerCase().trim();
  const b = (fight.fighter_b_name || "").toLowerCase().trim();
  if ((a === "yes" && b === "no") || (a === "no" && b === "yes")) return true;
  if ((a === "over" && b === "under") || (a === "under" && b === "over")) return true;

  return false;
}
