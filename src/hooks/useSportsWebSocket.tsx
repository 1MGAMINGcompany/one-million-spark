import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
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
const REST_POLL_INTERVAL = 60_000;

function parseLiveState(msg: any): LiveGameState | null {
  if (!msg?.slug) return null;

  const status = (msg.status || "unknown").toString();

  // Use native boolean fields when available, fall back to status-string matching
  const live = typeof msg.live === "boolean"
    ? msg.live
    : ["InProgress", "in_progress", "live", "halftime", "in_play",
       "running", "inprogress", "Break", "PenaltyShootout", "Awarded"].includes(status);

  const ended = typeof msg.ended === "boolean"
    ? msg.ended
    : ["Final", "F/OT", "F/SO", "final", "ended", "finished", "complete", "closed"].includes(status);

  // Score can be a string like "3-16" or separate fields
  let score = msg.score as string | undefined;
  let scoreA: number | undefined;
  let scoreB: number | undefined;

  if (typeof score === "string" && score.includes("-")) {
    const parts = score.split("-");
    scoreA = Number(parts[0]);
    scoreB = Number(parts[1]);
  } else {
    scoreA = msg.score_a ?? msg.home_score ?? msg.scoreA ?? undefined;
    scoreB = msg.score_b ?? msg.away_score ?? msg.scoreB ?? undefined;
    if (scoreA != null && scoreB != null) {
      score = `${scoreA}-${scoreB}`;
    }
  }

  // Sport from leagueAbbreviation or sport field
  const sport = msg.leagueAbbreviation || msg.sport || undefined;

  return {
    slug: msg.slug,
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

/** Fetch initial game states from Gamma API via edge function */
async function fetchInitialStates(slugs: string[]): Promise<Map<string, LiveGameState>> {
  const result = new Map<string, LiveGameState>();
  if (slugs.length === 0) return result;

  try {
    const { data, error } = await supabase.functions.invoke("live-game-state", {
      body: { slugs },
    });

    if (error || !data?.ok || !data?.games) {
      console.warn("[SportsWS] REST fetch failed:", error?.message || data?.error);
      return result;
    }

    for (const [slug, state] of Object.entries(data.games)) {
      const s = state as any;
      if (s && (s.live || s.ended)) {
        result.set(slug, {
          slug,
          score: s.score,
          scoreA: s.scoreA,
          scoreB: s.scoreB,
          period: s.period,
          elapsed: s.elapsed,
          status: s.status,
          live: s.live,
          ended: s.ended,
          sport: s.sport,
        });
      }
    }

    console.log(`[SportsWS] REST: got ${result.size} live/ended states from ${slugs.length} slugs`);
  } catch (e) {
    console.warn("[SportsWS] REST fetch error:", e);
  }

  return result;
}

interface SportsWebSocketProviderProps {
  children: React.ReactNode;
  /** Slugs to track — used for initial REST fetch */
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

  // REST polling for initial state + fallback
  useEffect(() => {
    if (slugs.length === 0) return;

    let active = true;

    const poll = async () => {
      if (!active) return;
      const states = await fetchInitialStates(slugsRef.current);
      if (!active) return;
      if (states.size > 0) {
        setGames(prev => {
          const next = new Map(prev);
          for (const [slug, state] of states) {
            // Only set if we don't have fresher WS data
            if (!next.has(slug)) {
              next.set(slug, state);
            }
          }
          return next;
        });
      }
    };

    // Initial fetch
    poll();

    // Poll every 60s as fallback
    const interval = setInterval(poll, REST_POLL_INTERVAL);
    return () => { active = false; clearInterval(interval); };
  }, [slugs.length > 0 ? slugs.join(",") : ""]);

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
        // Server sends plain text "ping" — respond with "pong"
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
              const state = parseLiveState(msg);
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
