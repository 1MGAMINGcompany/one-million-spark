/**
 * Universal sport → league mapping system.
 * Provides broad sport categories and league derivation from event metadata.
 *
 * Primary league derivation uses polymarket_slug prefix (most reliable),
 * then falls back to keyword matching on category / event_name.
 */

// ── Broad sport categories (Level 1) ──
export const BROAD_SPORTS: Record<string, { label: string; emoji: string }> = {
  SOCCER: { label: "Soccer", emoji: "⚽" },
  BASKETBALL: { label: "Basketball", emoji: "🏀" },
  HOCKEY: { label: "Hockey", emoji: "🏒" },
  FOOTBALL: { label: "Football", emoji: "🏈" },
  BASEBALL: { label: "Baseball", emoji: "⚾" },
  MMA: { label: "MMA", emoji: "🥊" },
  BOXING: { label: "Boxing", emoji: "🥊" },
  CRICKET: { label: "Cricket", emoji: "🏏" },
  TENNIS: { label: "Tennis", emoji: "🎾" },
  GOLF: { label: "Golf", emoji: "⛳" },
  F1: { label: "F1", emoji: "🏎️" },
  RUGBY: { label: "Rugby", emoji: "🏉" },
  ESPORTS: { label: "Esports", emoji: "🎮" },
};

// ── Normalized sport → broad sport mapping ──
const SPORT_TO_BROAD: Record<string, string> = {
  SOCCER: "SOCCER",
  MLS: "SOCCER",
  FUTBOL: "SOCCER",
  NBA: "BASKETBALL",
  NCAA: "BASKETBALL",
  EUROLEAGUE: "BASKETBALL",
  NHL: "HOCKEY",
  KHL: "HOCKEY",
  SHL: "HOCKEY",
  AHL: "HOCKEY",
  NFL: "FOOTBALL",
  MLB: "BASEBALL",
  MMA: "MMA",
  "MUAY THAI": "MMA",
  BOXING: "BOXING",
  CRICKET: "CRICKET",
  TENNIS: "TENNIS",
  GOLF: "GOLF",
  F1: "F1",
  NASCAR: "F1",
  RUGBY: "RUGBY",
  ESPORTS: "ESPORTS",
};

/**
 * Map a normalizedOperatorSport result to a broad sport category.
 */
export function toBroadSport(normalizedSport: string | null): string {
  if (!normalizedSport) return "OTHER";
  return SPORT_TO_BROAD[normalizedSport] || "OTHER";
}

// ── Polymarket slug prefix → league (most reliable source) ──

const SLUG_PREFIX_TO_LEAGUE: Record<string, string> = {
  // Soccer
  epl: "Premier League",
  lal: "La Liga",
  bun: "Bundesliga",
  ser: "Serie A",
  itc: "Serie A",
  fl1: "Ligue 1",
  mls: "MLS",
  mex: "Liga MX",
  ere: "Eredivisie",
  ucl: "Champions League",
  uel: "Europa League",
  uecl: "Europa Conference",
  lib: "Copa Libertadores",
  sud: "Copa Sudamericana",
  bra: "Brasileirão",
  arg: "Argentina Liga",
  kor: "K-League",
  j1100: "J-League",
  j1: "J-League",
  j2: "J-League",
  tur: "Süper Lig",
  sau: "Saudi Pro League",
  por: "Primeira Liga",
  ros: "Russian PL",
  sco: "Scottish PL",
  bel: "Belgian Pro League",
  aus: "A-League",
  chi: "Chilean Liga",
  col: "Colombian Liga",
  per: "Peruvian Liga",
  ven: "Venezuelan Liga",
  ecu: "Ecuadorian Liga",
  uru: "Uruguayan Liga",
  par: "Paraguayan Liga",
  bol: "Bolivian Liga",
  svk1: "Slovak Super Liga",
  // US sports
  nba: "NBA",
  nhl: "NHL",
  mlb: "MLB",
  nfl: "NFL",
  cbb: "NCAAB",
  cfb: "NCAA Football",
  // Combat
  ufc: "UFC",
  pfl: "PFL",
  bel2: "Bellator",
  one: "ONE",
  bkfc: "BKFC",
  // Cricket — granular subdivision
  cricipl: "IPL",
  cricpsl: "PSL",
  cric: "International",
  cricleg: "Legends Cricket League",
  crict20: "National T20",
  cricbbl: "BBL",
  crictest: "Test Cricket",
  cricwc: "Cricket World Cup",
  cricodi: "ODI",
  cricsaf: "South Africa",
  cricaus: "Australia",
  // Tennis
  atp: "ATP",
  wta: "WTA",
  // Golf
  pga: "PGA Tour",
  // F1
  f1: "Formula 1",
  nascar: "NASCAR",
  // Esports
  cs2: "Counter-Strike",
};

