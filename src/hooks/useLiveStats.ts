import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

function getSessionId(): string {
  let id = sessionStorage.getItem("live_session_id");
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem("live_session_id", id);
  }
  return id;
}

export function useLiveStats() {
  const [browsing, setBrowsing] = useState(0);
  const [roomsWaiting, setRoomsWaiting] = useState(0);
  const [loading, setLoading] = useState(true);
  const sessionId = useRef(getSessionId());

  const sendHeartbeat = useCallback(async () => {
    try {
      await supabase.functions.invoke("live-stats", {
        body: { action: "heartbeat", sessionId: sessionId.current },
      });
    } catch {
      // silent
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke("live-stats", {
        body: { action: "stats" },
      });
      if (!error && data) {
        setBrowsing(Math.max(0, data.browsing ?? 0));
        setRoomsWaiting(Math.max(0, data.roomsWaiting ?? 0));
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial
    sendHeartbeat();
    fetchStats();

    // Intervals
    const hb = setInterval(sendHeartbeat, 30_000);
    const st = setInterval(fetchStats, 15_000);

    return () => {
      clearInterval(hb);
      clearInterval(st);
    };
  }, [sendHeartbeat, fetchStats]);

  return { browsing, roomsWaiting, loading };
}
