import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePresenceHeartbeat } from "./usePresenceHeartbeat";

export function useLiveStats() {
  const [browsing, setBrowsing] = useState(0);
  const [roomsWaiting, setRoomsWaiting] = useState(0);
  const [loading, setLoading] = useState(true);

  usePresenceHeartbeat();

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
    fetchStats();
    const st = setInterval(fetchStats, 15_000);
    return () => clearInterval(st);
  }, [fetchStats]);

  return { browsing, roomsWaiting, loading };
}