/**
 * Derive league from polymarket_slug prefix.
 * Returns null if no match.
 */
function leagueFromSlug(slug: string | null | undefined): string | null {
  if (!slug) return null;
  // Try longest prefix first (j1100 before j1)
  const lower = slug.toLowerCase();
  // Check multi-char prefixes first
  for (const prefix of Object.keys(SLUG_PREFIX_TO_LEAGUE).sort((a, b) => b.length - a.length)) {
    if (lower.startsWith(prefix + "-") || lower === prefix) {
      return SLUG_PREFIX_TO_LEAGUE[prefix];
    }
  }
  return null;
}

// ── Keyword-based league rules (fallback) ──

interface LeagueRule {
  keywords: string[];
  league: string;
}

const SOCCER_LEAGUES: LeagueRule[] = [
  { keywords: ["PREMIER LEAGUE", "EPL"], league: "Premier League" },
  { keywords: ["LA LIGA"], league: "La Liga" },
  { keywords: ["BUNDESLIGA"], league: "Bundesliga" },
  { keywords: ["SERIE A"], league: "Serie A" },
  { keywords: ["LIGUE 1"], league: "Ligue 1" },
  { keywords: ["LIGA MX"], league: "Liga MX" },
  { keywords: ["MLS"], league: "MLS" },
  { keywords: ["EREDIVISIE"], league: "Eredivisie" },
  { keywords: ["CHAMPIONS LEAGUE", "UCL"], league: "Champions League" },
  { keywords: ["EUROPA LEAGUE", "UEL"], league: "Europa League" },
  { keywords: ["EUROPA CONFERENCE"], league: "Europa Conference" },
  { keywords: ["COPA LIBERTADORES", "LIBERTADORES"], league: "Copa Libertadores" },
  { keywords: ["COPA SUDAMERICANA", "SUDAMERICANA"], league: "Copa Sudamericana" },
  { keywords: ["CONCACAF"], league: "CONCACAF" },
  { keywords: ["A-LEAGUE"], league: "A-League" },
  { keywords: ["K-LEAGUE", "K LEAGUE"], league: "K-League" },
  { keywords: ["J-LEAGUE", "J LEAGUE", "J1 LEAGUE"], league: "J-League" },
  { keywords: ["PRIMEIRA LIGA"], league: "Primeira Liga" },
  { keywords: ["SUPER LIG", "SÜPER LIG"], league: "Süper Lig" },
  { keywords: ["SAUDI PRO LEAGUE"], league: "Saudi Pro League" },
  { keywords: ["BRAZIL SÉRIE A", "BRASILEIRÃO"], league: "Brasileirão" },
  { keywords: ["WORLD CUP"], league: "World Cup" },
  { keywords: ["EURO 20", "UEFA EURO"], league: "UEFA Euro" },
  { keywords: ["COPA AMERICA"], league: "Copa América" },
  { keywords: ["FIFA CLUB WORLD CUP", "CLUB WORLD"], league: "Club World Cup" },
  { keywords: ["SCOTTISH"], league: "Scottish PL" },
  { keywords: ["BELGIAN PRO"], league: "Belgian Pro League" },
];

