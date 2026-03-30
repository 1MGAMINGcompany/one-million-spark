import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GAMMA_BASE = "https://gamma-api.polymarket.com";
const DATA_API_BASE = "https://data-api.polymarket.com";

// ── Safety filters ──

const MORE_MARKETS_RE = /- more markets/i;
const HARD_EXCLUDE_KEYWORDS = [
  "more markets",
  "winning method",
  "method of victory",
  "total rounds",
  "spread",
  "moneyline alt",
];
const PROP_KEYWORDS = [
  "winning method",
  "method of victory",
  "total rounds",
  "spread",
  "moneyline alt",
  "over/under",
  "handicap",
  "ko",
  "knockout",
  "goals",
  "points",
  "rounds",
  "total",
  "margin",
  "first",
  "how many",
  "player props",
  "stoppage",
  "decision",
  "submission",
  // Additional prop/non-matchup keywords
  "over",
  "under",
  "o/u",
  "cba",
  "agreement",
  "by dec",
  "mvp",
  "award",
  "season wins",
  "draft",
  "trade",
  "signed",
  "contract",
  "will they",
  "how many",
  "will .* make",
  "most",
  "top scorer",
  "batting average",
  "home runs",
  "touchdowns",
  "assists",
  "rebounds",
];
const POLITICS_KEYWORDS = [
  "election", "president", "congress", "senate", "vote",
  "democrat", "republican", "political", "legislation",
  "governor", "mayor", "biden", "trump", "politics",
];
const NON_SPORT_KEYWORDS = [
  "season", "winner of", "year",
  "ipo", "bitcoin", "ethereum", "crypto",
  "stock", "recession", "inflation", "gdp",
  "fed rate", "interest rate",
];

/** Normalize team/fighter name for dedup comparison */
function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .replace(/^(the |fc |afc |cf |as |ac |rc |cd |club |sc )/i, "")
    .replace(/ (fc|sc|cf|afc|city|united|rovers|wanderers|athletic)$/i, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}



function hasMatchupPattern(texts: string[]): boolean {
  return texts.some(t => MATCHUP_RE.test(t));
}

function isHardExcluded(text: string): boolean {
  const lower = text.toLowerCase();
  for (const kw of HARD_EXCLUDE_KEYWORDS) {
    if (lower.includes(kw)) return true;
  }
  return false;
}

function isPolitics(text: string): boolean {
  const lower = text.toLowerCase();
  return POLITICS_KEYWORDS.some(kw => lower.includes(kw));
}

/**
 * Payload-aware fixture detection.
 * Checks event title, slug, AND child market questions for matchup patterns.
 * Only hard-excludes explicit prop keywords and politics.
 */
function isNonSport(text: string): boolean {
  const lower = text.toLowerCase();
  return NON_SPORT_KEYWORDS.some(kw => lower.includes(kw));
}

/**
 * Check if startDate is more than 30 days in the future (long-term market).
 */
function isTooFarOut(ev: GammaEvent): boolean {
  const timeInfo = chooseSportsDisplayTime(ev);
  const startMs = timeInfo.chosen ? new Date(timeInfo.chosen).getTime() : null;
  if (!startMs || isNaN(startMs)) return false;
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  return startMs > Date.now() + thirtyDaysMs;
}

/**
 * Payload-aware fixture detection.
 * Checks event title, slug, AND child market questions for matchup patterns.
 * Rejects politics, non-sport keywords, and long-term futures.
 */
function isAcceptableEvent(ev: GammaEvent, hasTagFilter: boolean = false): { accepted: boolean; reason: string } {
  const title = ev.title || "";

  if (isHardExcluded(title)) return { accepted: false, reason: `hard_exclude_title: "${title}"` };
  if (MORE_MARKETS_RE.test(title)) return { accepted: false, reason: `more_markets: "${title}"` };
  if (isPolitics(title)) return { accepted: false, reason: `politics: "${title}"` };
  if (isNonSport(title)) return { accepted: false, reason: `non_sport: "${title}"` };
  if (isTooFarOut(ev)) return { accepted: false, reason: `too_far_out (>30d): startDate=${ev.startDate}` };

  const textsToCheck = [title, (ev.slug || "").replace(/-/g, " ")];
  const markets = ev.markets || [];
  for (const m of markets.slice(0, 10)) {
    if (m.question) textsToCheck.push(m.question);
    if (m.groupItemTitle) textsToCheck.push(m.groupItemTitle);
  }

  if (hasMatchupPattern(textsToCheck)) {
    return { accepted: true, reason: "matchup_found" };
  }

  // Accept combat card events (UFC 315, BKFC 78, etc.) if child markets have matchups
  const combatCardRe = /\b(UFC|BKFC|PFL|Bellator|ONE)\s*\d/i;
  if (combatCardRe.test(title)) {
    const marketTexts = markets.map(m => m.question || m.groupItemTitle || "");
    if (hasMatchupPattern(marketTexts)) {
      return { accepted: true, reason: "combat_card_with_matchup_markets" };
    }
    return { accepted: true, reason: "combat_card_event" };
  }

  // Reject futures/outright/prop markets before binary fallback
  const FUTURES_RE = /\b(who will .* (fight|face) next|top scorer|mvp|most valuable|champion at|will .* win the)\b|winner$/i;
  if (FUTURES_RE.test(title)) return { accepted: false, reason: `futures_market: "${title}"` };

  // If no tag filter is provided (browse_all/search), require matchup pattern — don't accept random binary markets
  if (!hasTagFilter) {
    return { accepted: false, reason: `no_matchup_no_tag: "${title}"` };
  }

  // Accept events with binary (2-outcome) markets when browsing within a known sport tag
  const hasBinaryMarket = markets.some(m => {
    try {
      const outcomes = JSON.parse(m.outcomes || "[]");
      return outcomes.length === 2 && !m.closed;
    } catch { return false; }
  });
  if (hasBinaryMarket) {
    return { accepted: true, reason: "binary_market_detected" };
  }

  return { accepted: false, reason: `no_matchup_pattern_in_any_field` };
}

function isDateEligible(ev: GammaEvent): { eligible: boolean; reason: string; missingDate: boolean } {
  // Use sports-aware timestamp priority
  const timeInfo = chooseSportsDisplayTime(ev);
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;

  const chosenMs = timeInfo.chosen ? new Date(timeInfo.chosen).getTime() : null;

  if (chosenMs && !isNaN(chosenMs)) {
    if (chosenMs >= cutoff) return { eligible: true, reason: `future_${timeInfo.field}`, missingDate: false };
    return { eligible: false, reason: `past_${timeInfo.field}: ${timeInfo.chosen}`, missingDate: false };
  }

  // No usable date at all — fall back to endDate
  const endMs = ev.endDate ? new Date(ev.endDate).getTime() : null;
  if (endMs && !isNaN(endMs)) {
    if (endMs >= cutoff) return { eligible: true, reason: "future_end_no_start", missingDate: false };
    return { eligible: false, reason: `past_end: ${ev.endDate}`, missingDate: false };
  }

  return { eligible: false, reason: "no_event_date", missingDate: true };
}

// ── Curated league/category config ──

type FetchStrategy = "tag" | "series" | "search";

interface LeagueSource {
  key: string;
  label: string;
  sportType: "soccer" | "mma" | "boxing" | "bkfc" | "nfl" | "nba" | "nhl" | "ncaa" | "mlb" | "tennis" | "golf" | "cricket" | "f1" | "rugby";
  fetchStrategy: FetchStrategy;
  tagId?: string;
  tagSlug?: string;
  seriesId?: string;
  /** For search-based discovery, append these keywords */
  searchSeed?: string[];
}

