import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export function getSessionId(): string {
  let id = localStorage.getItem("live_session_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("live_session_id", id);
  }
  return id;
}

function getDeviceType(): string {
  const ua = navigator.userAgent;
  if (/Mobi|Android/i.test(ua)) return "mobile";
  if (/Tablet|iPad/i.test(ua)) return "tablet";
  return "desktop";
}

export function usePresenceHeartbeat(page?: string, game?: string) {
  const sessionId = useRef(getSessionId());

  useEffect(() => {
    const send = async () => {
      try {
        await supabase.functions.invoke("live-stats", {
          body: {
            action: "heartbeat",
            sessionId: sessionId.current,
            page: page ?? null,
            game: game ?? null,
            lang: navigator.language?.split("-")[0] || null,
            device: getDeviceType(),
            referrer: document.referrer || null,
          },
        });
      } catch {
        // silent
      }
    };

    send();
    const iv = setInterval(send, 30_000);
    return () => clearInterval(iv);
  }, [page, game]);
}
