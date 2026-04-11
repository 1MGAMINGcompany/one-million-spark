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
 * Parse a WebSocket message from the Polymarket Sports API.
 * Per docs: no subscription needed. Messages are `sport_result` type JSON objects.
 *
 * Match strategy:
 * 1. Direct slug match against tracked slugs
 * 2. Reverse slug map: WS slug → internal slug (built from snapshot realSlug data)
 * 3. Partial prefix match as last resort
 */
function parseLiveMessage(
  msg: any,
  slugSet: Set<string>,
  reverseSlugMap: Map<string, string>,
): LiveGameState | null {
  if (!msg) return null;

  let slug: string | null = null;
  const wsSlug = msg.slug || msg.market_slug || null;

  // Direct match
  if (wsSlug && slugSet.has(wsSlug)) {
    slug = wsSlug;
  }

  // Reverse slug map: WS sends realSlug, we map back to internal slug
  if (!slug && wsSlug && reverseSlugMap.has(wsSlug)) {
    slug = reverseSlugMap.get(wsSlug)!;
  }

  // Partial prefix match
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
  const unmatchedCountRef = useRef(0);

  const slugSet = useMemo(() => new Set(slugs), [slugs]);
  const slugSetRef = useRef(slugSet);
  slugSetRef.current = slugSet;

  // Reverse slug map: realSlug → internalSlug (populated from snapshot)
  const reverseSlugMapRef = useRef<Map<string, string>>(new Map());

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

        // Build reverse slug map from snapshot data
        const newReverseMap = new Map<string, string>(reverseSlugMapRef.current);
        for (const [internalSlug, state] of entries) {
          if (state && typeof state === "object") {
            const s = state as any;
            if (s.realSlug) {
              newReverseMap.set(s.realSlug, internalSlug);
            }
            if (s.eventSlug) {
              newReverseMap.set(s.eventSlug, internalSlug);
            }
          }
        }
        reverseSlugMapRef.current = newReverseMap;
        if (newReverseMap.size > 0) {
          console.log("[SportsWS] Reverse slug map has %d entries (real→internal)", newReverseMap.size);
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
    const interval = setInterval(fetchSnapshot, 30_000);
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
        unmatchedCountRef.current = 0;
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
              const state = parseLiveMessage(msg, slugSetRef.current, reverseSlugMapRef.current);
              if (state) {
                next.set(state.slug, state);
                changed = true;
              } else if (unmatchedCountRef.current < 5 && (msg.slug || msg.market_slug)) {
                unmatchedCountRef.current++;
                console.log("[SportsWS] Unmatched WS slug:", msg.slug || msg.market_slug,
                  "| tracked sample:", Array.from(slugSetRef.current).slice(0, 3),
                  "| reverseMap sample:", Array.from(reverseSlugMapRef.current.keys()).slice(0, 3));
              }
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
