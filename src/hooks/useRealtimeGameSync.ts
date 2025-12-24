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
  const lastMessageTime = useRef<number>(Date.now());
  const reconnectAttempts = useRef(0);
  
  // Store onMessage in a ref to avoid subscription re-creation on every render
  const onMessageRef = useRef(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  // Store localAddress in ref too for stable comparisons
  const localAddressRef = useRef(localAddress);
  useEffect(() => {
    localAddressRef.current = localAddress;
  }, [localAddress]);

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
        
        // Deduplicate by message ID
        const msgId = `${payload.type}-${payload.sender}-${payload.timestamp}`;
        if (processedIds.current.has(msgId)) {
          console.log(`[RealtimeGameSync] Skipping duplicate: ${msgId}`);
          return;
        }
        processedIds.current.add(msgId);
        
        // Limit processed IDs set size to prevent memory leak
        if (processedIds.current.size > 500) {
          const ids = Array.from(processedIds.current);
          processedIds.current = new Set(ids.slice(-250));
        }
        
        // Ignore our own messages
        if (payload.sender?.toLowerCase() === localAddressRef.current.toLowerCase()) {
          console.log(`[RealtimeGameSync] Ignoring own message: ${payload.type}`);
          return;
        }
        
        console.log(`[RealtimeGameSync] Received: ${payload.type} from ${payload.sender?.slice(0, 8)}...`);
        lastMessageTime.current = Date.now();
        reconnectAttempts.current = 0; // Reset on successful message
        onMessageRef.current(payload as RealtimeGameMessage);
      })
      .subscribe((status) => {
        console.log(`[RealtimeGameSync] Status: ${status}`);
        if (status === "SUBSCRIBED") {
          setIsConnected(true);
          lastMessageTime.current = Date.now();
          reconnectAttempts.current = 0;
        } else if (status === "CLOSED" || status === "CHANNEL_ERROR") {
          setIsConnected(false);
        }
      });

    channelRef.current = channel;

    // Heartbeat check - reconnect if no messages for 30 seconds
    const heartbeatInterval = setInterval(() => {
      const timeSinceLastMessage = Date.now() - lastMessageTime.current;
      if (timeSinceLastMessage > 30000 && channelRef.current && reconnectAttempts.current < 3) {
        console.log(`[RealtimeGameSync] No messages for ${Math.round(timeSinceLastMessage / 1000)}s, reconnecting...`);
        reconnectAttempts.current++;
        
        // Unsubscribe and resubscribe
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
        setIsConnected(false);
        
        // Small delay before reconnecting
        setTimeout(() => {
          const newChannel = supabase.channel(channelName, {
            config: { broadcast: { self: false } },
          });
          
          newChannel
            .on("broadcast", { event: "game_move" }, ({ payload }) => {
              if (!payload) return;
              const msgId = `${payload.type}-${payload.sender}-${payload.timestamp}`;
              if (processedIds.current.has(msgId)) return;
              processedIds.current.add(msgId);
              if (payload.sender?.toLowerCase() === localAddressRef.current.toLowerCase()) return;
              lastMessageTime.current = Date.now();
              reconnectAttempts.current = 0;
              onMessageRef.current(payload as RealtimeGameMessage);
            })
            .subscribe((status) => {
              if (status === "SUBSCRIBED") {
                setIsConnected(true);
                lastMessageTime.current = Date.now();
              }
            });
          
          channelRef.current = newChannel;
        }, 500);
      }
    }, 10000);

    return () => {
      console.log(`[RealtimeGameSync] Unsubscribing from ${channelName}`);
      clearInterval(heartbeatInterval);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      setIsConnected(false);
    };
  }, [enabled, roomId, localAddress]); // Removed onMessage from deps - using ref instead

  const sendMessage = useCallback(async (message: Omit<RealtimeGameMessage, "sender" | "timestamp">) => {
    if (!channelRef.current) {
      console.warn("[RealtimeGameSync] No channel to send message");
      return false;
    }

    const fullMessage: RealtimeGameMessage = {
      ...message,
      sender: localAddressRef.current,
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
  }, []);

  return {
    isConnected,
    sendMessage,
  };
}
