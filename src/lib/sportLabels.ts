import { parseSport } from "@/components/predictions/EventSection";

/**
 * Returns the correct child-item noun for a sport.
 * MMA/Boxing/Muay Thai → fight(s), Soccer/Futbol → match(es), Other → game(s)
 */
export function getSportItemLabel(sport: string, count: number): string {
  const s = sport.toUpperCase();
  if (["MMA", "BOXING", "MUAY THAI"].includes(s)) {
    return count === 1 ? "Fight" : "Fights";
  }
  if (["FUTBOL", "SOCCER"].includes(s)) {
    return count === 1 ? "Match" : "Matches";
  }
  return count === 1 ? "Game" : "Games";
}

/** Convenience: pass event name, auto-detect sport */
export function getItemLabelFromEvent(eventName: string, count: number): string {
  return getSportItemLabel(parseSport(eventName), count);
}
