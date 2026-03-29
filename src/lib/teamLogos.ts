/**
 * Team logo / flag mapping for major sports events.
 * Returns a URL for team logos or country flags.
 * Falls back to null if not found.
 */

// Country flag emoji via Unicode regional indicator
const COUNTRY_FLAGS: Record<string, string> = {
  usa: "🇺🇸", "united states": "🇺🇸",
  mexico: "🇲🇽", brazil: "🇧🇷", argentina: "🇦🇷",
  england: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", france: "🇫🇷", germany: "🇩🇪",
  spain: "🇪🇸", italy: "🇮🇹", portugal: "🇵🇹",
  japan: "🇯🇵", "south korea": "🇰🇷", korea: "🇰🇷",
  australia: "🇦🇺", canada: "🇨🇦",
  ireland: "🇮🇪", scotland: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", wales: "🏴󠁧󠁢󠁷󠁬󠁳󠁿",
  netherlands: "🇳🇱", belgium: "🇧🇪", croatia: "🇭🇷",
  colombia: "🇨🇴", uruguay: "🇺🇾", chile: "🇨🇱",
  ecuador: "🇪🇨", peru: "🇵🇪", paraguay: "🇵🇾",
  thailand: "🇹🇭", philippines: "🇵🇭", indonesia: "🇮🇩",
  china: "🇨🇳", india: "🇮🇳", russia: "🇷🇺",
  nigeria: "🇳🇬", ghana: "🇬🇭", senegal: "🇸🇳",
  morocco: "🇲🇦", egypt: "🇪🇬", cameroon: "🇨🇲",
  turkey: "🇹🇷", poland: "🇵🇱", sweden: "🇸🇪",
  denmark: "🇩🇰", norway: "🇳🇴", switzerland: "🇨🇭",
  austria: "🇦🇹", czech: "🇨🇿", "czech republic": "🇨🇿",
  serbia: "🇷🇸", ukraine: "🇺🇦", romania: "🇷🇴",
};

// ESPN CDN pattern for major US sports leagues
const ESPN_LOGO_BASE = "https://a.espncdn.com/i/teamlogos";

// Known NFL teams
const NFL_TEAMS: Record<string, string> = {
  chiefs: "kc", "kansas city": "kc", eagles: "phi", philadelphia: "phi",
  bills: "buf", buffalo: "buf", cowboys: "dal", dallas: "dal",
  "49ers": "sf", "san francisco": "sf", ravens: "bal", baltimore: "bal",
  dolphins: "mia", miami: "mia", lions: "det", detroit: "det",
  packers: "gb", "green bay": "gb", jets: "nyj", "new york jets": "nyj",
  bengals: "cin", cincinnati: "cin", texans: "hou", houston: "hou",
  steelers: "pit", pittsburgh: "pit", broncos: "den", denver: "den",
  chargers: "lac", vikings: "min", minnesota: "min",
  seahawks: "sea", seattle: "sea", rams: "lar", "los angeles rams": "lar",
  giants: "nyg", "new york giants": "nyg", bears: "chi", chicago: "chi",
  browns: "cle", cleveland: "cle", colts: "ind", indianapolis: "ind",
  jaguars: "jax", jacksonville: "jax", commanders: "wsh", washington: "wsh",
  raiders: "lv", "las vegas": "lv", saints: "no", "new orleans": "no",
  buccaneers: "tb", "tampa bay": "tb", falcons: "atl", atlanta: "atl",
  panthers: "car", carolina: "car", cardinals: "ari", arizona: "ari",
  titans: "ten", tennessee: "ten", patriots: "ne", "new england": "ne",
};

