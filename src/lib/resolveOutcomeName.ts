/**
 * Resolve "Yes"/"No" outcome names into meaningful display names.
 *
 * For Polymarket binary markets, outcome names are "Yes"/"No".
 * For soccer 3-way markets, event_name is "Team A vs. Team B" and
 * each fight title is a team name or "Draw (...)".
 */

export function resolveOutcomeName(
  rawName: string,
  side: "a" | "b",
  fight: {
    title?: string;
    event_name?: string;
    fighter_a_name?: string;
    fighter_b_name?: string;
  },
): string {
  // If names are already meaningful (not Yes/No), return as-is
  if (rawName !== "Yes" && rawName !== "No") return rawName;

  const eventName = fight.event_name || "";
  const title = fight.title || "";

  // Try to parse "Team A vs Team B" or "Team A vs. Team B" from event_name
  const vsMatch = eventName.match(/^(.+?)\s+vs\.?\s+(.+)$/i);

  if (vsMatch) {
    const [, teamA, teamB] = vsMatch;
    // Title matches one team → that's this market's subject
    const titleUpper = title.toUpperCase().trim();
    const teamAUpper = teamA.toUpperCase().trim();
    const teamBUpper = teamB.toUpperCase().trim();

    if (titleUpper.startsWith("DRAW")) {
      // Draw market
      return side === "a" ? "Draw" : "No Draw";
    }

    if (titleUpper.includes(teamAUpper) || teamAUpper.includes(titleUpper)) {
      return side === "a" ? teamA.trim() : `Not ${teamA.trim()}`;
    }
    if (titleUpper.includes(teamBUpper) || teamBUpper.includes(titleUpper)) {
      return side === "a" ? teamB.trim() : `Not ${teamB.trim()}`;
    }
  }

  // Fallback: extract from title (e.g. "Will Villarreal CF win?")
  if (title) {
    const cleaned = title
      .replace(/^Will\s+/i, "")
      .replace(/\s+win\??$/i, "")
      .trim();
    if (cleaned) {
      // For binary Yes/No soccer markets, show "Yes"/"No" instead of "Not TeamName"
      return side === "a" ? cleaned : "No";
    }
  }

  return rawName;
}

/** Parse team names from "A vs B" event name */
export function parseTeamsFromEvent(eventName: string): { home: string; away: string } | null {
  const m = eventName.match(/^(.+?)\s+vs\.?\s+(.+)$/i);
  if (!m) return null;
  return { home: m[1].trim(), away: m[2].trim() };
}
