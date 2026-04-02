/**
 * Canonical sport normalization and allowlist for operator apps (*.1mg.live).
 *
 * ONE source of truth — replaces all inline parseSport functions in operator code.
 */

/** Sports allowed on operator apps — strict allowlist */
const OPERATOR_ALLOWED_SPORTS = new Set([
  "NFL", "NBA", "NHL", "SOCCER", "MMA", "BOXING", "MLB", "TENNIS",
  "GOLF", "NCAA", "CRICKET", "F1", "NASCAR", "MLS",
]);

/** Keyword → canonical sport mapping (order matters: first match wins) */
const SPORT_KEYWORDS: [string[], string][] = [
  // Direct category aliases from sync pipeline
  [["FUTBOL"], "SOCCER"],
  [["BARE KNUCKLE"], "BOXING"],
  // Soccer / Futbol variants
  [["MLS"], "MLS"],
  [["SOCCER", "FUTBOL", "FÚTBOL", "PREMIER LEAGUE", "LA LIGA", "CHAMPIONS LEAGUE",
    "SERIE A", "BUNDESLIGA", "LIGUE 1", "EPL", "COPA", "LIGA MX", "EREDIVISIE",
    "PRIMEIRA LIGA", "SUPER LIG", "SÜPER LIG", "BRAZIL SÉRIE A", "SAUDI PRO LEAGUE",
    "COPA LIBERTADORES", "EUROPA LEAGUE", "UEL", "UCL", "A-LEAGUE", "K-LEAGUE",
    "J-LEAGUE", "CONCACAF", "CONMEBOL"], "SOCCER"],
  // Combat
  [["UFC", "MMA", "PFL", "BELLATOR", "ONE CHAMPIONSHIP", "MUAY THAI", "KICKBOXING"], "MMA"],
  [["BOXING", "BARE KNUCKLE", "BKFC"], "BOXING"],
  // US sports
  [["NFL", "SUPER BOWL"], "NFL"],
  [["NBA", "WNBA"], "NBA"],
  [["NCAA", "MARCH MADNESS", "COLLEGE FOOTBALL", "COLLEGE BASKETBALL", "CWBB"], "NCAA"],
  [["NHL", "STANLEY CUP"], "NHL"],
  [["MLB", "WORLD SERIES"], "MLB"],
  // Racket / Individual
  [["TENNIS", "ATP", "WTA", "WIMBLEDON"], "TENNIS"],
  [["GOLF", "PGA", "MASTERS GOLF"], "GOLF"],
  // Motorsport
  [["FORMULA 1", "GRAND PRIX"], "F1"],
  [["F1"], "F1"],
  [["NASCAR", "DAYTONA", "INDY 500"], "NASCAR"],
  // Other
  [["CRICKET", "IPL", "T20", "PSL"], "CRICKET"],
];

/**
 * Normalize a sport string (from `event_name` or the `sport` column) to a
 * canonical upper-case label.  Returns `null` if the sport is unknown /
 * not on the operator allowlist.
 */
export function normalizeOperatorSport(
  eventName: string,
  sportColumn?: string | null,
): string | null {
  // 1. If the DB has a sport column, try to normalize it first
  if (sportColumn) {
    const upper = sportColumn.toUpperCase().trim();
    // Direct match
    if (OPERATOR_ALLOWED_SPORTS.has(upper)) return upper;
    // Keyword scan on sport column value
    for (const [keywords, canonical] of SPORT_KEYWORDS) {
      if (keywords.some(k => upper.includes(k))) {
        if (OPERATOR_ALLOWED_SPORTS.has(canonical)) return canonical;
      }
    }
  }

  // 2. Fall back to event_name keyword scan
  const upper = (eventName || "").toUpperCase();
  for (const [keywords, canonical] of SPORT_KEYWORDS) {
    if (keywords.some(k => upper.includes(k))) {
      if (OPERATOR_ALLOWED_SPORTS.has(canonical)) return canonical;
    }
  }

  return null; // unknown / not allowed
}

/** Check if a sport (already normalized) is on the operator allowlist */
export function isAllowedOperatorSport(sport: string): boolean {
  return OPERATOR_ALLOWED_SPORTS.has(sport.toUpperCase());
}

/** Get the full set of allowed sports (for UI display) */
export function getAllowedSportsList(): string[] {
  return Array.from(OPERATOR_ALLOWED_SPORTS);
}

/** Emoji map for display */
export const OPERATOR_SPORT_EMOJI: Record<string, string> = {
  NBA: "🏀", NHL: "🏒", MLB: "⚾", NFL: "🏈", MLS: "⚽", SOCCER: "⚽",
  MMA: "🥊", BOXING: "🥊", TENNIS: "🎾", CRICKET: "🏏", GOLF: "⛳",
  F1: "🏎️", NASCAR: "🏁", NCAA: "🎓",
};

// ── Event shape validation ──

interface OperatorFightRow {
  fighter_a_name?: string | null;
  fighter_b_name?: string | null;
  title?: string | null;
  event_date?: string | null;
  event_name?: string | null;
  status?: string | null;
  [key: string]: unknown;
}

/** Statuses that should be shown in operator apps */
const VISIBLE_STATUSES = new Set(["open", "live", "locked"]);

/**
 * Returns true only if the fight row has a valid shape for operator display:
 *  - non-empty fighter names
 *  - non-empty title
 *  - event_date present
 *  - status is open/live/locked
 *  - sport is on the allowlist
 *  - not a prop / non-match market
 */
export function isValidOperatorEvent(fight: OperatorFightRow): boolean {
  if (!fight.fighter_a_name?.trim()) return false;
  if (!fight.fighter_b_name?.trim()) return false;
  if (!fight.title?.trim()) return false;
  if (!fight.event_date) return false;
  if (!fight.status || !VISIBLE_STATUSES.has(fight.status)) return false;

  // Prop / non-match market check (Yes/No, Over/Under)
  const a = (fight.fighter_a_name || "").toLowerCase().trim();
  const b = (fight.fighter_b_name || "").toLowerCase().trim();
  if ((a === "yes" && b === "no") || (a === "no" && b === "yes")) return false;
  if ((a === "over" && b === "under") || (a === "under" && b === "over")) return false;

  return true;
}

/**
 * Check if an event_date is still relevant (not too far in the past).
 * Allows a 4-hour grace window for live events that just ended.
 */
export function isEventDateRelevant(eventDate: string | null): boolean {
  if (!eventDate) return false;
  const d = new Date(eventDate);
  if (isNaN(d.getTime())) return false;
  const cutoff = new Date(Date.now() - 4 * 60 * 60 * 1000); // 4 hours ago
  return d >= cutoff;
}
