import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";

export interface LiveGameState {
  slug: string;
  score?: string;        // e.g. "4-1"
  scoreA?: number;
  scoreB?: number;
  period?: string;       // e.g. "P2", "Q4", "2H", "Bot 5", "Set 2"
  elapsed?: string;      // e.g. "01:16", "67'"
  status?: string;       // "in_progress", "halftime", "final", "not_started"
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
const PING_INTERVAL = 5000;
const MAX_BACKOFF = 30000;

function parseLiveState(msg: any): LiveGameState | null {
  if (!msg?.slug) return null;

  const game = msg.game || msg;
  const scoreA = game.score_a ?? game.home_score ?? game.scoreA ?? undefined;
  const scoreB = game.score_b ?? game.away_score ?? game.scoreB ?? undefined;
  const score = scoreA != null && scoreB != null ? `${scoreA}-${scoreB}` : undefined;

  const status = game.status || game.state || msg.status || "unknown";
  const live = ["in_progress", "live", "halftime", "in_play"].includes(status);
  const ended = ["final", "ended", "finished", "complete", "closed"].includes(status);

  return {
    slug: msg.slug,
    score,
    scoreA: scoreA != null ? Number(scoreA) : undefined,
    scoreB: scoreB != null ? Number(scoreB) : undefined,
    period: game.period || game.quarter || game.half || game.inning || game.set || undefined,
    elapsed: game.elapsed || game.clock || game.time || game.game_time || undefined,
    status,
    live,
    ended,
    sport: game.sport || msg.sport || undefined,
    raw: game,
  };
}

export function SportsWebSocketProvider({ children }: { children: React.ReactNode }) {
  const [games, setGames] = useState<Map<string, LiveGameState>>(new Map());
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef(1000);
  const pingRef = useRef<ReturnType<typeof setInterval>>();
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

        // Start ping
        pingRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
          }
        }, PING_INTERVAL);
      };

      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          // Handle arrays of updates
          const messages = Array.isArray(data) ? data : [data];
          setGames(prev => {
            const next = new Map(prev);
            let changed = false;
            for (const msg of messages) {
              if (msg.type === "pong") continue;
              const state = parseLiveState(msg);
              if (state) {
                next.set(state.slug, state);
                changed = true;
              }
            }
            return changed ? next : prev;
          });
        } catch {}
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        console.log("[SportsWS] Disconnected, reconnecting...");
        setConnected(false);
        clearInterval(pingRef.current);
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
      clearInterval(pingRef.current);
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
