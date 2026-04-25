/**
 * Sport configuration registry for SEO landing pages at /predictions/sport/:sport.
 *
 * Each entry defines the marketing copy, polymarket filter categories, and
 * placeholder FAQ structure for one sport-specific landing page.
 *
 * IMPORTANT: All copy is brand-voice compliant. Use only:
 *   trade, predict, forecast, picks, market, position, outcome.
 * Never use: bet, gamble, wager, casino, jackpot.
 */

export interface SportFAQItem {
  question: string;
  answer: string;
}

export interface SportConfig {
  /** Lowercase URL-safe slug used in /predictions/sport/:sport */
  slug: string;
  /** Presentation name (e.g., "NBA") */
  displayName: string;
  /** SEO H1 with target long-tail keyword */
  h1: string;
  /** 2-3 sentence intro paragraph rendered under the H1 */
  heroIntro: string;
  /**
   * Strings to match against fight metadata for filtering (case-insensitive).
   * Matched against polymarket_slug prefix, category, and event_name.
   */
  polymarketCategories: string[];
  /** Placeholder FAQ items — real copy will land in a follow-up PR */
  faqItems: SportFAQItem[];
  /** Path to OG image under /public; leave empty if none yet */
  ogImagePath?: string;
}

const placeholderFaq = (sport: string): SportFAQItem[] => [
  {
    question: `What is a ${sport} prediction market?`,
    answer: `[Insert ${sport}-specific 200-word answer here covering how ${sport} prediction markets work, share pricing as implied probability, and how outcomes resolve.]`,
  },
  {
    question: `How do I make my first ${sport} prediction on 1MG.live?`,
    answer: `[Insert ${sport}-specific 200-word answer here walking through sign-in, picking an outcome, entering trade size, and confirming the position.]`,
  },
  {
    question: `Can I sell my ${sport} position before the event ends?`,
    answer: `[Insert ${sport}-specific 200-word answer here explaining position selling, current market price, and lock-out windows specific to ${sport} markets.]`,
  },
  {
    question: `How are ${sport} markets settled?`,
    answer: `[Insert ${sport}-specific 200-word answer here describing the resolution source, settlement timing for ${sport} events, and automatic payout to the user's account.]`,
  },
];

export const SPORT_CONFIGS: Record<string, SportConfig> = {
  nba: {
    slug: "nba",
    displayName: "NBA",
    h1: "NBA Predictions 2026 — Live Markets & Forecasts",
    heroIntro:
      "Trade real-time NBA prediction markets on every game of the season. Prices move with information, not luck — every share you hold reflects the market's view on the outcome. Browse live NBA markets below and take a position in seconds.",
    polymarketCategories: ["nba", "basketball"],
    faqItems: placeholderFaq("NBA"),
    ogImagePath: "",
  },
  nfl: {
    slug: "nfl",
    displayName: "NFL",
    h1: "NFL Predictions 2026 — Live Markets & Forecasts",
    heroIntro:
      "Forecast every NFL matchup with deep, liquid prediction markets. From regular season Sunday games to the playoff bracket, prices update in real time as news breaks and lineups firm up. Find the markets that match your read of the league.",
    polymarketCategories: ["nfl", "football"],
    faqItems: placeholderFaq("NFL"),
    ogImagePath: "",
  },
  epl: {
    slug: "epl",
    displayName: "Premier League",
    h1: "Premier League Predictions 2026 — Live Markets & Forecasts",
    heroIntro:
      "Trade Premier League prediction markets on every fixture from matchday one to the title race. Each price is the market's implied probability for an outcome — read the table, weigh the form, and take a position with full transparency on fees.",
    polymarketCategories: ["epl", "premier league", "soccer"],
    faqItems: placeholderFaq("Premier League"),
    ogImagePath: "",
  },
  ufc: {
    slug: "ufc",
    displayName: "UFC",
    h1: "UFC Predictions 2026 — Live Markets & Forecasts",
    heroIntro:
      "Predict the outcome of every UFC card with markets that move on weigh-ins, late replacements, and breaking news. Browse upcoming fight markets, see live implied probabilities, and trade in or out of your position before the cage closes.",
    polymarketCategories: ["ufc", "mma"],
    faqItems: placeholderFaq("UFC"),
    ogImagePath: "",
  },
  mlb: {
    slug: "mlb",
    displayName: "MLB",
    h1: "MLB Predictions 2026 — Live Markets & Forecasts",
    heroIntro:
      "Trade MLB prediction markets across the entire 162-game schedule and into October. Pitcher matchups, weather, and bullpen news all move the price — find your edge and take a position on any market the day of the game.",
    polymarketCategories: ["mlb", "baseball"],
    faqItems: placeholderFaq("MLB"),
    ogImagePath: "",
  },
};

/** All registered sport slugs, in display order. */
export const SPORT_SLUGS: string[] = ["nba", "nfl", "epl", "ufc", "mlb"];

export function getSportConfig(slug: string | undefined): SportConfig | null {
  if (!slug) return null;
  return SPORT_CONFIGS[slug.toLowerCase()] ?? null;
}
