/**
 * Soccer league extraction from event names / categories.
 * Used by operator apps to group soccer events by league.
 */

const LEAGUE_KEYWORDS: [string[], string][] = [
  [["PREMIER LEAGUE", "EPL"], "Premier League"],
  [["LA LIGA"], "La Liga"],
  [["BUNDESLIGA"], "Bundesliga"],
  [["SERIE A"], "Serie A"],
  [["LIGUE 1"], "Ligue 1"],
  [["LIGA MX"], "Liga MX"],
  [["MLS"], "MLS"],
  [["EREDIVISIE"], "Eredivisie"],
  [["CHAMPIONS LEAGUE", "UCL"], "Champions League"],
  [["EUROPA LEAGUE", "UEL"], "Europa League"],
  [["EUROPA CONFERENCE"], "Europa Conference"],
  [["COPA LIBERTADORES"], "Copa Libertadores"],
  [["COPA SUDAMERICANA"], "Copa Sudamericana"],
  [["CONCACAF"], "CONCACAF"],
  [["A-LEAGUE"], "A-League"],
  [["K-LEAGUE"], "K-League"],
  [["J-LEAGUE"], "J-League"],
  [["PRIMEIRA LIGA"], "Primeira Liga"],
  [["SUPER LIG", "SÜPER LIG"], "Süper Lig"],
  [["SAUDI PRO LEAGUE"], "Saudi Pro League"],
  [["BRAZIL SÉRIE A"], "Brasileirão"],
  [["WORLD CUP"], "World Cup"],
  [["EURO 20", "UEFA EURO"], "UEFA Euro"],
  [["COPA AMERICA"], "Copa América"],
  [["FIFA"], "FIFA"],
];

/**
 * Extract league name from event name or category string.
 * Returns "Other" if no league can be determined.
 */
export function extractSoccerLeague(eventName: string, category?: string | null): string {
  const search = `${eventName} ${category || ""}`.toUpperCase();
  for (const [keywords, league] of LEAGUE_KEYWORDS) {
    if (keywords.some(k => search.includes(k))) return league;
  }
  return "Other";
}

/**
 * Group fights by league, returning entries sorted by league count (descending).
 */
export function groupByLeague<T extends { event_name: string; _category?: string | null }>(
  fights: T[],
): { league: string; fights: T[] }[] {
  const map = new Map<string, T[]>();
  for (const f of fights) {
    const league = extractSoccerLeague(f.event_name, (f as any)._category);
    if (!map.has(league)) map.set(league, []);
    map.get(league)!.push(f);
  }
  return Array.from(map.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .map(([league, fights]) => ({ league, fights }));
}
