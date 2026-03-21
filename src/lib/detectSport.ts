/**
 * Detect sport type from fight data for icon/layout selection.
 */

const SOCCER_KEYWORDS = [
  "MLS", "SOCCER", "FUTBOL", "FÚTBOL", "PREMIER LEAGUE", "LA LIGA",
  "CHAMPIONS LEAGUE", "SERIE A", "BUNDESLIGA", "LIGUE 1", "EREDIVISIE",
  "LIGA MX", "EPL", "COPA", "EURO", "FIFA", "WORLD CUP",
];

export type SportType = "soccer" | "over_under" | "combat";

export function detectSport(fight: {
  source?: string | null;
  event_name?: string;
  fighter_a_name?: string;
  fighter_b_name?: string;
  title?: string;
}): SportType {
  // API-Football source is always soccer
  if (fight.source === "api-football") return "soccer";

  // Check event name for soccer keywords
  const upper = (fight.event_name || "").toUpperCase();
  if (SOCCER_KEYWORDS.some((k) => upper.includes(k))) return "soccer";

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