const BASKETBALL_LEAGUES: LeagueRule[] = [
  { keywords: ["NBA", "WNBA"], league: "NBA" },
  { keywords: ["NCAA", "MARCH MADNESS", "COLLEGE BASKETBALL", "CWBB", "COLLEGE WOMEN"], league: "NCAAB" },
  { keywords: ["EUROLEAGUE", "EURO LEAGUE"], league: "Euroleague" },
  { keywords: ["JAPAN B LEAGUE", "B.LEAGUE"], league: "Japan B League" },
  { keywords: ["BSL", "TURKEY BASKETBALL"], league: "Turkey BSL" },
  { keywords: ["LIGA ENDESA"], league: "Liga Endesa" },
  { keywords: ["CBA"], league: "CBA" },
];

const HOCKEY_LEAGUES: LeagueRule[] = [
  { keywords: ["NHL", "STANLEY CUP"], league: "NHL" },
  { keywords: ["KHL"], league: "KHL" },
  { keywords: ["SHL", "SWEDISH HOCKEY"], league: "SHL" },
  { keywords: ["AHL"], league: "AHL" },
];

const FOOTBALL_LEAGUES: LeagueRule[] = [
  { keywords: ["NFL", "SUPER BOWL"], league: "NFL" },
  { keywords: ["NCAA", "COLLEGE FOOTBALL"], league: "NCAA Football" },
  { keywords: ["XFL"], league: "XFL" },
  { keywords: ["CFL"], league: "CFL" },
];

const BASEBALL_LEAGUES: LeagueRule[] = [
  { keywords: ["MLB", "WORLD SERIES"], league: "MLB" },
  { keywords: ["NPB", "JAPAN BASEBALL"], league: "NPB" },
  { keywords: ["KBO"], league: "KBO" },
];

const MMA_LEAGUES: LeagueRule[] = [
  { keywords: ["UFC"], league: "UFC" },
  { keywords: ["PFL"], league: "PFL" },
  { keywords: ["BELLATOR"], league: "Bellator" },
  { keywords: ["ONE CHAMPIONSHIP", "ONE FC", "ONE FIGHT", "ONE SAMURAI"], league: "ONE" },
  { keywords: ["MUAY THAI"], league: "Muay Thai" },
  { keywords: ["BARE KNUCKLE", "BKFC"], league: "BKFC" },
];

const BOXING_LEAGUES: LeagueRule[] = [
  { keywords: ["WBC"], league: "WBC" },
  { keywords: ["WBA"], league: "WBA" },
  { keywords: ["IBF"], league: "IBF" },
  { keywords: ["WBO"], league: "WBO" },
];

const CRICKET_LEAGUES: LeagueRule[] = [
  { keywords: ["IPL", "INDIAN PREMIER"], league: "IPL" },
  { keywords: ["PSL"], league: "PSL" },
  { keywords: ["T20 WORLD", "T20I"], league: "T20 International" },
  { keywords: ["NATIONAL T20"], league: "National T20" },
  { keywords: ["TEST MATCH", "TEST CRICKET"], league: "Test Cricket" },
  { keywords: ["BBL", "BIG BASH"], league: "BBL" },
  { keywords: ["ODI", "ONE DAY"], league: "ODI" },
  { keywords: ["LEGENDS CRICKET", "LLC"], league: "Legends Cricket League" },
  { keywords: ["WORLD CUP CRICKET", "CRICKET WORLD"], league: "Cricket World Cup" },
];

const TENNIS_LEAGUES: LeagueRule[] = [
  { keywords: ["WIMBLEDON"], league: "Wimbledon" },
  { keywords: ["US OPEN"], league: "US Open" },
  { keywords: ["FRENCH OPEN", "ROLAND GARROS"], league: "French Open" },
  { keywords: ["AUSTRALIAN OPEN"], league: "Australian Open" },
  { keywords: ["ATP"], league: "ATP" },
  { keywords: ["WTA"], league: "WTA" },
];

