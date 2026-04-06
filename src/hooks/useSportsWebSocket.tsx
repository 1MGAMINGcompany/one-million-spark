import React, { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo } from "react";

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

/**
 * Build a normalized match key from a WS message's league + teams.
 * Returns e.g. "nba|cha|min" (sorted team codes, lowercased).
 */
function buildMatchKey(league: string, teamA: string, teamB: string): string {
  const l = (league || "").toLowerCase();
  const codes = [teamA, teamB].map(t => (t || "").toLowerCase().trim()).sort();
  return `${l}|${codes[0]}|${codes[1]}`;
}

/**
 * Extract a match key from a polymarket_slug like "nba-cha-min-2026-04-05".
 * Strategy: take the league prefix and the two team codes that follow.
 * Slug format varies by sport but generally: {league}-{team1}-{team2}-{date}
 * Some slugs have suffixes like "-cam" for specific outcomes — skip those.
 */
function slugToMatchKey(slug: string): string | null {
  if (!slug) return null;
  // Split on "-" and try to identify: league, team codes, date
  const parts = slug.split("-");
  if (parts.length < 4) return null;
  
  const league = parts[0].toLowerCase();
  
  // Find the date portion (YYYY-MM-DD) — typically the last 3 parts
  // Look for a 4-digit year
  let dateStartIdx = -1;
  for (let i = 1; i < parts.length; i++) {
    if (/^\d{4}$/.test(parts[i]) && i + 2 < parts.length) {
      dateStartIdx = i;
      break;
    }
  }
  
  if (dateStartIdx < 2) return null; // Need at least 2 parts between league and date
  
  // Team codes are between league and date
  const teamParts = parts.slice(1, dateStartIdx);
  if (teamParts.length < 2) return null;
  
  // Take first two as team codes (handles 3-letter codes like "phi", "bos")
  // Some slugs have combined codes or longer names — take first two parts
  const codes = teamParts.slice(0, 2).map(t => t.toLowerCase()).sort();
  return `${league}|${codes[0]}|${codes[1]}`;
}

/**
 * Parse a WebSocket message from the Polymarket Sports API.
 * Messages have: gameId, leagueAbbreviation, homeTeam, awayTeam, score, period, elapsed, live, ended, status
 */
function parseLiveMessage(msg: any, slugLookup: Map<string, string>): LiveGameState | null {
  if (!msg) return null;
  
  // Build match key from WS data
  const league = msg.leagueAbbreviation || "";
  const home = msg.homeTeam || "";
  const away = msg.awayTeam || "";
  
  if (!league || (!home && !away)) return null;
  
  const key = buildMatchKey(league, home, away);
  const slug = slugLookup.get(key);
  if (!slug) return null; // No matching fight in our DB
  
  const status = (msg.status || "unknown").toString();
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
    scoreA = msg.score_a ?? msg.home_score ?? msg.scoreA ?? undefined;
    scoreB = msg.score_b ?? msg.away_score ?? msg.scoreB ?? undefined;
    if (scoreA != null && scoreB != null) {
      score = `${scoreA}-${scoreB}`;
    }
  }

  const sport = league.toLowerCase() || undefined;

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
    sport,
    raw: msg,
  };
}

interface SportsWebSocketProviderProps {
  children: React.ReactNode;
  /** polymarket_slug values to track */
  slugs?: string[];
}

export function SportsWebSocketProvider({ children, slugs = [] }: SportsWebSocketProviderProps) {
  const [games, setGames] = useState<Map<string, LiveGameState>>(new Map());
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef(1000);
  const mountedRef = useRef(true);
  const slugsRef = useRef(slugs);
  slugsRef.current = slugs;

  // Build a lookup map: matchKey → polymarket_slug
  // This allows us to match WS broadcasts (which use league+teams) to our DB slugs
  const slugLookup = useMemo(() => {
    const map = new Map<string, string>();
    for (const slug of slugs) {
      const key = slugToMatchKey(slug);
      if (key) map.set(key, slug);
    }
    return map;
  }, [slugs]);
  const slugLookupRef = useRef(slugLookup);
  slugLookupRef.current = slugLookup;

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
          if (ws.readyState === WebSocket.OPEN) {
            ws.send("pong");
          }
          return;
        }

        try {
          const data = JSON.parse(ev.data);
          const messages = Array.isArray(data) ? data : [data];
          setGames(prev => {
            const next = new Map(prev);
            let changed = false;
            for (const msg of messages) {
              const state = parseLiveMessage(msg, slugLookupRef.current);
              if (state) {
                next.set(state.slug, state);
                changed = true;
              }
            }
            return changed ? next : prev;
          });
        } catch (e) {
          console.warn("[SportsWS] Failed to parse message:", e);
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

      ws.onerror = () => {
        ws.close();
      };
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
