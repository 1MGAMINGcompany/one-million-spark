import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export function getSessionId(): string {
  let id = sessionStorage.getItem("live_session_id");
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem("live_session_id", id);
  }
  return id;
}

export function usePresenceHeartbeat() {
  const sessionId = useRef(getSessionId());

  useEffect(() => {
    const send = async () => {
      try {
        await supabase.functions.invoke("live-stats", {
          body: { action: "heartbeat", sessionId: sessionId.current },
        });
      } catch {
        // silent
      }
    };

    send();
    const iv = setInterval(send, 30_000);
    return () => clearInterval(iv);
  }, []);
}
