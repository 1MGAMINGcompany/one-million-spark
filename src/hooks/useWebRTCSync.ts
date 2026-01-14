import { useEffect, useState, useCallback, useRef } from "react";
import { WebRTCPeer, clearOldSignals } from "@/lib/webrtc";
import { useWallet } from "@/hooks/useWallet";
import { useToast } from "@/hooks/use-toast";
import { useSound } from "@/contexts/SoundContext";
import { useRealtimeGameSync, RealtimeGameMessage } from "@/hooks/useRealtimeGameSync";
import { shouldDisableWebRTC } from "@/lib/walletBrowserDetection";

export interface GameMessage {
  type: "move" | "resign" | "draw_offer" | "draw_accept" | "draw_reject" | "sync_request" | "sync_response" | "heartbeat" | "chat" | "rematch_invite" | "rematch_accept" | "rematch_decline" | "rematch_ready" | "player_eliminated";
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
  const maxReconnectAttempts = 3; // Reduced since we have fallback
  const hasShownConnectedToast = useRef(false);
  const lastMessageTime = useRef<number>(Date.now());

  // HARD SWITCH: Detect wallet in-app browser and disable WebRTC entirely
  const webrtcDisabled = shouldDisableWebRTC();

  // Log sync mode on mount
  useEffect(() => {
    if (webrtcDisabled) {
      console.log("[WebRTCSync] 🔒 WebRTC DISABLED (wallet in-app browser) - using Realtime-only mode");
    } else {
      console.log("[WebRTCSync] Mode: WebRTC+Realtime fallback");
    }
  }, [webrtcDisabled]);

