import { useEffect, useState, useCallback, useRef } from "react";
import { WebRTCPeer, clearOldSignals } from "@/lib/webrtc";
import { useWallet } from "@/hooks/useWallet";
import { useToast } from "@/hooks/use-toast";
import { useSound } from "@/contexts/SoundContext";

export interface GameMessage {
  type: "move" | "resign" | "draw_offer" | "draw_accept" | "draw_reject" | "sync_request" | "sync_response" | "heartbeat" | "chat" | "rematch_invite" | "rematch_accept" | "rematch_decline" | "rematch_ready";
  payload?: any;
  timestamp: number;
  sender?: string;
}

interface UseWebRTCSyncOptions {
  roomId: string;
  players: string[];
  onMessage?: (message: GameMessage) => void;
  enabled?: boolean;
}

export function useWebRTCSync({
  roomId,
  players,
  onMessage,
  enabled = true,
}: UseWebRTCSyncOptions) {
  const { address } = useWallet();
  const { toast } = useToast();
  const { play } = useSound();
  
  const [isConnected, setIsConnected] = useState(false);
  const [isPushEnabled, setIsPushEnabled] = useState(false);
  const [connectionState, setConnectionState] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const peerRef = useRef<WebRTCPeer | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  // Determine if we're the initiator (based on address sorting)
  const localAddress = address?.toLowerCase() || "";
  const remoteAddress = players
    .map((p) => p.toLowerCase())
    .find((p) => p !== localAddress);
  
  // The player with the "lower" address initiates
  const isInitiator = localAddress && remoteAddress 
    ? localAddress < remoteAddress 
    : false;

  // Connect to peer
  const connect = useCallback(async () => {
    if (!enabled || !localAddress || !remoteAddress || !roomId) {
      console.log("[WebRTCSync] Not ready to connect:", { enabled, localAddress, remoteAddress, roomId });
      return;
    }

    // Clean up existing connection
    if (peerRef.current) {
      peerRef.current.disconnect();
      peerRef.current = null;
    }

    setConnectionState("connecting");
    console.log(`[WebRTCSync] Connecting to peer ${remoteAddress}`);

    const peer = new WebRTCPeer(roomId, localAddress, {
      onConnected: () => {
        console.log("[WebRTCSync] ✅ Data channel connected!");
        setIsConnected(true);
        setConnectionState("connected");
        setIsPushEnabled(true); // Data channel is open
        reconnectAttempts.current = 0;
        play("rooms/player-join");
        toast({
          title: "Connected",
          description: "Real-time game sync established",
        });
      },
      onDisconnected: () => {
        console.log("[WebRTCSync] Disconnected");
        setIsConnected(false);
        setConnectionState("disconnected");
        
        // Auto-reconnect
        if (reconnectAttempts.current < maxReconnectAttempts) {
          reconnectAttempts.current++;
          console.log(`[WebRTCSync] Reconnecting (attempt ${reconnectAttempts.current})`);
          setTimeout(connect, 2000 * reconnectAttempts.current);
        }
      },
      onMessage: (data: GameMessage) => {
        console.log("[WebRTCSync] Received:", data.type);
        onMessage?.(data);
      },
      onError: (error) => {
        console.error("[WebRTCSync] Error:", error);
        toast({
          title: "Connection Error",
          description: error.message,
          variant: "destructive",
        });
      },
    });

    peerRef.current = peer;
    
    try {
      await peer.connect(remoteAddress, isInitiator);
    } catch (e) {
      console.error("[WebRTCSync] Connection failed:", e);
    }
  }, [enabled, localAddress, remoteAddress, roomId, isInitiator, onMessage, play, toast]);

  // Initialize connection
  useEffect(() => {
    // Clear old signals on mount
    clearOldSignals();

    if (enabled && localAddress && remoteAddress) {
      console.log(`[WebRTCSync] Ready to connect - local: ${localAddress.slice(0, 8)}, remote: ${remoteAddress.slice(0, 8)}, initiator: ${isInitiator}`);
      
      // Initiator starts immediately, responder waits to ensure signaling is subscribed
      const delay = isInitiator ? 1000 : 2500;
      console.log(`[WebRTCSync] Waiting ${delay}ms before connecting...`);
      
      const timeout = setTimeout(() => {
        connect();
      }, delay);

      return () => {
        clearTimeout(timeout);
        if (peerRef.current) {
          peerRef.current.disconnect();
          peerRef.current = null;
        }
      };
    }
  }, [enabled, localAddress, remoteAddress, isInitiator, connect]);

  // Send heartbeat
  useEffect(() => {
    if (!isConnected) return;

    const interval = setInterval(() => {
      if (peerRef.current) {
        peerRef.current.send({ type: "heartbeat", timestamp: Date.now() });
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [isConnected]);

  // Send a message
  const sendMessage = useCallback((message: Omit<GameMessage, "timestamp">): boolean => {
    if (!peerRef.current) return false;
    
    const fullMessage: GameMessage = {
      ...message,
      timestamp: Date.now(),
    };
    
    return peerRef.current.send(fullMessage);
  }, []);

  // Send a game move
  const sendMove = useCallback((moveData: any): boolean => {
    return sendMessage({ type: "move", payload: moveData });
  }, [sendMessage]);

  // Send resignation
  const sendResign = useCallback((): boolean => {
    return sendMessage({ type: "resign" });
  }, [sendMessage]);

  // Send draw offer
  const sendDrawOffer = useCallback((): boolean => {
    toast({
      title: "Draw Offered",
      description: "Waiting for opponent's response...",
    });
    return sendMessage({ type: "draw_offer" });
  }, [sendMessage, toast]);

  // Accept draw
  const sendDrawAccept = useCallback((): boolean => {
    return sendMessage({ type: "draw_accept" });
  }, [sendMessage]);

  // Reject draw
  const sendDrawReject = useCallback((): boolean => {
    return sendMessage({ type: "draw_reject" });
  }, [sendMessage]);

  // Request state sync
  const requestSync = useCallback((): boolean => {
    return sendMessage({ type: "sync_request" });
  }, [sendMessage]);

  // Respond to sync request
  const respondSync = useCallback((gameState: any): boolean => {
    return sendMessage({ type: "sync_response", payload: gameState });
  }, [sendMessage]);

  // Send chat message
  const sendChat = useCallback((text: string): boolean => {
    return sendMessage({ type: "chat", payload: text, sender: localAddress });
  }, [sendMessage, localAddress]);

  // Send rematch invite
  const sendRematchInvite = useCallback((rematchData: any): boolean => {
    return sendMessage({ type: "rematch_invite", payload: rematchData, sender: localAddress });
  }, [sendMessage, localAddress]);

  // Accept rematch invite
  const sendRematchAccept = useCallback((roomId: string): boolean => {
    return sendMessage({ type: "rematch_accept", payload: { roomId }, sender: localAddress });
  }, [sendMessage, localAddress]);

  // Decline rematch invite
  const sendRematchDecline = useCallback((roomId: string): boolean => {
    return sendMessage({ type: "rematch_decline", payload: { roomId }, sender: localAddress });
  }, [sendMessage, localAddress]);

  // Signal rematch is ready (all accepted)
  const sendRematchReady = useCallback((roomId: string): boolean => {
    return sendMessage({ type: "rematch_ready", payload: { roomId }, sender: localAddress });
  }, [sendMessage, localAddress]);

  // Manual reconnect
  const reconnect = useCallback(() => {
    reconnectAttempts.current = 0;
    connect();
  }, [connect]);

  return {
    isConnected,
    isPushEnabled,
    connectionState,
    sendMove,
    sendResign,
    sendDrawOffer,
    sendDrawAccept,
    sendDrawReject,
    requestSync,
    respondSync,
    sendChat,
    sendRematchInvite,
    sendRematchAccept,
    sendRematchDecline,
    sendRematchReady,
    reconnect,
    peerAddress: remoteAddress,
  };
}