const LEAGUE_SOURCES: Record<string, LeagueSource> = {
  // ─── Soccer (tag-based) ───
  "epl":                { key: "epl",                label: "EPL",                sportType: "soccer", fetchStrategy: "tag", tagId: "306" },
  "mls":                { key: "mls",                label: "MLS",                sportType: "soccer", fetchStrategy: "tag", tagId: "100100" },
  "ucl":                { key: "ucl",                label: "UCL",                sportType: "soccer", fetchStrategy: "tag", tagId: "100977" },
  "uel":                { key: "uel",                label: "UEL",                sportType: "soccer", fetchStrategy: "tag", tagId: "101787" },
  "la-liga":            { key: "la-liga",            label: "La Liga",            sportType: "soccer", fetchStrategy: "tag", tagId: "780" },
  "bundesliga":         { key: "bundesliga",         label: "Bundesliga",         sportType: "soccer", fetchStrategy: "tag", tagId: "1494" },
  "serie-a":            { key: "serie-a",            label: "Serie A",            sportType: "soccer", fetchStrategy: "tag", tagId: "102008" },
  "ligue-1":            { key: "ligue-1",            label: "Ligue 1",            sportType: "soccer", fetchStrategy: "tag", tagId: "102070" },
  "liga-mx":            { key: "liga-mx",            label: "Liga MX",            sportType: "soccer", fetchStrategy: "tag", tagId: "102448" },
  "eredivisie":         { key: "eredivisie",         label: "Eredivisie",         sportType: "soccer", fetchStrategy: "tag", tagId: "101735" },
  "fifa-friendlies":    { key: "fifa-friendlies",    label: "FIFA Friendlies",    sportType: "soccer", fetchStrategy: "tag", tagId: "102539" },
  "copa-libertadores":  { key: "copa-libertadores",  label: "Copa Libertadores",  sportType: "soccer", fetchStrategy: "tag", tagId: "102562" },
  "copa-sudamericana":  { key: "copa-sudamericana",  label: "Copa Sudamericana",  sportType: "soccer", fetchStrategy: "tag", tagId: "102563" },
  "brazil-serie-a":     { key: "brazil-serie-a",     label: "Brazil Série A",     sportType: "soccer", fetchStrategy: "tag", tagId: "102648" },
  "j-league":           { key: "j-league",           label: "J. League",          sportType: "soccer", fetchStrategy: "tag", tagId: "102649" },
  "k-league":           { key: "k-league",           label: "K-League",           sportType: "soccer", fetchStrategy: "tag", tagId: "102771" },
  "a-league":           { key: "a-league",           label: "A-League",           sportType: "soccer", fetchStrategy: "tag", tagId: "102765" },
  "super-lig":          { key: "super-lig",          label: "Süper Lig",          sportType: "soccer", fetchStrategy: "tag", tagId: "102564" },
  "primeira-liga":      { key: "primeira-liga",      label: "Primeira Liga",      sportType: "soccer", fetchStrategy: "tag", tagId: "101772" },
  "concacaf":           { key: "concacaf",           label: "CONCACAF",           sportType: "soccer", fetchStrategy: "tag", tagId: "100787" },
  "conmebol":           { key: "conmebol",           label: "CONMEBOL",           sportType: "soccer", fetchStrategy: "tag", tagId: "101280" },
  // ─── Combat (search-seeded — Polymarket combat tags are unreliable) ───
  // ─── Combat (search-seeded — Polymarket combat tags are unreliable) ───
  "ufc":    { key: "ufc",    label: "UFC",    sportType: "mma",    fetchStrategy: "search", searchSeed: ["UFC vs", "UFC Fight Night", "UFC"] },
  "mma":    { key: "mma",    label: "MMA",    sportType: "mma",    fetchStrategy: "search", searchSeed: ["MMA vs", "MMA fight", "UFC vs"] },
  "boxing": { key: "boxing", label: "Boxing", sportType: "boxing", fetchStrategy: "search", searchSeed: ["boxing vs", "WBC", "WBA", "IBF title", "boxing match"] },
  "bkfc":   { key: "bkfc",   label: "BKFC",   sportType: "bkfc",   fetchStrategy: "search", searchSeed: ["BKFC", "bare knuckle"] },
  // ─── American Sports ───
  "nfl":    { key: "nfl",    label: "NFL",    sportType: "nfl",    fetchStrategy: "tag", tagId: "450" },
  "nba":    { key: "nba",    label: "NBA",    sportType: "nba",    fetchStrategy: "tag", tagId: "745" },
  "ncaab":  { key: "ncaab",  label: "NCAA Basketball", sportType: "ncaa", fetchStrategy: "tag", tagId: "100149" },
  "cfb":    { key: "cfb",    label: "NCAA Football",   sportType: "ncaa", fetchStrategy: "tag", tagId: "100351" },
  "nhl":    { key: "nhl",    label: "NHL",    sportType: "nhl",    fetchStrategy: "tag", tagId: "899" },
  "mlb":    { key: "mlb",    label: "MLB",    sportType: "mlb",    fetchStrategy: "tag", tagId: "100381" },
  "wnba":   { key: "wnba",   label: "WNBA",   sportType: "nba",    fetchStrategy: "tag", tagId: "100254" },
  // ─── Tennis ───
  "atp":    { key: "atp",    label: "ATP",    sportType: "tennis", fetchStrategy: "tag", tagId: "101232" },
  "wta":    { key: "wta",    label: "WTA",    sportType: "tennis", fetchStrategy: "tag", tagId: "102123" },
  "tennis":        { key: "tennis",        label: "Tennis",        sportType: "tennis", fetchStrategy: "search", searchSeed: ["ATP vs", "WTA vs", "Wimbledon", "US Open vs", "Roland Garros vs", "Australian Open vs", "tennis vs"] },
  "tennis-atp":    { key: "tennis-atp",    label: "Tennis ATP",    sportType: "tennis", fetchStrategy: "search", searchSeed: ["ATP vs", "ATP Tour"] },
  "tennis-wta":    { key: "tennis-wta",    label: "Tennis WTA",    sportType: "tennis", fetchStrategy: "search", searchSeed: ["WTA vs", "WTA Tour"] },
  "tennis-grand-slam": { key: "tennis-grand-slam", label: "Grand Slams", sportType: "tennis", fetchStrategy: "search", searchSeed: ["Wimbledon", "US Open vs", "Roland Garros vs", "Australian Open vs"] },
  // ─── Golf ───
  "golf":   { key: "golf",   label: "Golf",   sportType: "golf",   fetchStrategy: "search", searchSeed: ["PGA", "golf", "PGA Tour", "Masters golf"] },
  // ─── Motorsport ───
  "f1":     { key: "f1",     label: "Formula 1", sportType: "f1", fetchStrategy: "search", searchSeed: ["Formula 1 Grand Prix", "F1 vs", "Grand Prix winner"] },
  // ─── Cricket ───
  "cricket":       { key: "cricket",       label: "Cricket",       sportType: "cricket", fetchStrategy: "search", searchSeed: ["Indian Premier League", "IPL vs", "PSL vs", "cricket vs", "T20 cricket vs"] },
  "cricket-ipl":   { key: "cricket-ipl",   label: "IPL",           sportType: "cricket", fetchStrategy: "search", searchSeed: ["Indian Premier League", "IPL vs", "IPL 2026"] },
  "cricket-psl":   { key: "cricket-psl",   label: "PSL",           sportType: "cricket", fetchStrategy: "search", searchSeed: ["Pakistan Super League", "PSL vs"] },
  "cricket-intl":  { key: "cricket-intl",  label: "Cricket Intl",  sportType: "cricket", fetchStrategy: "search", searchSeed: ["cricket international", "cricket vs", "T20 international"] },
  // ─── Rugby ───
  "rugby":    { key: "rugby",    label: "Rugby",    sportType: "rugby", fetchStrategy: "search", searchSeed: ["rugby vs", "Six Nations", "rugby union"] },
  // ─── Other ───
  "table-tennis": { key: "table-tennis", label: "Table Tennis", sportType: "tennis", fetchStrategy: "search", searchSeed: ["table tennis", "ping pong"] },
};

// Slug → league key mapping for URL parsing
const SPORTS_SLUG_MAP: Record<string, string> = {};
for (const [key, cfg] of Object.entries(LEAGUE_SOURCES)) {
  SPORTS_SLUG_MAP[key] = key;
  SPORTS_SLUG_MAP[cfg.label.toLowerCase().replace(/\s+/g, "-")] = key;
}
// Extra aliases
SPORTS_SLUG_MAP["premier-league"] = "epl";
SPORTS_SLUG_MAP["champions-league"] = "ucl";
SPORTS_SLUG_MAP["europa-league"] = "uel";
SPORTS_SLUG_MAP["ncaa-basketball"] = "ncaab";
SPORTS_SLUG_MAP["college-football"] = "cfb";
SPORTS_SLUG_MAP["pga"] = "golf";

// ── API helpers ──