  // Store onMessage in a ref to avoid callback recreation issues
  const onMessageRef = useRef(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  // Determine if we're the initiator (based on address sorting)
  const localAddress = address?.toLowerCase() || "";
  const remoteAddress = players
    .map((p) => p.toLowerCase())
    .find((p) => p !== localAddress);
  
  // The player with the "lower" address initiates
  const isInitiator = localAddress && remoteAddress 
    ? localAddress < remoteAddress 
    : false;

  // Supabase Realtime fallback handler - uses ref to always have fresh callback
  const handleRealtimeMessage = useCallback((msg: RealtimeGameMessage) => {
    console.log("[WebRTCSync] Received via Realtime fallback:", msg.type);
    lastMessageTime.current = Date.now();
    onMessageRef.current?.({
      type: msg.type as GameMessage["type"],
      payload: msg.payload,
      timestamp: msg.timestamp,
      sender: msg.sender,
    });
  }, []); // Empty deps - uses ref

  // Supabase Realtime fallback - ALWAYS connected as backup
  const { 
    isConnected: realtimeConnected, 
    sendMessage: sendRealtimeMessage,
    resubscribe: realtimeResubscribe,
  } = useRealtimeGameSync({
    roomId: roomId || "",
    localAddress,
    onMessage: handleRealtimeMessage,
    enabled: enabled && !!localAddress && !!roomId,
  });

  // Show connected toast when Realtime connects (even if WebRTC fails)
  useEffect(() => {
    if (realtimeConnected && !hasShownConnectedToast.current) {
      hasShownConnectedToast.current = true;
      setConnectionState("connected");
      setIsPushEnabled(true);
      play("rooms/player-join");
      toast({
        title: "Connected",
        description: "Game sync established",
      });
    }
  }, [realtimeConnected, play, toast]);

  // Connect to peer (WebRTC)
  const connect = useCallback(async () => {
    // HARD SWITCH: Skip WebRTC entirely in wallet browsers
    if (webrtcDisabled) {
      console.log("[WebRTCSync] Skipping WebRTC connection (wallet browser)");
      return;
    }

    if (!enabled || !localAddress || !remoteAddress || !roomId) {
      console.log("[WebRTCSync] Not ready to connect:", { enabled, localAddress, remoteAddress, roomId });
      return;
    }

    // Clean up existing connection
    if (peerRef.current) {
      peerRef.current.disconnect();
      peerRef.current = null;
    }

    console.log(`[WebRTCSync] Connecting WebRTC to peer ${remoteAddress.slice(0, 8)}...`);

    const peer = new WebRTCPeer(roomId, localAddress, {
      onConnected: () => {
        console.log("[WebRTCSync] ✅ WebRTC data channel connected!");
        setIsConnected(true);
        setConnectionState("connected");
        setIsPushEnabled(true);
        reconnectAttempts.current = 0;
      },
      onDisconnected: () => {
        console.log("[WebRTCSync] WebRTC disconnected, using Realtime fallback");
        setIsConnected(false);
        // Don't set disconnected state - Realtime is still working
        
        // Try reconnect WebRTC in background
        if (reconnectAttempts.current < maxReconnectAttempts) {
          reconnectAttempts.current++;
          console.log(`[WebRTCSync] WebRTC reconnect attempt ${reconnectAttempts.current}`);
          setTimeout(connect, 3000 * reconnectAttempts.current);
        }
      },
      onMessage: (data: GameMessage) => {
        console.log("[WebRTCSync] Received via WebRTC:", data.type);
        lastMessageTime.current = Date.now();
        onMessageRef.current?.(data);
      },
      onError: (error) => {
        console.error("[WebRTCSync] WebRTC error (using Realtime fallback):", error.message);
        // Don't show toast - Realtime fallback is working
      },
    });

    peerRef.current = peer;
    
    try {
      await peer.connect(remoteAddress, isInitiator);
    } catch (e) {
      console.error("[WebRTCSync] WebRTC connection failed, using Realtime fallback");
    }
  }, [enabled, localAddress, remoteAddress, roomId, isInitiator, webrtcDisabled]);

  // Initialize connection
  useEffect(() => {
    // Clear old signals on mount (always safe)
    clearOldSignals();

    // HARD SWITCH: Skip ALL WebRTC setup (no signaling, no timers) when disabled
    // Especially critical for initiators (mobile creators) to prevent freeze
    if (webrtcDisabled) {
      console.log(`[WebRTCSync] 🔒 Realtime-only mode - skipping WebRTC setup entirely (isInitiator: ${isInitiator})`);
      return; // NO cleanup needed - nothing was set up
    }

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
  }, [enabled, localAddress, remoteAddress, isInitiator, connect, webrtcDisabled]);

  // Send heartbeat (only via WebRTC if connected and not disabled)
  useEffect(() => {
    // Skip heartbeat in Realtime-only mode
    if (!isConnected || webrtcDisabled) return;

    const interval = setInterval(() => {
      if (peerRef.current) {
        peerRef.current.send({ type: "heartbeat", timestamp: Date.now() });
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [isConnected, webrtcDisabled]);

  // Send a message - try WebRTC first, fallback to Realtime
  const sendMessage = useCallback((message: Omit<GameMessage, "timestamp">): boolean => {
    const fullMessage: GameMessage = {
      ...message,
      timestamp: Date.now(),
    };
    
    // Try WebRTC first
    if (peerRef.current && peerRef.current.isConnected()) {
      const sent = peerRef.current.send(fullMessage);
      if (sent) {
        console.log(`[WebRTCSync] Sent via WebRTC: ${message.type}`);
        return true;
      }
    }
    
    // Fallback to Supabase Realtime
    console.log(`[WebRTCSync] Sending via Realtime fallback: ${message.type}`);
    sendRealtimeMessage({ type: message.type, payload: message.payload });
    return true; // Realtime is fire-and-forget but reliable
  }, [sendRealtimeMessage]);

  // Send a game move
  const sendMove = useCallback((moveData: any): boolean => {
    return sendMessage({ type: "move", payload: moveData });
  }, [sendMessage]);

  // Send resignation with forfeiting player's wallet
  const sendResign = useCallback((): boolean => {
    return sendMessage({ 
      type: "resign", 
      payload: { forfeitingWallet: localAddress } 
    });
  }, [sendMessage, localAddress]);

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

  // Send player elimination (for Ludo)
  const sendPlayerEliminated = useCallback((playerIndex: number): boolean => {
    return sendMessage({ type: "player_eliminated", payload: { playerIndex }, sender: localAddress });
  }, [sendMessage, localAddress]);

  // Manual reconnect
  const reconnect = useCallback(() => {
    reconnectAttempts.current = 0;
    connect();
  }, [connect]);

  // Resubscribe realtime channel (for InAppBrowserRecovery)
  const resubscribeRealtime = useCallback(async () => {
    console.log("[WebRTCSync] Resubscribing realtime channel...");
    await realtimeResubscribe();
  }, [realtimeResubscribe]);

  return {
    isConnected: isConnected || realtimeConnected, // Connected if either works
    isPushEnabled: isPushEnabled || realtimeConnected,
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
    sendPlayerEliminated,
    reconnect,
    resubscribeRealtime,
    peerAddress: remoteAddress,
  };
}