// Known NBA teams
const NBA_TEAMS: Record<string, string> = {
  lakers: "lal", "los angeles lakers": "lal", celtics: "bos", boston: "bos",
  warriors: "gs", "golden state": "gs", bucks: "mil", milwaukee: "mil",
  nuggets: "den", heat: "mia", suns: "phx", phoenix: "phx",
  "76ers": "phi", sixers: "phi", nets: "bkn", brooklyn: "bkn",
  knicks: "ny", "new york knicks": "ny", mavericks: "dal",
  clippers: "lac", grizzlies: "mem", memphis: "mem",
  pelicans: "no", kings: "sac", sacramento: "sac",
  timberwolves: "min", cavaliers: "cle", thunder: "okc",
  hawks: "atl", raptors: "tor", toronto: "tor",
  jazz: "uth", utah: "uth", magic: "orl", orlando: "orl",
  pacers: "ind", bulls: "chi", hornets: "cha", charlotte: "cha",
  wizards: "wsh", blazers: "por", "trail blazers": "por", portland: "por",
  pistons: "det", rockets: "hou", spurs: "sa", "san antonio": "sa",
};

// Known NHL teams
const NHL_TEAMS: Record<string, string> = {
  bruins: "bos", canadiens: "mtl", montreal: "mtl",
  "maple leafs": "tor", rangers: "nyr", "new york rangers": "nyr",
  penguins: "pit", blackhawks: "chi", "red wings": "det",
  oilers: "edm", edmonton: "edm", flames: "cgy", calgary: "cgy",
  canucks: "van", vancouver: "van", avalanche: "col", colorado: "col",
  lightning: "tb", panthers: "fla", florida: "fla",
  hurricanes: "car", stars: "dal", wild: "min",
  jets: "wpg", winnipeg: "wpg", predators: "nsh", nashville: "nsh",
  blues: "stl", "st. louis": "stl", senators: "ott", ottawa: "ott",
  islanders: "nyi", devils: "njd", capitals: "wsh",
  ducks: "ana", kraken: "sea", knights: "vgk", "vegas": "vgk",
  coyotes: "ari", sharks: "sj", "san jose": "sj",
  sabres: "buf", flyers: "phi", blue jackets: "cbj", columbus: "cbj",
};

/**
 * Get a team logo URL or flag emoji for a given team/fighter name and sport.
 * Returns { url?: string; emoji?: string } or null.
 */
export function getTeamLogo(name: string, sport?: string): { url?: string; emoji?: string } | null {
  if (!name) return null;
  const lower = name.toLowerCase().trim();

  // Check country flags first (useful for soccer/international)
  const flag = COUNTRY_FLAGS[lower];
  if (flag) return { emoji: flag };

  // NFL
  if (sport?.toLowerCase().includes("nfl") || sport?.toLowerCase().includes("football")) {
    const abbr = NFL_TEAMS[lower];
    if (abbr) return { url: `${ESPN_LOGO_BASE}/nfl/500/${abbr}.png` };
  }

  // NBA
  if (sport?.toLowerCase().includes("nba") || sport?.toLowerCase().includes("basketball")) {
    const abbr = NBA_TEAMS[lower];
    if (abbr) return { url: `${ESPN_LOGO_BASE}/nba/500/${abbr}.png` };
  }

  // NHL
  if (sport?.toLowerCase().includes("nhl") || sport?.toLowerCase().includes("hockey")) {
    const abbr = NHL_TEAMS[lower];
    if (abbr) return { url: `${ESPN_LOGO_BASE}/nhl/500/${abbr}.png` };
  }

  // Generic fallback: check all leagues
  for (const [, teams] of [["nfl", NFL_TEAMS], ["nba", NBA_TEAMS], ["nhl", NHL_TEAMS]] as const) {
    const abbr = (teams as Record<string, string>)[lower];
    if (abbr) return { url: `${ESPN_LOGO_BASE}/${teams === NFL_TEAMS ? "nfl" : teams === NBA_TEAMS ? "nba" : "nhl"}/500/${abbr}.png` };
  }

  return null;
}

/**
 * Get flag emoji for a country name. Useful for soccer events.
 */
export function getCountryFlag(name: string): string | null {
  return COUNTRY_FLAGS[name.toLowerCase().trim()] || null;
}
