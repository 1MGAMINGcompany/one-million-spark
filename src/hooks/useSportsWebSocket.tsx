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
const PING_INTERVAL_MS = 5_000; // Polymarket docs: server sends ping every 5s

/**
 * Parse a WebSocket message from the Polymarket Sports API.
 * Per docs: no subscription needed. Messages are `sport_result` type JSON objects
 * with fields: gameId, slug, leagueAbbreviation, status, homeScore, awayScore, etc.
 *
 * Match strategy:
 * 1. Direct slug match against tracked slugs
 * 2. Partial prefix match (WS slug may not have outcome suffix)
 */
function parseLiveMessage(msg: any, slugSet: Set<string>): LiveGameState | null {
  if (!msg) return null;

  // ── Primary: direct slug match ──
  let slug: string | null = null;
  const wsSlug = msg.slug || msg.market_slug || null;

  if (wsSlug && slugSet.has(wsSlug)) {
    slug = wsSlug;
  }

  // ── Fallback: partial slug prefix matching ──
  if (!slug && wsSlug) {
    for (const tracked of slugSet) {
      if (tracked.startsWith(wsSlug) || wsSlug.startsWith(tracked)) {
        slug = tracked;
        break;
      }
    }
  }

  if (!slug) return null;

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
    scoreA = msg.homeScore ?? msg.home_score ?? msg.score_a ?? msg.scoreA ?? undefined;
    scoreB = msg.awayScore ?? msg.away_score ?? msg.score_b ?? msg.scoreB ?? undefined;
    if (scoreA != null && scoreB != null) {
      score = `${scoreA}-${scoreB}`;
    }
  }

  const league = (msg.leagueAbbreviation || msg.league || "").toLowerCase();

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
    sport: league || undefined,
    raw: msg,
  };
}

interface SportsWebSocketProviderProps {
  children: React.ReactNode;
  slugs?: string[];
}

export function SportsWebSocketProvider({ children, slugs = [] }: SportsWebSocketProviderProps) {
  const [games, setGames] = useState<Map<string, LiveGameState>>(new Map());
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef(1000);
  const mountedRef = useRef(true);
  const unmatchedCountRef = useRef(0);
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const slugSet = useMemo(() => new Set(slugs), [slugs]);
  const slugSetRef = useRef(slugSet);
  slugSetRef.current = slugSet;

  // Log tracked slugs on change for debugging
  useEffect(() => {
    if (slugs.length > 0) {
      console.log("[SportsWS] Tracking %d slugs, first 5:", slugs.length, slugs.slice(0, 5));
    }
  }, [slugs.join(",")]);

  // ── Snapshot seeding from live-game-state edge function ──
  // Seeds initial market status so UI can show "active" / "Final" badges
  // before any WS message arrives
  useEffect(() => {
    if (slugs.length === 0) return;
    let cancelled = false;

    const fetchSnapshot = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("live-game-state", {
          body: { slugs },
        });
        if (cancelled || error) return;
        const gamesData = data?.games || {};
        const entries = Object.entries(gamesData);
        if (entries.length === 0) return;

        setGames((prev) => {
          const next = new Map(prev);
          for (const [slug, state] of entries) {
            // Only seed if we don't already have fresher WS data
            if (!next.has(slug) && state && typeof state === "object") {
              next.set(slug, state as LiveGameState);
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
    // Re-fetch every 30s for market status updates
    const interval = setInterval(fetchSnapshot, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [slugs.join(",")]);

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
        unmatchedCountRef.current = 0;

        // Heartbeat: respond to server pings
        // Also send keepalive pongs proactively
      };

      ws.onmessage = (ev) => {
        // Per docs: server sends "ping" text, respond with "pong"
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
              const state = parseLiveMessage(msg, slugSetRef.current);
              if (state) {
                next.set(state.slug, state);
                changed = true;
              } else if (unmatchedCountRef.current < 3 && (msg.slug || msg.market_slug)) {
                unmatchedCountRef.current++;
                console.log("[SportsWS] WS message slug not tracked:", msg.slug || msg.market_slug,
                  "| tracked sample:", Array.from(slugSetRef.current).slice(0, 3));
              }
            }
            return changed ? next : prev;
          });
        } catch (e) {
          // Ignore malformed messages
        }
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        console.log("[SportsWS] Disconnected, reconnecting...");
        setConnected(false);
        if (pingRef.current) { clearInterval(pingRef.current); pingRef.current = null; }
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
      if (pingRef.current) { clearInterval(pingRef.current); pingRef.current = null; }
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
