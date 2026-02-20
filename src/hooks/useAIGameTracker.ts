import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSessionId } from "./usePresenceHeartbeat";

type AIGame = "chess" | "checkers" | "backgammon" | "dominos" | "ludo";
type AIEvent = "game_started" | "game_won" | "game_lost" | "game_abandoned";

async function trackAIEvent(
  sessionId: string,
  game: AIGame,
  difficulty: string,
  event: AIEvent,
  duration_seconds?: number
) {
  try {
    await supabase.functions.invoke("live-stats", {
      body: { action: "track_ai_event", sessionId, game, difficulty, event, duration_seconds },
    });
  } catch {
    // silent — analytics must never break gameplay
  }
}

async function sendHeartbeat(sessionId: string, game: AIGame) {
  try {
    await supabase.functions.invoke("live-stats", {
      body: {
        action: "heartbeat",
        sessionId,
        page: `ai-${game}`,
        game,
      },
    });
  } catch {
    // silent
  }
}

/**
 * Tracks presence AND discrete lifecycle events for an AI game session.
 *
 * - On mount: fires `game_started` + heartbeat with page/game
 * - Every 30s: heartbeat with page/game
 * - On unmount: fires `game_abandoned` ONLY if recordWin/recordLoss not called yet
 *
 * @returns { recordWin, recordLoss } — call these when the game ends
 */
export function useAIGameTracker(game: AIGame, difficulty: string) {
  const sessionId = useRef(getSessionId());
  const startTime = useRef(Date.now());
  const outcomeRecorded = useRef(false);

  useEffect(() => {
    const sid = sessionId.current;
    startTime.current = Date.now();
    outcomeRecorded.current = false;

    // Fire game_started immediately
    trackAIEvent(sid, game, difficulty, "game_started");
    sendHeartbeat(sid, game);

    // Heartbeat every 30s
    const iv = setInterval(() => sendHeartbeat(sid, game), 30_000);

    return () => {
      clearInterval(iv);
      // Only fire abandoned if no win/loss was recorded
      if (!outcomeRecorded.current) {
        const duration_seconds = Math.round((Date.now() - startTime.current) / 1000);
        trackAIEvent(sid, game, difficulty, "game_abandoned", duration_seconds);
      }
    };
    // game and difficulty are stable strings — intentionally excluded from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getDuration = useCallback(
    () => Math.round((Date.now() - startTime.current) / 1000),
    []
  );

  const recordWin = useCallback(() => {
    if (outcomeRecorded.current) return;
    outcomeRecorded.current = true;
    const duration_seconds = getDuration();
    trackAIEvent(sessionId.current, game, difficulty, "game_won", duration_seconds);
  }, [game, difficulty, getDuration]);

  const recordLoss = useCallback(() => {
    if (outcomeRecorded.current) return;
    outcomeRecorded.current = true;
    const duration_seconds = getDuration();
    trackAIEvent(sessionId.current, game, difficulty, "game_lost", duration_seconds);
  }, [game, difficulty, getDuration]);

  return { recordWin, recordLoss, getDuration };
}
