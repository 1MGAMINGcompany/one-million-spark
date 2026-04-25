import React, { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface LiveGameState {
  slug: string;
  score?: string;
  scoreA?: number;
  scoreB?: number;
  period?: string;
  elapsed?: string;
  status?: string;
  live: boolean;
  ended: boolean;
  sport?: string;
  raw?: any;
  realSlug?: string;
  eventSlug?: string;
  homeTeam?: string;
  awayTeam?: string;
  leagueAbbreviation?: string;
}

interface SportsWSContextValue {
  games: Map<string, LiveGameState>;
  connected: boolean;
}

const SportsWSContext = createContext<SportsWSContextValue>({
  games: new Map(),
  connected: false,
});

const WS_URL = "wss://sports-api.polymarket.com/ws";
const MAX_BACKOFF = 30000;

/** Build a normalized team-pair key for matching WS messages to internal slugs. */
function teamKey(home: string, away: string, league: string): string {
  return `${home.trim().toLowerCase()}|${away.trim().toLowerCase()}|${league.trim().toLowerCase()}`;
}

/**
 * Parse a WebSocket message from the Polymarket Sports API.
 * Per docs: no subscription needed. Messages are `sport_result` type JSON objects.
 *
 * The WS feed does NOT include a slug field. Actual payload keys observed:
 * homeTeam, awayTeam, leagueAbbreviation, score, period, elapsed, live, ended, status, ...
 *
 * Match strategy:
 * 1. Team-pair key match (home|away|league) — primary path
 * 2. Reversed pair (away|home|league) — handles fight ordering differences
 * 3. Direct slug match if Polymarket adds the field later — kept as fallback
 * 4. Reverse slug map (realSlug → internalSlug)
 * 5. If still no match, ignore silently
 */
function parseLiveMessage(
  msg: any,
  slugSet: Set<string>,
  reverseSlugMap: Map<string, string>,
  teamKeyMap: Map<string, string>,
): LiveGameState | null {
  if (!msg) return null;

  let slug: string | null = null;

  // Primary: team-pair key match
  const home = msg.homeTeam || msg.home_team || msg.home;
  const away = msg.awayTeam || msg.away_team || msg.away;
  const league = msg.leagueAbbreviation || msg.league || "";

  if (home && away && league) {
    const k1 = teamKey(String(home), String(away), String(league));
    if (teamKeyMap.has(k1)) {
      slug = teamKeyMap.get(k1)!;
    } else {
      // Try reversed sides
      const k2 = teamKey(String(away), String(home), String(league));
      if (teamKeyMap.has(k2)) {
        slug = teamKeyMap.get(k2)!;
      }
    }
  }

  // Fallback: legacy slug-based match (kept for forward compatibility)
  const wsSlug = msg.slug || msg.market_slug || null;
  if (!slug && wsSlug && slugSet.has(wsSlug)) {
    slug = wsSlug;
  }
  if (!slug && wsSlug && reverseSlugMap.has(wsSlug)) {
    slug = reverseSlugMap.get(wsSlug)!;
  }

  if (!slug) return null;

  const status = (msg.status || msg.eventState || "unknown").toString();
  const live = typeof msg.live === "boolean"
    ? msg.live
    : ["InProgress", "in_progress", "live", "halftime", "in_play",
       "running", "inprogress", "Break", "PenaltyShootout", "Awarded"].includes(status);
  const ended = typeof msg.ended === "boolean"
    ? msg.ended
    : ["Final", "F/OT", "F/SO", "final", "ended", "finished", "complete", "closed"].includes(status);

  let score = msg.score as string | undefined;
  let scoreA: number | undefined;
  let scoreB: number | undefined;

  if (typeof score === "string" && score.includes("-")) {
    const p = score.split("-");
    scoreA = Number(p[0]);
    scoreB = Number(p[1]);
  } else {
    scoreA = msg.homeScore ?? msg.home_score ?? msg.score_a ?? msg.scoreA ?? undefined;
    scoreB = msg.awayScore ?? msg.away_score ?? msg.score_b ?? msg.scoreB ?? undefined;
    if (scoreA != null && scoreB != null) {
      score = `${scoreA}-${scoreB}`;
    }
  }

  const leagueLower = String(league || "").toLowerCase();

  return {
    slug,
    score,
    scoreA: scoreA != null ? Number(scoreA) : undefined,
    scoreB: scoreB != null ? Number(scoreB) : undefined,
    period: msg.period || msg.quarter || msg.half || msg.inning || msg.set || undefined,
    elapsed: msg.elapsed || msg.clock || msg.time || msg.game_time || undefined,
    status,
    live,
    ended,
    sport: leagueLower || undefined,
    homeTeam: home ? String(home).trim().toLowerCase() : undefined,
    awayTeam: away ? String(away).trim().toLowerCase() : undefined,
    leagueAbbreviation: leagueLower || undefined,
    raw: msg,
  };
}

interface SportsWebSocketProviderProps {
  children: React.ReactNode;
  slugs?: string[];
  /** Map of internalSlug → polymarket_market_id for resolving real slugs */
  slugToMarketId?: Record<string, string>;
}

export function SportsWebSocketProvider({
  children,
  slugs = [],
  slugToMarketId = {},
}: SportsWebSocketProviderProps) {
  const [games, setGames] = useState<Map<string, LiveGameState>>(new Map());
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef(1000);
  const mountedRef = useRef(true);

  const slugSet = useMemo(() => new Set(slugs), [slugs]);
  const slugSetRef = useRef(slugSet);
  slugSetRef.current = slugSet;

  // Reverse slug map: realSlug → internalSlug (populated from snapshot)
  const reverseSlugMapRef = useRef<Map<string, string>>(new Map());
  // Team-pair map: "home|away|league" → internalSlug (populated from snapshot)
  const teamKeyMapRef = useRef<Map<string, string>>(new Map());

  // Log tracked slugs on change
  useEffect(() => {
    if (slugs.length > 0) {
      console.log("[SportsWS] Tracking %d slugs, first 5:", slugs.length, slugs.slice(0, 5));
      const marketIdCount = Object.keys(slugToMarketId).length;
      if (marketIdCount > 0) {
        console.log("[SportsWS] Have %d market_id mappings for real slug resolution", marketIdCount);
      }
    }
  }, [slugs.join(",")]);

  // ── Snapshot seeding from live-game-state edge function ──
  useEffect(() => {
    if (slugs.length === 0) return;
    let cancelled = false;

    const fetchSnapshot = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("live-game-state", {
          body: { slugs, slug_to_market_id: slugToMarketId },
        });
        if (cancelled || error) return;
        const gamesData = data?.games || {};
        const entries = Object.entries(gamesData);
        if (entries.length === 0) {
          console.log("[SportsWS] Snapshot returned 0 results for %d slugs", slugs.length);
          return;
        }

        // Build reverse slug map AND team-pair map from snapshot data
        const newReverseMap = new Map<string, string>(reverseSlugMapRef.current);
        const newTeamKeyMap = new Map<string, string>(teamKeyMapRef.current);

        for (const [internalSlug, state] of entries) {
          if (state && typeof state === "object") {
            const s = state as any;
            if (s.realSlug) newReverseMap.set(s.realSlug, internalSlug);
            if (s.eventSlug) newReverseMap.set(s.eventSlug, internalSlug);

            // Primary match path: team-pair + league key
            if (s.homeTeam && s.awayTeam && s.leagueAbbreviation) {
              const k = teamKey(s.homeTeam, s.awayTeam, s.leagueAbbreviation);
              newTeamKeyMap.set(k, internalSlug);
              // Also index reversed sides for fight ordering robustness
              const kRev = teamKey(s.awayTeam, s.homeTeam, s.leagueAbbreviation);
              newTeamKeyMap.set(kRev, internalSlug);
            }
          }
        }
        reverseSlugMapRef.current = newReverseMap;
        teamKeyMapRef.current = newTeamKeyMap;

        if (newTeamKeyMap.size > 0) {
          console.log(
            "[SportsWS] Match maps: %d team-pair keys, %d real-slug keys",
            newTeamKeyMap.size,
            newReverseMap.size
          );
        }

        // Always merge snapshot data — don't skip existing entries
        setGames((prev) => {
          const next = new Map(prev);
          for (const [slug, state] of entries) {
            if (state && typeof state === "object") {
              const existing = next.get(slug);
              if (existing) {
                // Merge: keep WS score/period/elapsed if present, fill from snapshot otherwise
                next.set(slug, {
                  ...state as LiveGameState,
                  score: existing.score || (state as any).score,
                  scoreA: existing.scoreA ?? (state as any).scoreA,
                  scoreB: existing.scoreB ?? (state as any).scoreB,
                  period: existing.period || (state as any).period,
                  elapsed: existing.elapsed || (state as any).elapsed,
                  slug,
                });
              } else {
                next.set(slug, { ...(state as LiveGameState), slug });
              }
            }
          }
          return next;
        });
        console.log("[SportsWS] Snapshot seeded %d/%d slugs", entries.length, slugs.length);
      } catch (e) {
        console.warn("[SportsWS] Snapshot fetch failed:", e);
      }
    };

    fetchSnapshot();
    const interval = setInterval(fetchSnapshot, 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [slugs.join(","), JSON.stringify(slugToMarketId)]);

  // ── WebSocket connection ──
  // Per Polymarket docs: "No subscription message required — connect and start
  // receiving data for all active sports events."
  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) { ws.close(); return; }
        console.log("[SportsWS] Connected");
        setConnected(true);
        backoffRef.current = 1000;
      };

      ws.onmessage = (ev) => {
        if (ev.data === "ping") {
          if (ws.readyState === WebSocket.OPEN) ws.send("pong");
          return;
        }

        try {
          const data = JSON.parse(ev.data);
          const messages = Array.isArray(data) ? data : [data];
          setGames(prev => {
            const next = new Map(prev);
            let changed = false;
            for (const msg of messages) {
              const state = parseLiveMessage(
                msg,
                slugSetRef.current,
                reverseSlugMapRef.current,
                teamKeyMapRef.current,
              );
              if (state) {
                // Merge over existing snapshot fields (preserve teams/league for re-matching)
                const existing = next.get(state.slug);
                next.set(state.slug, {
                  ...existing,
                  ...state,
                  homeTeam: state.homeTeam || existing?.homeTeam,
                  awayTeam: state.awayTeam || existing?.awayTeam,
                  leagueAbbreviation: state.leagueAbbreviation || existing?.leagueAbbreviation,
                  realSlug: existing?.realSlug,
                  eventSlug: existing?.eventSlug,
                });
                changed = true;
              }
              // Silently ignore unmatched messages — no log spam
            }
            return changed ? next : prev;
          });
        } catch {
          // Ignore malformed messages
        }
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        console.log("[SportsWS] Disconnected, reconnecting...");
        setConnected(false);
        const delay = Math.min(backoffRef.current, MAX_BACKOFF);
        backoffRef.current = delay * 2;
        setTimeout(connect, delay);
      };

      ws.onerror = () => { ws.close(); };
    } catch (err) {
      console.warn("[SportsWS] Connection error:", err);
      const delay = Math.min(backoffRef.current, MAX_BACKOFF);
      backoffRef.current = delay * 2;
      setTimeout(connect, delay);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      wsRef.current?.close();
    };
  }, [connect]);

  return (
    <SportsWSContext.Provider value={{ games, connected }}>
      {children}
    </SportsWSContext.Provider>
  );
}

/** Get live game state for a specific polymarket slug */
export function useLiveGameState(slug?: string | null): LiveGameState | null {
  const { games } = useContext(SportsWSContext);
  if (!slug) return null;
  return games.get(slug) ?? null;
}

/** Check if WebSocket is connected */
export function useSportsWSConnected(): boolean {
  return useContext(SportsWSContext).connected;
}