const ESPORTS_LEAGUES: LeagueRule[] = [
  { keywords: ["COUNTER-STRIKE", "CS2", "CS:GO"], league: "Counter-Strike" },
  { keywords: ["DOTA", "DOTA 2"], league: "Dota 2" },
  { keywords: ["LEAGUE OF LEGENDS", "LOL"], league: "League of Legends" },
  { keywords: ["VALORANT"], league: "Valorant" },
];

const LEAGUE_RULES: Record<string, LeagueRule[]> = {
  SOCCER: SOCCER_LEAGUES,
  BASKETBALL: BASKETBALL_LEAGUES,
  HOCKEY: HOCKEY_LEAGUES,
  FOOTBALL: FOOTBALL_LEAGUES,
  BASEBALL: BASEBALL_LEAGUES,
  MMA: MMA_LEAGUES,
  BOXING: BOXING_LEAGUES,
  CRICKET: CRICKET_LEAGUES,
  TENNIS: TENNIS_LEAGUES,
  ESPORTS: ESPORTS_LEAGUES,
};

/**
 * Extract league from event metadata.
 * Priority: polymarket_slug → category → event_name → fallback "Other"
 */
export function extractLeague(
  broadSport: string,
  eventName: string,
  category?: string | null,
  polymarketSlug?: string | null,
): string {
  // 1. Best source: polymarket slug prefix
  const fromSlug = leagueFromSlug(polymarketSlug);
  if (fromSlug) return fromSlug;

  // 2. Keyword matching against category + event_name
  const rules = LEAGUE_RULES[broadSport];
  if (!rules) return "Other";

  const search = `${category || ""} ${eventName}`.toUpperCase();
  for (const rule of rules) {
    if (rule.keywords.some(k => search.includes(k))) return rule.league;
  }
  return "Other";
}

/**
 * Build league tabs for a given broad sport from fight data.
 * Returns leagues sorted by count (desc), with "All {Sport}" prepended.
 */
export function buildLeagueTabs(
  broadSport: string,
  fights: Array<{ event_name: string; _category?: string | null; _league?: string }>,
): { key: string; label: string; count: number }[] {
  const map = new Map<string, number>();
  for (const f of fights) {
    const league = f._league || extractLeague(broadSport, f.event_name, f._category);
    map.set(league, (map.get(league) || 0) + 1);
  }

  const sorted = Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([league, count]) => ({ key: league, label: league, count }));

  const sportLabel = BROAD_SPORTS[broadSport]?.label || broadSport;
  return [
    { key: "ALL_LEAGUES", label: `All ${sportLabel}`, count: fights.length },
    ...sorted,
  ];
}

// ── Date grouping ──

export interface DateGroup<T> {
  label: string;
  sortKey: string;
  fights: T[];
}

/**
 * Group fights by date (Today, Tomorrow, Apr 5, etc.), sorted ascending.
 * Hides past events (with configurable grace period).
 */
export function groupByDate<T extends Record<string, any>>(
  fights: T[],
  graceHours = 24,
): DateGroup<T>[] {
  const now = new Date();
  const todayStr = now.toDateString();
  const tomorrowStr = new Date(now.getTime() + 86400000).toDateString();

  const map = new Map<string, { label: string; sortKey: string; fights: T[] }>();

  for (const f of fights) {
    if (!f.event_date) continue;
    const d = new Date(f.event_date);
    if (d.getTime() < now.getTime() - graceHours * 3600000) continue;

    const dateStr = d.toDateString();
    let label: string;
    if (dateStr === todayStr) {
      label = "Today";
    } else if (dateStr === tomorrowStr) {
      label = "Tomorrow";
    } else {
      label = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    }

    const sortKey = d.toISOString().slice(0, 10);
    if (!map.has(sortKey)) {
      map.set(sortKey, { label, sortKey, fights: [] });
    }
    map.get(sortKey)!.fights.push(f);
  }

  return Array.from(map.values())
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
    .map(g => {
      g.fights.sort((a, b) => {
        const da = new Date(a.event_date!).getTime();
        const db = new Date(b.event_date!).getTime();
        return da - db;
      });
      return g;
    });
}
