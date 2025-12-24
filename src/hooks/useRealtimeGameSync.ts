// Supabase Realtime fallback for game sync when WebRTC fails
import { useEffect, useRef, useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RealtimeChannel } from "@supabase/supabase-js";

export interface RealtimeGameMessage {
  type: string;
  payload?: any;
  timestamp: number;
  sender: string;
}

interface UseRealtimeGameSyncOptions {
  roomId: string;
  localAddress: string;
  onMessage: (message: RealtimeGameMessage) => void;
  enabled?: boolean;
}

export function useRealtimeGameSync({
  roomId,
  localAddress,
  onMessage,
  enabled = true,
}: UseRealtimeGameSyncOptions) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const processedIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled || !roomId || !localAddress) return;

    const channelName = `game-sync-${roomId}`;
    console.log(`[RealtimeGameSync] Subscribing to ${channelName}`);

    const channel = supabase.channel(channelName, {
      config: {
        broadcast: { self: false },
      },
    });

    channel
      .on("broadcast", { event: "game_move" }, ({ payload }) => {
        if (!payload) return;
        
        // Deduplicate
        const msgId = `${payload.type}-${payload.sender}-${payload.timestamp}`;
        if (processedIds.current.has(msgId)) {
          console.log(`[RealtimeGameSync] Skipping duplicate: ${msgId}`);
          return;
        }
        processedIds.current.add(msgId);
        
        // Ignore our own messages
        if (payload.sender?.toLowerCase() === localAddress.toLowerCase()) {
          return;
        }
        
        console.log(`[RealtimeGameSync] Received: ${payload.type} from ${payload.sender?.slice(0, 8)}...`);
        onMessage(payload as RealtimeGameMessage);
      })
      .subscribe((status) => {
        console.log(`[RealtimeGameSync] Status: ${status}`);
        if (status === "SUBSCRIBED") {
          setIsConnected(true);
        } else if (status === "CLOSED" || status === "CHANNEL_ERROR") {
          setIsConnected(false);
        }
      });

    channelRef.current = channel;

    return () => {
      console.log(`[RealtimeGameSync] Unsubscribing from ${channelName}`);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      setIsConnected(false);
    };
  }, [enabled, roomId, localAddress, onMessage]);

  const sendMessage = useCallback(async (message: Omit<RealtimeGameMessage, "sender" | "timestamp">) => {
    if (!channelRef.current) {
      console.warn("[RealtimeGameSync] No channel to send message");
      return false;
    }

    const fullMessage: RealtimeGameMessage = {
      ...message,
      sender: localAddress,
      timestamp: Date.now(),
    };

    try {
      const result = await channelRef.current.send({
        type: "broadcast",
        event: "game_move",
        payload: fullMessage,
      });
      
      console.log(`[RealtimeGameSync] Sent ${message.type}: ${result}`);
      return result === "ok";
    } catch (e) {
      console.error("[RealtimeGameSync] Send error:", e);
      return false;
    }
  }, [localAddress]);

  return {
    isConnected,
    sendMessage,
  };
}
