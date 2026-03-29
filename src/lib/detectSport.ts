/**
 * Detect sport type from fight data for icon/layout selection.
 */

const SOCCER_KEYWORDS = [
  "MLS", "SOCCER", "FUTBOL", "FÚTBOL", "PREMIER LEAGUE", "LA LIGA",
  "CHAMPIONS LEAGUE", "SERIE A", "BUNDESLIGA", "LIGUE 1", "EREDIVISIE",
  "LIGA MX", "EPL", "COPA", "EURO", "FIFA", "WORLD CUP",
];

// NHL team names for accurate sport detection
const NHL_TEAMS = [
  "AVALANCHE", "BLACKHAWKS", "BLUE JACKETS", "BLUES", "BRUINS", "CANADIENS",
  "CANUCKS", "CAPITALS", "COYOTES", "DEVILS", "DUCKS", "FLAMES", "FLYERS",
  "GOLDEN KNIGHTS", "HURRICANES", "ISLANDERS", "JETS", "KINGS", "KRAKEN",
  "LIGHTNING", "MAPLE LEAFS", "OILERS", "PANTHERS", "PENGUINS", "PREDATORS",
  "RANGERS", "RED WINGS", "SABRES", "SENATORS", "SHARKS", "STARS", "UTAH HC",
  "WILD", "WINNIPEG", "EDMONTON", "CALGARY", "VANCOUVER", "TORONTO",
  "MONTREAL", "OTTAWA", "TAMPA BAY", "FLORIDA", "CAROLINA", "COLUMBUS",
  "NASHVILLE", "DALLAS", "MINNESOTA", "COLORADO", "DETROIT", "BUFFALO",
  "PITTSBURGH", "PHILADELPHIA", "NEW JERSEY", "NY ISLANDERS", "NY RANGERS",
  "BOSTON", "WASHINGTON", "SEATTLE", "VEGAS", "SAN JOSE", "ANAHEIM", "LOS ANGELES",
  "ST. LOUIS", "CHICAGO", "ARIZONA",
];

const NBA_TEAMS = [
  "LAKERS", "CELTICS", "WARRIORS", "NETS", "BUCKS", "76ERS", "SIXERS",
  "HEAT", "SUNS", "MAVERICKS", "NUGGETS", "CLIPPERS", "RAPTORS",
  "BULLS", "CAVALIERS", "HAWKS", "PACERS", "MAGIC", "KNICKS", "PELICANS",
  "GRIZZLIES", "TIMBERWOLVES", "THUNDER", "TRAIL BLAZERS", "SPURS",
  "WIZARDS", "HORNETS", "PISTONS", "ROCKETS", "JAZZ",
];

const NFL_TEAMS = [
  "CHIEFS", "EAGLES", "BILLS", "BENGALS", "49ERS", "COWBOYS", "DOLPHINS",
  "CHARGERS", "RAVENS", "LIONS", "JAGUARS", "VIKINGS", "SEAHAWKS",
  "PACKERS", "RAMS", "STEELERS", "BRONCOS", "BROWNS", "TEXANS",
  "SAINTS", "TITANS", "COLTS", "RAIDERS", "CARDINALS", "COMMANDERS",
  "BEARS", "FALCONS", "PATRIOTS", "PANTHERS", "GIANTS", "BUCCANEERS",
];

const MLB_TEAMS = [
  "YANKEES", "RED SOX", "DODGERS", "ASTROS", "BRAVES", "METS",
  "PHILLIES", "PADRES", "MARINERS", "GUARDIANS", "ORIOLES", "RAYS",
  "TWINS", "BLUE JAYS", "BREWERS", "CARDINALS", "DIAMONDBACKS",
  "CUBS", "REDS", "PIRATES", "GIANTS", "ROCKIES", "ROYALS",
  "ATHLETICS", "WHITE SOX", "TIGERS", "ANGELS", "MARLINS", "NATIONALS",
  "RANGERS",
];

export type SportType = "soccer" | "over_under" | "combat" | "nfl" | "nba" | "ncaa" | "nhl" | "mlb" | "tennis" | "golf" | "f1" | "cricket" | "rugby";

function hasTeamName(text: string, teams: string[]): boolean {
  const upper = text.toUpperCase();
  return teams.some(t => upper.includes(t));
}

export function detectSport(fight: {
  source?: string | null;
  event_name?: string;
  fighter_a_name?: string;
  fighter_b_name?: string;
  title?: string;
}): SportType {
  // API-Football source is always soccer
  if (fight.source === "api-football") return "soccer";

  const upper = (fight.event_name || "").toUpperCase();
  const titleUpper = (fight.title || "").toUpperCase();
  const nameA = (fight.fighter_a_name || "").toUpperCase();
  const nameB = (fight.fighter_b_name || "").toUpperCase();
  const allText = `${upper} ${titleUpper} ${nameA} ${nameB}`;

  // Check event name for sport keywords
  if (SOCCER_KEYWORDS.some((k) => upper.includes(k))) return "soccer";

  // US Sports & Others — check event name first
  if (upper.includes("NFL") || upper.includes("SUPER BOWL")) return "nfl";
  if (upper.includes("NBA") || upper.includes("WNBA")) return "nba";
  if (upper.includes("NCAA") || upper.includes("MARCH MADNESS") || upper.includes("COLLEGE FOOTBALL")) return "ncaa";
  if (upper.includes("NHL") || upper.includes("STANLEY CUP")) return "nhl";
  if (upper.includes("MLB") || upper.includes("WORLD SERIES")) return "mlb";
  if (upper.includes("ATP") || upper.includes("WTA") || upper.includes("TENNIS") || upper.includes("WIMBLEDON")) return "tennis";
  if (upper.includes("PGA") || upper.includes("GOLF") || upper.includes("MASTERS GOLF")) return "golf";
  if (upper.includes("FORMULA 1") || upper.includes("F1") || upper.includes("GRAND PRIX")) return "f1";
  if (upper.includes("CRICKET") || upper.includes("IPL") || upper.includes("T20")) return "cricket";
  if (upper.includes("RUGBY") || upper.includes("SIX NATIONS")) return "rugby";

  // Over/Under detection
  const lowerA = (fight.fighter_a_name || "").toLowerCase().trim();
  const lowerB = (fight.fighter_b_name || "").toLowerCase().trim();

  if (
    lowerA === "over" || lowerA === "under" ||
    lowerB === "over" || lowerB === "under" ||
    titleUpper.includes("O/U") || titleUpper.includes("OVER/UNDER")
  ) {
    return "over_under";
  }

  // Team name detection — check fighter names against known team rosters
  // NHL first (most commonly misdetected)
  if (hasTeamName(nameA, NHL_TEAMS) || hasTeamName(nameB, NHL_TEAMS)) return "nhl";
  if (hasTeamName(nameA, NBA_TEAMS) || hasTeamName(nameB, NBA_TEAMS)) return "nba";
  if (hasTeamName(nameA, NFL_TEAMS) || hasTeamName(nameB, NFL_TEAMS)) return "nfl";
  if (hasTeamName(nameA, MLB_TEAMS) || hasTeamName(nameB, MLB_TEAMS)) return "mlb";

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
