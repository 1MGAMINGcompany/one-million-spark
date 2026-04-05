import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";

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

function parseLiveState(msg: any): LiveGameState | null {
  if (!msg?.slug) return null;

  const status = (msg.status || "unknown").toString();
  const live = ["InProgress", "in_progress", "live", "halftime", "in_play"].includes(status);
  const ended = ["Final", "F/OT", "F/SO", "final", "ended", "finished", "complete", "closed"].includes(status);

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

export function SportsWebSocketProvider({ children }: { children: React.ReactNode }) {
  const [games, setGames] = useState<Map<string, LiveGameState>>(new Map());
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef(1000);
  const mountedRef = useRef(true);

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