interface GammaMarket {
  id: string;
  question: string;
  conditionId: string;
  slug: string;
  outcomes: string;
  outcomePrices: string;
  clobTokenIds: string;
  active: boolean;
  closed: boolean;
  endDate: string | null;
  volume: string;
  liquidity: string;
  image: string | null;
  icon: string | null;
  description: string;
  fee: string;
  groupItemTitle?: string;
  enableOrderBook: boolean;
}

interface GammaMarketExt extends GammaMarket {
  eventStartTime?: string | null;
  gameStartTime?: string | null;
}

interface GammaEvent {
  id: string;
  title: string;
  slug: string;
  ticker?: string;
  description: string;
  startDate: string | null;
  endDate: string | null;
  startTime?: string | null;
  eventDate?: string | null;
  closed?: boolean;
  active?: boolean;
  live?: boolean;
  ended?: boolean;
  markets: GammaMarketExt[];
  tags?: { label: string; slug: string }[];
  series?: any;
}

/** 
 * Choose the best sports display timestamp in priority order:
 * 1) event.startTime  2) event.eventDate  3) first market.eventStartTime  4) event.startDate
 */
function chooseSportsDisplayTime(ev: GammaEvent): { chosen: string | null; field: string; all: Record<string, string | null> } {
  const firstMarketEventStart = (ev.markets || []).find(m => (m as any).eventStartTime)?.eventStartTime || null;
  const firstMarketGameStart = (ev.markets || []).find(m => (m as any).gameStartTime)?.gameStartTime || null;
  
  const all: Record<string, string | null> = {
    startTime: (ev as any).startTime || null,
    eventDate: (ev as any).eventDate || null,
    "market.eventStartTime": firstMarketEventStart,
    "market.gameStartTime": firstMarketGameStart,
    startDate: ev.startDate,
    endDate: ev.endDate,
  };
  
  if (all.startTime) return { chosen: all.startTime, field: "startTime", all };
  if (all.eventDate) return { chosen: all.eventDate, field: "eventDate", all };
  if (firstMarketEventStart) return { chosen: firstMarketEventStart, field: "market.eventStartTime", all };
  if (firstMarketGameStart) return { chosen: firstMarketGameStart, field: "market.gameStartTime", all };
  if (ev.startDate) return { chosen: ev.startDate, field: "startDate", all };
  return { chosen: null, field: "none", all };
}

// ── Telemetry ──

interface QueryTelemetry {
  mode: string;
  strategy: string;
  endpoints_called: string[];
  raw_count: number;
  filtered_count: number;
  zero_reason?: string;
  league_key?: string;
  query?: string;
  duration_ms: number;
}

function buildTelemetry(partial: Partial<QueryTelemetry>): QueryTelemetry {
  return {
    mode: partial.mode || "unknown",
    strategy: partial.strategy || "unknown",
    endpoints_called: partial.endpoints_called || [],
    raw_count: partial.raw_count || 0,
    filtered_count: partial.filtered_count || 0,
    zero_reason: partial.zero_reason,
    league_key: partial.league_key,
    query: partial.query,
    duration_ms: partial.duration_ms || 0,
  };
}

// ── Fetch functions ──

/** Fetch events by tag_id — reliable for soccer league discovery. Supports pagination up to 500 events. */
async function fetchEventsByTagId(tagId: string, limit = 100): Promise<GammaEvent[]> {
  const allEvents: GammaEvent[] = [];
  const seen = new Set<string>();
  let offset = 0;
  const maxPages = 5; // up to 500 events
  
  for (let page = 0; page < maxPages; page++) {
    try {
      const url = `${GAMMA_BASE}/events?tag_id=${tagId}&closed=false&upcoming=true&limit=${limit}&offset=${offset}&order=startDate&ascending=true`;
      const res = await fetch(url);
      if (!res.ok) break;
      const data = await res.json();
      const events: GammaEvent[] = Array.isArray(data) ? data : [];
      if (events.length === 0) break;
      
      for (const ev of events) {
        if (!seen.has(String(ev.id))) {
          seen.add(String(ev.id));
          allEvents.push(ev);
        }
      }
      
      if (events.length < limit) break; // no more pages
      offset += limit;
    } catch {
      break;
    }
  }
  
  return allEvents;
}

/** Fetch ALL active events from Gamma (no tag filter) with pagination */
async function fetchAllActiveEvents(limit = 50, offset = 0): Promise<GammaEvent[]> {
  try {
    const url = `${GAMMA_BASE}/events?closed=false&upcoming=true&limit=${limit}&offset=${offset}&order=startDate&ascending=true`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** Fetch sports metadata from Gamma */
async function fetchSports(): Promise<any[]> {
  try {
    const res = await fetch(`${GAMMA_BASE}/sports`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** Search via /public-search — for exact fixture names only */
async function fetchSearchEvents(queries: string[], limit = 100): Promise<GammaEvent[]> {
  const seen = new Set<string>();
  const deduped: GammaEvent[] = [];
  for (const q of queries) {
    try {
      const url = `${GAMMA_BASE}/public-search?q=${encodeURIComponent(q)}&limit=${limit}`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      const events: GammaEvent[] = data.events || [];
      for (const ev of events) {
        if (!seen.has(String(ev.id))) {
          seen.add(String(ev.id));
          deduped.push(ev);
        }
      }
    } catch {
      continue;
    }
  }
  return deduped;
}

/** Fetch by slug — for /event/{slug} URLs */
async function fetchEventBySlug(slug: string): Promise<GammaEvent | null> {
  try {
    const res = await fetch(`${GAMMA_BASE}/events?slug=${encodeURIComponent(slug)}`);
    if (!res.ok) return null;
    const data = await res.json();
    const events: GammaEvent[] = Array.isArray(data) ? data : [data];
    return events[0] || null;
  } catch {
    return null;
  }
}

/** Fetch by event ID */
async function fetchEventById(id: string): Promise<GammaEvent | null> {
  try {
    const res = await fetch(`${GAMMA_BASE}/events/${id}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Fetch trade volume from Data API for enrichment */
async function fetchMarketVolume(marketId: string): Promise<{ volume: number; tradeCount: number } | null> {
  try {
    const res = await fetch(`${DATA_API_BASE}/activity?market=${marketId}&limit=1`);
    if (!res.ok) return null;
    const data = await res.json();
    return {
      volume: parseFloat(data?.volume || "0"),
      tradeCount: parseInt(data?.tradeCount || "0", 10),
    };
  } catch {
    return null;
  }
}

/** Execute the fetch strategy for a league source */
async function fetchByLeagueSource(src: LeagueSource): Promise<{ events: GammaEvent[]; endpoints: string[] }> {
  const endpoints: string[] = [];

  if (src.fetchStrategy === "tag" && src.tagId) {
    endpoints.push(`events?tag_id=${src.tagId}`);
    const events = await fetchEventsByTagId(src.tagId);
    return { events, endpoints };
  }

  if (src.fetchStrategy === "search" && src.searchSeed) {
    endpoints.push(...src.searchSeed.map(s => `public-search?q=${s}`));
    const events = await fetchSearchEvents(src.searchSeed);
    return { events, endpoints };
  }

  // Fallback: try tag if available, else search by label
  if (src.tagId) {
    endpoints.push(`events?tag_id=${src.tagId}`);
    const events = await fetchEventsByTagId(src.tagId);
    return { events, endpoints };
  }

  endpoints.push(`public-search?q=${src.label}`);
  const events = await fetchSearchEvents([src.label]);
  return { events, endpoints };
}

interface FilterResult {
  accepted: GammaEvent[];
  rejected: { event: GammaEvent; dateReason?: string; fixtureReason?: string }[];
  rawSample: any[];
  debugReport: any[];
}

/** Apply payload-aware safety filters with full rejection logging.
 *  Date filtering is ALWAYS applied. hasTagFilter controls whether binary markets are accepted.
 *  Also includes live events (active=true, closed=false, ended!=true). */
function filterFixtures(events: GammaEvent[], hasTagFilter = false): FilterResult {
  const accepted: GammaEvent[] = [];
  const rejected: FilterResult["rejected"] = [];
  const debugReport: any[] = [];

  // Debug: log raw input
  console.log(`[filterFixtures] raw_count=${events.length}, hasTagFilter=${hasTagFilter}`);
  console.log(`[filterFixtures] first 5 chosen times:`, events.slice(0, 5).map(e => {
    const t = chooseSportsDisplayTime(e);
    return `${e.title?.slice(0,40)} → ${t.field}=${t.chosen}`;
  }));

  // Build raw sample: first 10 events with key fields for debug
  const rawSample = events.slice(0, 10).map(ev => {
    const timeInfo = chooseSportsDisplayTime(ev);
    return {
      id: ev.id,
      title: ev.title,
      slug: ev.slug,
      ticker: ev.ticker,
      chosen_display_time: timeInfo.chosen,
      chosen_field: timeInfo.field,
      raw_startTime: (ev as any).startTime || null,
      raw_eventDate: (ev as any).eventDate || null,
      raw_market_eventStartTime: timeInfo.all["market.eventStartTime"],
      raw_market_gameStartTime: timeInfo.all["market.gameStartTime"],
      raw_startDate: ev.startDate,
      raw_endDate: ev.endDate,
      active: ev.active,
      closed: ev.closed,
      live: (ev as any).live,
      ended: (ev as any).ended,
      tags: ev.tags?.slice(0, 5),
      series: ev.series,
      market_count: (ev.markets || []).length,
      first_3_markets: (ev.markets || []).slice(0, 3).map(m => ({
        question: m.question,
        groupItemTitle: m.groupItemTitle,
        active: m.active,
        closed: m.closed,
        eventStartTime: (m as any).eventStartTime || null,
        gameStartTime: (m as any).gameStartTime || null,
      })),
    };
  });

  for (const ev of events) {
    const timeInfo = chooseSportsDisplayTime(ev);
    const isLiveEvent = ev.active === true && ev.closed !== true && (ev as any).ended !== true;

    // Date check — ALWAYS applied, but live events bypass date filter
    const dateCheck = isDateEligible(ev);
    if (!dateCheck.eligible && !isLiveEvent) {
      rejected.push({ event: ev, dateReason: dateCheck.reason });
      // Add to debug report (first 10 only)
      if (debugReport.length < 10) {
        debugReport.push({
          title: ev.title,
          chosen_field: timeInfo.field,
          chosen_value: timeInfo.chosen,
          all_timestamps: timeInfo.all,
          accepted: false,
          reason: `date_rejected: ${dateCheck.reason}`,
        });
      }
      continue;
    }

    // Skip closed events (but not live ones)
    if (ev.closed === true && !isLiveEvent) {
      rejected.push({ event: ev, fixtureReason: "closed=true" });
      if (debugReport.length < 10) {
        debugReport.push({
          title: ev.title,
          chosen_field: timeInfo.field,
          chosen_value: timeInfo.chosen,
          all_timestamps: timeInfo.all,
          accepted: false,
          reason: "closed=true",
        });
      }
      continue;
    }

    // Fixture/matchup check — pass hasTagFilter so browse_league can accept binary markets
    const fixtureCheck = isAcceptableEvent(ev, hasTagFilter);
    if (!fixtureCheck.accepted) {
      rejected.push({ event: ev, fixtureReason: fixtureCheck.reason });
      if (debugReport.length < 10) {
        debugReport.push({
          title: ev.title,
          chosen_field: timeInfo.field,
          chosen_value: timeInfo.chosen,
          all_timestamps: timeInfo.all,
          accepted: false,
          reason: `fixture_rejected: ${fixtureCheck.reason}`,
        });
      }
      continue;
    }

    accepted.push(ev);
    if (debugReport.length < 10) {
      debugReport.push({
        title: ev.title,
        chosen_field: timeInfo.field,
        chosen_value: timeInfo.chosen,
        all_timestamps: timeInfo.all,
        accepted: true,
        reason: isLiveEvent ? `live_event + ${fixtureCheck.reason}` : fixtureCheck.reason,
      });
    }
  }

  // Debug: log filter results
  const rejReasons: Record<string, number> = {};
  for (const r of rejected) {
    const reason = r.dateReason || r.fixtureReason || "unknown";
    const key = reason.split(":")[0];
    rejReasons[key] = (rejReasons[key] || 0) + 1;
  }
  console.log(`[filterFixtures] accepted=${accepted.length}, rejected=${rejected.length}, reasons:`, JSON.stringify(rejReasons));

  return { accepted, rejected, rawSample, debugReport };
}

/** Format event for preview response (no DB writes) */
function toPreview(ev: GammaEvent, source: string) {
  const dateInfo = isDateEligible(ev);
  const timeInfo = chooseSportsDisplayTime(ev);
  return {
    id: ev.id,
    title: ev.title,
    slug: ev.slug,
    ticker: ev.ticker,
    startDate: ev.startDate,
    endDate: ev.endDate,
    closed: ev.closed,
    active: ev.active,
    live: (ev as any).live,
    ended: (ev as any).ended,
    source,
    missingDate: dateInfo.missingDate,
    // Sports timestamp debug fields
    chosen_display_time: timeInfo.chosen,
    chosen_field: timeInfo.field,
    raw_startTime: (ev as any).startTime || null,
    raw_eventDate: (ev as any).eventDate || null,
    raw_market_eventStartTime: timeInfo.all["market.eventStartTime"],
    raw_startDate: ev.startDate,
    markets: (ev.markets || []).map(m => ({
      id: m.id,
      question: m.question,
      conditionId: m.conditionId,
      slug: m.slug,
      outcomes: safeJsonParse(m.outcomes),
      outcomePrices: safeJsonParse(m.outcomePrices),
      active: m.active,
      closed: m.closed,
      volume: m.volume,
      eventStartTime: (m as any).eventStartTime || null,
    })),
  };
}

function safeJsonParse(s: string | undefined | null): any[] {
  try { return JSON.parse(s || "[]"); } catch { return []; }
}

/** Check if a query looks like a league/category name rather than a specific fixture */
function isLeagueQuery(query: string): string | null {
  const q = query.toLowerCase().trim().replace(/\s+/g, "-");
  // Direct match
  if (LEAGUE_SOURCES[q]) return q;
  // Label match
  for (const [key, cfg] of Object.entries(LEAGUE_SOURCES)) {
    if (cfg.label.toLowerCase() === query.toLowerCase().trim()) return key;
    if (cfg.label.toLowerCase().replace(/\s+/g, "-") === q) return key;
  }
  // Slug alias match
  if (SPORTS_SLUG_MAP[q]) return SPORTS_SLUG_MAP[q];
  // Partial match (but only if strong)
  for (const [key, cfg] of Object.entries(LEAGUE_SOURCES)) {
    const labelLower = cfg.label.toLowerCase();
    const queryLower = query.toLowerCase().trim();
    if (queryLower === labelLower || labelLower.startsWith(queryLower) && queryLower.length >= 3) return key;
  }
  return null;
}

// ── URL parsing ──

interface ParsedUrl {
  type: "event_slug" | "sports_league_event" | "sports_league_games";
  slug?: string;
  leagueSlug?: string;
  eventSlug?: string;
}

function parsePolymarketUrl(url: string): ParsedUrl | null {
  let path = url.trim().replace(/\?.*$/, "").replace(/#.*$/, "");
  const domainMatch = path.match(/polymarket\.com\/(.+)/);
  if (domainMatch) path = domainMatch[1];
  path = path.replace(/^\/+|\/+$/g, "");

  // /event/{slug}
  const eventMatch = path.match(/^event\/([^/]+)$/);
  if (eventMatch) return { type: "event_slug", slug: eventMatch[1] };

  // /sports/{league-slug}/games
  const leagueGamesMatch = path.match(/^sports\/([^/]+)\/games$/);
  if (leagueGamesMatch) return { type: "sports_league_games", leagueSlug: leagueGamesMatch[1] };

  // /sports/{league-slug}/{event-slug}
  const sportsEventMatch = path.match(/^sports\/([^/]+)\/([^/]+)$/);
  if (sportsEventMatch) return { type: "sports_league_event", leagueSlug: sportsEventMatch[1], eventSlug: sportsEventMatch[2] };

  // /sports/{league-slug} (treat as games)
  const leagueMatch = path.match(/^sports\/([^/]+)$/);
  if (leagueMatch) return { type: "sports_league_games", leagueSlug: leagueMatch[1] };

  // bare slug
  if (path && !path.includes("/")) return { type: "event_slug", slug: path };

  return null;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// ── Import helper (shared by all modes) ──

const SPORT_TYPE_TO_CATEGORY: Record<string, string> = {
  soccer: "FUTBOL",
  mma: "MMA",
  boxing: "BOXING",
  bkfc: "BARE KNUCKLE",
  nfl: "NFL",
  nba: "NBA",
  ncaa: "NCAA",
  nhl: "NHL",
  mlb: "MLB",
  tennis: "TENNIS",
  golf: "GOLF",
  cricket: "CRICKET",
  f1: "F1",
  rugby: "RUGBY",
};

/** Country name → ISO 3166-1 alpha-2 code for flag CDN */
const COUNTRY_CODE_MAP: Record<string, string> = {
  "south africa": "za", "panama": "pa", "brazil": "br", "argentina": "ar",
  "mexico": "mx", "united states": "us", "usa": "us", "canada": "ca",
  "england": "gb-eng", "france": "fr", "germany": "de", "spain": "es",
  "italy": "it", "portugal": "pt", "netherlands": "nl", "belgium": "be",
  "croatia": "hr", "denmark": "dk", "sweden": "se", "norway": "no",
  "switzerland": "ch", "austria": "at", "poland": "pl", "czech republic": "cz",
  "czechia": "cz", "turkey": "tr", "greece": "gr", "scotland": "gb-sct",
  "wales": "gb-wls", "ireland": "ie", "japan": "jp", "south korea": "kr",
  "korea republic": "kr", "australia": "au", "new zealand": "nz",
  "china": "cn", "india": "in", "saudi arabia": "sa", "qatar": "qa",
  "uae": "ae", "united arab emirates": "ae", "iran": "ir", "iraq": "iq",
  "egypt": "eg", "morocco": "ma", "nigeria": "ng", "ghana": "gh",
  "cameroon": "cm", "senegal": "sn", "tunisia": "tn", "algeria": "dz",
  "colombia": "co", "chile": "cl", "uruguay": "uy", "peru": "pe",
  "ecuador": "ec", "venezuela": "ve", "paraguay": "py", "bolivia": "bo",
  "costa rica": "cr", "honduras": "hn", "jamaica": "jm", "trinidad and tobago": "tt",
  "guatemala": "gt", "el salvador": "sv", "cuba": "cu",
  "russia": "ru", "ukraine": "ua", "romania": "ro", "serbia": "rs",
  "hungary": "hu", "bulgaria": "bg", "slovakia": "sk", "slovenia": "si",
  "bosnia and herzegovina": "ba", "north macedonia": "mk", "montenegro": "me",
  "albania": "al", "iceland": "is", "finland": "fi", "latvia": "lv",
  "lithuania": "lt", "estonia": "ee", "georgia": "ge", "armenia": "am",
  "uzbekistan": "uz", "thailand": "th", "vietnam": "vn", "indonesia": "id",
  "malaysia": "my", "philippines": "ph", "singapore": "sg",
  "ivory coast": "ci", "cote d'ivoire": "ci", "dr congo": "cd",
  "congo": "cg", "mali": "ml", "burkina faso": "bf", "zimbabwe": "zw",
  "zambia": "zm", "kenya": "ke", "tanzania": "tz", "mozambique": "mz",
  "angola": "ao", "ethiopia": "et", "uganda": "ug", "cape verde": "cv",
  "haiti": "ht", "dominican republic": "do", "curacao": "cw",
  "bermuda": "bm", "suriname": "sr", "guyana": "gy",
  "wales": "gb-wls", "northern ireland": "gb-nir",
};

function resolveCountryFlag(name: string): string | null {
  const code = COUNTRY_CODE_MAP[name.toLowerCase().trim()];
  if (!code) return null;
  return `https://flagcdn.com/w80/${code}.png`;
}

async function importSingleEvent(
  supabase: any,
  gEvent: GammaEvent,
  wallet: string | null,
  importSource: string,
  sportType?: string | null,
  visibility?: string | null,
): Promise<{ event_id: string; imported: number; is_past: boolean; warning?: string }> {
  const timeInfo = chooseSportsDisplayTime(gEvent);
  const chosenMs = timeInfo.chosen ? new Date(timeInfo.chosen).getTime() : null;
  const isPastEvent = chosenMs !== null && chosenMs < Date.now();

  const category = sportType ? (SPORT_TYPE_TO_CATEGORY[sportType] || null) : null;

  const { data: existingEvt } = await supabase
    .from("prediction_events")
    .select("id, category")
    .eq("polymarket_event_id", String(gEvent.id))
    .maybeSingle();

  let eventId: string;
  if (existingEvt) {
    eventId = existingEvt.id;
    // Backfill category if currently null
    if (category && !existingEvt.category) {
      await supabase.from("prediction_events").update({ category }).eq("id", existingEvt.id);
    }
  } else {
    const { data: newEvt, error } = await supabase
      .from("prediction_events")
      .insert({
        event_name: gEvent.title,
        polymarket_event_id: String(gEvent.id),
        polymarket_slug: gEvent.slug,
        event_date: timeInfo.chosen || gEvent.startDate || gEvent.endDate || null,
        source: "polymarket",
        source_provider: "polymarket",
        source_event_id: `pm_${gEvent.id}`,
        status: "pending_review",
        ...(category ? { category } : {}),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    eventId = newEvt!.id;
  }

  let imported = 0;
  for (const market of (gEvent.markets || [])) {
    let outcomes: string[], tokenIds: string[], outcomePrices: string[];
    try {
      outcomes = JSON.parse(market.outcomes || "[]");
      outcomePrices = JSON.parse(market.outcomePrices || "[]");
      tokenIds = JSON.parse(market.clobTokenIds || "[]");
    } catch { continue; }

    // Reject markets with more than 3 outcomes (prop markets)
    if (outcomes.length > 3) continue;
    if (outcomes.length < 2 || tokenIds.length < 2) continue;

    // Skip prop/more-markets at market level
    const mq = (market.question || "").toLowerCase();
    if (MORE_MARKETS_RE.test(mq)) continue;
    let skipMarket = false;
    for (const pk of PROP_KEYWORDS) {
      if (mq.includes(pk)) { skipMarket = true; break; }
    }
    if (skipMarket) continue;

    // Reject already-settled markets (0%/100% probability)
    const priceA = parseFloat(outcomePrices[0] || "0");
    const priceB = parseFloat(outcomePrices[1] || "0");
    if ((priceA <= 0.01 && priceB >= 0.99) || (priceB <= 0.01 && priceA >= 0.99)) continue;

    // Dedup: skip if conditionId already exists in prediction_fights
    const { data: existingByCondition } = await supabase
      .from("prediction_fights")
      .select("id")
      .eq("polymarket_condition_id", market.conditionId)
      .maybeSingle();
    if (existingByCondition) { imported++; continue; }

    // Dedup: title-only match (case-insensitive, whitespace-stripped)
    const candidateTitle = (market.groupItemTitle || market.question || "").trim();
    const normalizedTitle = candidateTitle.toLowerCase().replace(/\s+/g, "");
    if (normalizedTitle.length > 3) {
      const { data: titleMatch } = await supabase
        .from("prediction_fights")
        .select("id")
        .filter("title", "ilike", candidateTitle)
        .limit(1);
      if (titleMatch && titleMatch.length > 0) { imported++; continue; }
    }

    // Dedup: normalized team names + event_date
    const candA = normalizeTeamName(outcomes[0]);
    const candB = normalizeTeamName(outcomes[1]);
    const candDate = timeInfo.chosen || gEvent.startDate || null;
    if (candA && candB && candDate) {
      const dateStr = new Date(candDate).toISOString().slice(0, 10);
      // Query fights with same date, then check normalized names in-memory
      const { data: sameDateFights } = await supabase
        .from("prediction_fights")
        .select("id, fighter_a_name, fighter_b_name")
        .gte("event_date", `${dateStr}T00:00:00Z`)
        .lte("event_date", `${dateStr}T23:59:59Z`)
        .limit(200);
      if (sameDateFights && sameDateFights.length > 0) {
        const matchupExists = sameDateFights.some((f: any) => {
          const nA = normalizeTeamName(f.fighter_a_name);
          const nB = normalizeTeamName(f.fighter_b_name);
          return (nA === candA && nB === candB) || (nA === candB && nB === candA);
        });
        if (matchupExists) { imported++; continue; }
      }
    }

    const { data: existingFight } = await supabase
      .from("prediction_fights")
      .select("id")
      .eq("polymarket_market_id", market.id)
      .maybeSingle();

    if (existingFight) {
      const updatePayload: Record<string, unknown> = {
        price_a: parseFloat(outcomePrices[0] || "0"),
        price_b: parseFloat(outcomePrices[1] || "0"),
        polymarket_active: market.active && !market.closed,
        polymarket_last_synced_at: new Date().toISOString(),
      };
      // Backfill volume + liquidity on re-sync
      const volUsd = parseFloat(market.volume || "0");
      if (volUsd > 0) updatePayload.polymarket_volume_usd = volUsd;
      const liq = parseFloat(market.liquidity || "0");
      if (liq > 0) updatePayload.polymarket_liquidity = liq;
      // Backfill logos if missing — resolve country flags for soccer events
      if (sportType === "FUTBOL" || (gEvent.title && /vs\.?\s/i.test(gEvent.title))) {
        const flagMatch = gEvent.title.match(/^(.+?)\s+vs\.?\s+(.+)$/i);
        if (flagMatch) {
          const COUNTRY_FLAGS: Record<string, string> = {
            "south africa": "za", "panama": "pa", "mexico": "mx", "usa": "us",
            "united states": "us", "brazil": "br", "argentina": "ar", "germany": "de",
            "france": "fr", "spain": "es", "england": "gb-eng", "italy": "it",
            "portugal": "pt", "netherlands": "nl", "belgium": "be", "colombia": "co",
            "uruguay": "uy", "chile": "cl", "peru": "pe", "ecuador": "ec",
            "japan": "jp", "south korea": "kr", "australia": "au", "canada": "ca",
            "costa rica": "cr", "honduras": "hn", "jamaica": "jm", "trinidad and tobago": "tt",
            "egypt": "eg", "nigeria": "ng", "senegal": "sn", "morocco": "ma",
            "ghana": "gh", "cameroon": "cm", "tunisia": "tn", "algeria": "dz",
            "croatia": "hr", "serbia": "rs", "switzerland": "ch", "denmark": "dk",
            "sweden": "se", "norway": "no", "poland": "pl", "czech republic": "cz",
            "austria": "at", "turkey": "tr", "greece": "gr", "romania": "ro",
            "ukraine": "ua", "russia": "ru", "wales": "gb-wls", "scotland": "gb-sct",
            "ireland": "ie", "iceland": "is", "finland": "fi", "hungary": "hu",
            "paraguay": "py", "bolivia": "bo", "venezuela": "ve", "china": "cn",
            "india": "in", "iran": "ir", "iraq": "iq", "saudi arabia": "sa",
            "qatar": "qa", "uae": "ae", "israel": "il", "new zealand": "nz",
          };
          const homeCode = COUNTRY_FLAGS[flagMatch[1].trim().toLowerCase()];
          const awayCode = COUNTRY_FLAGS[flagMatch[2].trim().toLowerCase()];
          if (homeCode) updatePayload.home_logo = `https://flagcdn.com/w80/${homeCode}.png`;
          if (awayCode) updatePayload.away_logo = `https://flagcdn.com/w80/${awayCode}.png`;
        }
      }
      await supabase.from("prediction_fights").update(updatePayload).eq("id", existingFight.id);
    } else {
      let volumeUsd = parseFloat(market.volume || "0");
      try {
        const dataApiVol = await fetchMarketVolume(market.id);
        if (dataApiVol && dataApiVol.volume > volumeUsd) {
          volumeUsd = dataApiVol.volume;
        }
      } catch { /* non-fatal */ }

      const fightVisibility = visibility || "all";

      await supabase.from("prediction_fights").insert({
        title: market.groupItemTitle || market.question,
        fighter_a_name: outcomes[0],
        fighter_b_name: outcomes[1],
        event_name: gEvent.title,
        event_id: eventId,
        source: "polymarket",
        commission_bps: 200,
        polymarket_market_id: market.id,
        polymarket_condition_id: market.conditionId,
        polymarket_slug: market.slug,
        polymarket_outcome_a_token: tokenIds[0],
        polymarket_outcome_b_token: tokenIds[1],
        polymarket_active: market.active && !market.closed,
        polymarket_end_date: market.endDate || null,
        polymarket_question: market.question,
        polymarket_last_synced_at: new Date().toISOString(),
        polymarket_volume_usd: volumeUsd > 0 ? volumeUsd : null,
        price_a: parseFloat(outcomePrices[0] || "0"),
        price_b: parseFloat(outcomePrices[1] || "0"),
        status: "open",
        visibility: fightVisibility,
        event_date: timeInfo.chosen || gEvent.startDate || null,
      });
    }
    imported++;
  }

  // Resolve country flags for soccer events
  if (sportType === "soccer" || category === "FUTBOL") {
    try {
      const vsMatch = gEvent.title.match(/^(.+?)\s+vs\.?\s+(.+)$/i);
      if (vsMatch) {
        const homeFlag = resolveCountryFlag(vsMatch[1].trim());
        const awayFlag = resolveCountryFlag(vsMatch[2].trim());
        if (homeFlag || awayFlag) {
          const logoUpdate: Record<string, string> = {};
          if (homeFlag) logoUpdate.home_logo = homeFlag;
          if (awayFlag) logoUpdate.away_logo = awayFlag;
          // Update all fights for this event with team logos
          await supabase.from("prediction_fights")
            .update(logoUpdate)
            .eq("event_id", eventId)
            .is("home_logo", null);
        }
      }
    } catch { /* non-fatal flag resolution */ }
  }

  await supabase.from("automation_logs").insert({
    action: `polymarket_import_${importSource}`,
    source: "polymarket-sync",
    admin_wallet: wallet || null,
    details: { polymarket_event_id: gEvent.id, event_name: gEvent.title, imported, is_past: isPastEvent, import_source: importSource },
  });

  return {
    event_id: eventId,
    imported,
    is_past: isPastEvent,
    warning: isPastEvent ? `⚠️ This event's start date (${gEvent.startDate}) is in the past.` : undefined,
  };
}

/** Log admin query telemetry */
async function logTelemetry(supabase: any, wallet: string | null, telemetry: QueryTelemetry) {
  try {
    await supabase.from("automation_logs").insert({
      action: `polymarket_query_${telemetry.mode}`,
      source: "polymarket-sync",
      admin_wallet: wallet || null,
      details: telemetry,
    });
  } catch { /* non-fatal */ }
  console.log(`[polymarket-sync] telemetry:`, JSON.stringify(telemetry));
}

// ══════════════════════════════════════════════════
// MAIN HANDLER
// ══════════════════════════════════════════════════

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const { wallet, action = "search" } = body;

    // ── Admin verification ──
    if (wallet) {
      const { data: admin } = await supabase
        .from("prediction_admins")
        .select("wallet")
        .eq("wallet", wallet)
        .single();
      if (!admin) return json({ error: "Unauthorized" }, 403);
    }

    // ══════════════════════════════════════════════════
    // ACTION: refresh_prices
    // ══════════════════════════════════════════════════
    if (action === "refresh_prices") {
      const { data: pmFights } = await supabase
        .from("prediction_fights")
        .select("id, polymarket_outcome_a_token, polymarket_outcome_b_token, polymarket_market_id")
        .eq("polymarket_active", true)
        .not("polymarket_outcome_a_token", "is", null)
        .in("status", ["open", "locked", "live"]);

      if (!pmFights || pmFights.length === 0) {
        return json({ success: true, updated: 0, message: "No active Polymarket fights" });
      }

      let updated = 0;
      for (const fight of pmFights) {
        try {
          const [buyA, buyB] = await Promise.all([
            fetch(`https://clob.polymarket.com/price?token_id=${fight.polymarket_outcome_a_token}&side=BUY`).then(r => r.json()),
            fetch(`https://clob.polymarket.com/price?token_id=${fight.polymarket_outcome_b_token}&side=BUY`).then(r => r.json()),
          ]);
          const priceA = parseFloat(buyA?.price || "0");
          const priceB = parseFloat(buyB?.price || "0");

          await supabase
            .from("prediction_fights")
            .update({
              price_a: priceA,
              price_b: priceB,
              polymarket_last_synced_at: new Date().toISOString(),
            })
            .eq("id", fight.id);
          updated++;
        } catch (e) {
          console.error(`[polymarket-sync] Price update error for ${fight.id}: ${e}`);
        }
      }
      return json({ success: true, updated, total: pmFights.length });
    }

    // ══════════════════════════════════════════════════
    // ACTION: list_leagues — Return curated league configs for dropdown
    // ══════════════════════════════════════════════════
    if (action === "list_leagues") {
      const leagues = Object.entries(LEAGUE_SOURCES).map(([key, v]) => ({
        key,
        label: v.label,
        sportType: v.sportType,
        fetchStrategy: v.fetchStrategy,
      }));
      return json({ leagues });
    }

    // ══════════════════════════════════════════════════
    // ACTION: discover_sports — Fetch sport metadata from Gamma API
    // ══════════════════════════════════════════════════
    if (action === "discover_sports") {
      const sports = await fetchSports();
      return json({ sports, count: sports.length });
    }

    // ══════════════════════════════════════════════════
    // ACTION: browse_all — Fetch ALL active events chronologically
    // ══════════════════════════════════════════════════
    if (action === "browse_all") {
      const startTime = Date.now();
      const offset = body.offset || 0;
      const limit = Math.min(body.limit || 50, 200);
      const rawEvents = await fetchAllActiveEvents(limit, offset);
      const { accepted: results, rejected, rawSample, debugReport } = filterFixtures(rawEvents, false);

      const tel = buildTelemetry({
        mode: "browse_all",
        strategy: "events_feed",
        endpoints_called: [`events?active=true&closed=false&limit=${limit}&offset=${offset}`],
        raw_count: rawEvents.length,
        filtered_count: results.length,
        zero_reason: results.length === 0
          ? rawEvents.length === 0 ? "no_events_returned" : `all_${rawEvents.length}_rejected_by_filters`
          : undefined,
        duration_ms: Date.now() - startTime,
      });
      await logTelemetry(supabase, wallet, tel);

      return json({
        results: results.map(e => toPreview(e, "browse_all")),
        raw_sample: rawSample,
        debug_report: debugReport,
        rejection_sample: rejected.slice(0, 5).map(r => ({ title: r.event.title, dateReason: r.dateReason, fixtureReason: r.fixtureReason })),
        filter_message: results.length === 0 && rawEvents.length > 0
          ? `Data found from Polymarket (${rawEvents.length} events), but local filters rejected all results.`
          : undefined,
        has_more: rawEvents.length >= limit,
        offset,
        limit,
        telemetry: tel,
      });
    }

    // ══════════════════════════════════════════════════
    // MODE 1: url_preview — Parse URL, fetch, return preview
    // ══════════════════════════════════════════════════
    if (action === "url_preview") {
      const startTime = Date.now();
      const { url } = body;
      if (!url || typeof url !== "string") return json({ error: "Missing url" }, 400);

      const parsed = parsePolymarketUrl(url);
      if (!parsed) return json({ error: "Could not parse URL. Supported formats: /event/{slug}, /sports/{league}/games, /sports/{league}/{event}" }, 400);

      let rawResults: GammaEvent[] = [];
      let highlightSlug: string | null = null;
      let detectedSportType: string | null = null;
      const endpoints: string[] = [];
      let mode = parsed.type;

      if (parsed.type === "event_slug") {
        endpoints.push(`events?slug=${parsed.slug}`);
        const ev = await fetchEventBySlug(parsed.slug!);
        if (ev) rawResults = [ev];
        else {
          const tel = buildTelemetry({ mode: "url", strategy: "slug", endpoints_called: endpoints, raw_count: 0, filtered_count: 0, zero_reason: `slug_not_found: ${parsed.slug}`, duration_ms: Date.now() - startTime });
          await logTelemetry(supabase, wallet, tel);
          return json({ error: `Event not found for slug: ${parsed.slug}`, telemetry: tel }, 404);
        }
      } else if (parsed.type === "sports_league_games") {
        const leagueKey = SPORTS_SLUG_MAP[parsed.leagueSlug!] || parsed.leagueSlug!;
        const cfg = LEAGUE_SOURCES[leagueKey];
        if (cfg) {
          detectedSportType = cfg.sportType;
          const fetched = await fetchByLeagueSource(cfg);
          rawResults = fetched.events;
          endpoints.push(...fetched.endpoints);
        } else {
          const tel = buildTelemetry({ mode: "url", strategy: "league_games", endpoints_called: [], raw_count: 0, filtered_count: 0, zero_reason: `unknown_league: ${parsed.leagueSlug}`, duration_ms: Date.now() - startTime });
          await logTelemetry(supabase, wallet, tel);
          return json({ error: `Unknown league: ${parsed.leagueSlug}. Use list_leagues for available options.`, telemetry: tel }, 400);
        }
      } else if (parsed.type === "sports_league_event") {
        const leagueKey = SPORTS_SLUG_MAP[parsed.leagueSlug!] || parsed.leagueSlug!;
        const cfg = LEAGUE_SOURCES[leagueKey];

        // Try to fetch exact event by slug first
        endpoints.push(`events?slug=${parsed.eventSlug}`);
        const exactEv = await fetchEventBySlug(parsed.eventSlug!);
        if (exactEv) {
          rawResults = [exactEv];
        } else if (cfg) {
          detectedSportType = cfg.sportType;
          const fetched = await fetchByLeagueSource(cfg);
          rawResults = fetched.events;
          endpoints.push(...fetched.endpoints);
          highlightSlug = parsed.eventSlug!;
        } else {
          const tel = buildTelemetry({ mode: "url", strategy: "league_event", endpoints_called: endpoints, raw_count: 0, filtered_count: 0, zero_reason: `event_not_found_league_unknown: ${parsed.eventSlug}`, duration_ms: Date.now() - startTime });
          await logTelemetry(supabase, wallet, tel);
          return json({ error: `Could not resolve event: ${parsed.eventSlug}`, telemetry: tel }, 404);
        }
      }

      const { accepted: results, rejected, rawSample, debugReport } = filterFixtures(rawResults, false);

      const rejectionSummary = rejected.length > 0
        ? rejected.slice(0, 5).map(r => ({ title: r.event.title, dateReason: r.dateReason, fixtureReason: r.fixtureReason }))
        : [];

      const tel = buildTelemetry({
        mode: "url",
        strategy: String(mode),
        endpoints_called: endpoints,
        raw_count: rawResults.length,
        filtered_count: results.length,
        zero_reason: results.length === 0 && rawResults.length > 0
          ? `all_${rawResults.length}_rejected_by_filters`
          : results.length === 0 ? "no_raw_results" : undefined,
        duration_ms: Date.now() - startTime,
      });
      await logTelemetry(supabase, wallet, tel);

      return json({
        mode,
        highlightSlug,
        sportType: detectedSportType,
        results: results.map(e => toPreview(e, "url_import")),
        raw_sample: rawSample,
        debug_report: debugReport,
        rejection_sample: rejectionSummary,
        filter_message: results.length === 0 && rawResults.length > 0
          ? `Data found from Polymarket (${rawResults.length} events), but local filters rejected all results.`
          : undefined,
        telemetry: tel,
      });
    }

    // ══════════════════════════════════════════════════
    // MODE 2: browse_league — Fetch fixtures for a curated league
    // ══════════════════════════════════════════════════
    if (action === "browse_league") {
      const startTime = Date.now();
      const { league_key } = body;
      if (!league_key || !LEAGUE_SOURCES[league_key]) {
        return json({ error: "Unknown league_key. Use list_leagues to see available keys." }, 400);
      }
      const cfg = LEAGUE_SOURCES[league_key];
      const { events: rawEvents, endpoints } = await fetchByLeagueSource(cfg);
      const { accepted: results, rejected, rawSample, debugReport } = filterFixtures(rawEvents, true);

      const rejectionSummary = rejected.length > 0
        ? rejected.slice(0, 5).map(r => ({ title: r.event.title, dateReason: r.dateReason, fixtureReason: r.fixtureReason }))
        : [];

      const tel = buildTelemetry({
        mode: "browse",
        strategy: cfg.fetchStrategy,
        league_key,
        endpoints_called: endpoints,
        raw_count: rawEvents.length,
        filtered_count: results.length,
        zero_reason: results.length === 0
          ? rawEvents.length === 0
            ? `no_events_from_${cfg.fetchStrategy}_endpoint`
            : `all_${rawEvents.length}_rejected_by_filters`
          : undefined,
        duration_ms: Date.now() - startTime,
      });
      await logTelemetry(supabase, wallet, tel);

      return json({
        league: cfg.label,
        sportType: cfg.sportType,
        fetchStrategy: cfg.fetchStrategy,
        results: results.map(e => toPreview(e, "league_browse")),
        raw_sample: rawSample,
        debug_report: debugReport,
        rejection_sample: rejectionSummary,
        filter_message: results.length === 0 && rawEvents.length > 0
          ? `Data found from Polymarket (${rawEvents.length} events), but local filters rejected all results.`
          : undefined,
        // Debug stats for admin panel
        debug_stats: {
          raw_fetched: rawEvents.length,
          after_prop_filter: rawEvents.length - rejected.filter(r => r.fixtureReason && !r.dateReason).length,
          after_date_filter: rawEvents.length - rejected.filter(r => r.dateReason).length,
          after_all_filters: results.length,
          rejection_breakdown: (() => {
            const reasons: Record<string, number> = {};
            for (const r of rejected) {
              const reason = (r.dateReason || r.fixtureReason || "unknown").split(":")[0];
              reasons[reason] = (reasons[reason] || 0) + 1;
            }
            return reasons;
          })(),
        },
        telemetry: tel,
      });
    }

    // ══════════════════════════════════════════════════
    // MODE 3: exact_search — Strict fixture/fight name search
    // ══════════════════════════════════════════════════
    if (action === "search") {
      const startTime = Date.now();
      const { query, sport_filter } = body;
      if (!query) return json({ error: "Missing query" }, 400);

      // Safety: if query matches a league name, redirect to tag-based browse
      const leagueKey = isLeagueQuery(query);
      if (leagueKey) {
        const cfg = LEAGUE_SOURCES[leagueKey];
        const { events: rawEvents, endpoints } = await fetchByLeagueSource(cfg);
        const { accepted: results, rejected, rawSample, debugReport } = filterFixtures(rawEvents, true);

        const tel = buildTelemetry({
          mode: "search_redirected_to_browse",
          strategy: cfg.fetchStrategy,
          league_key: leagueKey,
          query,
          endpoints_called: endpoints,
          raw_count: rawEvents.length,
          filtered_count: results.length,
          zero_reason: results.length === 0
            ? rawEvents.length === 0
              ? `league_redirect_no_events_from_${cfg.fetchStrategy}`
              : `league_redirect_all_${rawEvents.length}_rejected`
            : undefined,
          duration_ms: Date.now() - startTime,
        });
        await logTelemetry(supabase, wallet, tel);

        return json({
          redirected_to_league: leagueKey,
          league: cfg.label,
          results: results.map(e => toPreview(e, "league_browse")),
          raw_sample: rawSample,
        debug_report: debugReport,
          rejection_sample: rejected.slice(0, 5).map(r => ({ title: r.event.title, dateReason: r.dateReason, fixtureReason: r.fixtureReason })),
          filter_message: results.length === 0 && rawEvents.length > 0
            ? `Data found from Polymarket (${rawEvents.length} events), but local filters rejected all results.`
            : undefined,
          telemetry: tel,
        });
      }

      // Build search queries
      const queryLower = query.toLowerCase().trim();
      let searchQueries: string[] = [query];
      if (sport_filter === "mma") {
        if (!queryLower.includes("ufc") && !queryLower.includes("mma")) {
          searchQueries = [query, `${query} MMA`, `${query} UFC`];
        }
      }
      if (sport_filter === "boxing") {
        if (!queryLower.includes("boxing")) {
          searchQueries = [query, `${query} boxing`];
        }
      }

      const endpoints = searchQueries.map(q => `public-search?q=${q}`);
      const rawResults = await fetchSearchEvents(searchQueries);

      const { accepted, rejected, rawSample, debugReport } = filterFixtures(rawResults, false);

      // Apply sport_filter category matching on accepted results
      let results = accepted;
      if (sport_filter === "soccer") {
        results = results.filter(ev => {
          const texts = [ev.title, ev.slug.replace(/-/g, " ")];
          return texts.some(t => /\bvs\.?\b|\sv\s/i.test(t));
        });
      }

      const rejectionSummary = rejected.length > 0
        ? rejected.slice(0, 5).map(r => ({ title: r.event.title, dateReason: r.dateReason, fixtureReason: r.fixtureReason }))
        : [];

      const tel = buildTelemetry({
        mode: "search",
        strategy: "public_search",
        query,
        endpoints_called: endpoints,
        raw_count: rawResults.length,
        filtered_count: results.length,
        zero_reason: results.length === 0
          ? rawResults.length === 0
            ? "no_results_from_public_search"
            : `all_${rawResults.length}_rejected_by_filters`
          : undefined,
        duration_ms: Date.now() - startTime,
      });
      await logTelemetry(supabase, wallet, tel);

      return json({
        results: results.map(e => toPreview(e, "exact_search")),
        raw_sample: rawSample,
        debug_report: debugReport,
        rejection_sample: rejectionSummary,
        filter_message: results.length === 0 && rawResults.length > 0
          ? `Data found from Polymarket (${rawResults.length} events), but local filters rejected all results.`
          : undefined,
        telemetry: tel,
      });
    }

    // ══════════════════════════════════════════════════
    // ACTION: import_single
    // ══════════════════════════════════════════════════
    if (action === "import_single") {
      const { polymarket_event_id, import_source, sport_type, visibility } = body;
      if (!polymarket_event_id) return json({ error: "Missing polymarket_event_id" }, 400);

      const gEvent = await fetchEventById(polymarket_event_id);
      if (!gEvent) return json({ error: `Event not found (${polymarket_event_id})` }, 404);

      const result = await importSingleEvent(supabase, gEvent, wallet, import_source || "manual", sport_type || null, visibility || null);
      return json({ success: true, ...result });
    }

    // ══════════════════════════════════════════════════
    // ACTION: import_bulk — Import multiple events at once
    // ══════════════════════════════════════════════════
    if (action === "import_bulk") {
      const { event_ids, import_source, sport_type, visibility } = body;
      if (!event_ids || !Array.isArray(event_ids) || event_ids.length === 0) {
        return json({ error: "Missing or empty event_ids array" }, 400);
      }
      // Cap at 15 per call to avoid timeout
      const batch = event_ids.slice(0, 15);
      const results: { id: string; success: boolean; imported?: number; error?: string }[] = [];
      for (const eid of batch) {
        try {
          const gEvent = await fetchEventById(eid);
          if (!gEvent) {
            results.push({ id: eid, success: false, error: "Event not found" });
            continue;
          }
          const r = await importSingleEvent(supabase, gEvent, wallet, import_source || "bulk_import", sport_type || null, visibility || null);
          results.push({ id: eid, success: true, imported: r.imported });
        } catch (err: any) {
          results.push({ id: eid, success: false, error: err.message });
        }
      }
      const totalImported = results.filter(r => r.success).reduce((sum, r) => sum + (r.imported || 0), 0);
      return json({ success: true, total_events: results.length, total_imported: totalImported, results, has_more: event_ids.length > 15 });
    }

    // ══════════════════════════════════════════════════
    // ACTION: import_by_url
    // ══════════════════════════════════════════════════
    if (action === "import_by_url") {
      const { url } = body;
      if (!url || typeof url !== "string") return json({ error: "Missing url" }, 400);

      const parsed = parsePolymarketUrl(url);
      if (!parsed) return json({ error: "Could not parse event slug from URL" }, 400);

      if (parsed.type === "event_slug") {
        const gEvent = await fetchEventBySlug(parsed.slug!);
        if (!gEvent) return json({ error: "Event not found for slug: " + parsed.slug }, 404);
        const result = await importSingleEvent(supabase, gEvent, wallet, "url_import");
        return json({ success: true, event_name: gEvent.title, slug: gEvent.slug, ...result });
      } else if (parsed.type === "sports_league_games" || parsed.type === "sports_league_event") {
        return json({
          error: "League/sports URLs should use url_preview first, then import selected events individually.",
          suggestion: "Use the URL preview mode to see all fixtures, then select which to import.",
        }, 400);
      }

      return json({ error: "Could not parse URL" }, 400);
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    console.error(`[polymarket-sync] Error: ${err}`);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
