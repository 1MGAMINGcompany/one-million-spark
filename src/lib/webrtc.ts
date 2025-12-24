// WebRTC Peer Connection Manager for P2P Game Sync
// Uses Supabase Realtime for cross-device signaling

import { SupabaseSignaling, SignalingMessage } from "./supabase-signaling";

export interface RTCSignal {
  type: "offer" | "answer" | "ice-candidate";
  roomId: string;
  from: string;
  to?: string;
  payload: RTCSessionDescriptionInit | RTCIceCandidateInit;
  timestamp: number;
}

export interface WebRTCCallbacks {
  onConnected: () => void;
  onDisconnected: () => void;
  onMessage: (data: any) => void;
  onError: (error: Error) => void;
}

export interface WebRTCPeerOptions {
  usePushProtocol?: boolean; // Deprecated, kept for compatibility
}

// Free STUN servers for NAT traversal
const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun.stunprotocol.org:3478" },
];

export class WebRTCPeer {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private roomId: string;
  private localAddress: string;
  private remoteAddress: string | null = null;
  private callbacks: WebRTCCallbacks;
  private processedSignals: Set<number> = new Set();
  private isInitiator: boolean = false;
  private connectionEstablished: boolean = false;
  
  // Supabase Realtime signaling
  private supabaseSignaling: SupabaseSignaling | null = null;

  constructor(
    roomId: string,
    localAddress: string,
    callbacks: WebRTCCallbacks,
    _options: WebRTCPeerOptions = {}
  ) {
    this.roomId = roomId;
    this.localAddress = localAddress.toLowerCase();
    this.callbacks = callbacks;
  }

  async connect(remoteAddress: string, isInitiator: boolean): Promise<void> {
    this.remoteAddress = remoteAddress.toLowerCase();
    this.isInitiator = isInitiator;

    console.log(`[WebRTC] Connecting as ${isInitiator ? "initiator" : "responder"}`);
    console.log(`[WebRTC] Local: ${this.localAddress}, Remote: ${this.remoteAddress}`);

    // Initialize Supabase Realtime signaling
    await this.initSupabaseSignaling();

    // Create peer connection
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // Handle ICE candidates
    this.pc.onicecandidate = (event) => {
      if (event.candidate && this.supabaseSignaling) {
        this.supabaseSignaling.sendSignal({
          type: "ice-candidate",
          roomId: this.roomId,
          from: this.localAddress,
          to: this.remoteAddress!,
          payload: event.candidate.toJSON(),
          timestamp: Date.now(),
        });
      }
    };

    // Handle connection state
    this.pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Connection state: ${this.pc?.connectionState}`);
      if (this.pc?.connectionState === "connected") {
        this.connectionEstablished = true;
        this.callbacks.onConnected();
      } else if (
        this.pc?.connectionState === "disconnected" ||
        this.pc?.connectionState === "failed"
      ) {
        this.callbacks.onDisconnected();
      }
    };

    // Handle incoming data channel (for responder)
    this.pc.ondatachannel = (event) => {
      console.log("[WebRTC] Received data channel");
      this.setupDataChannel(event.channel);
    };

    if (isInitiator) {
      // Create data channel (initiator creates it)
      this.dc = this.pc.createDataChannel("game-sync", {
        ordered: true,
      });
      this.setupDataChannel(this.dc);

      // Create and send offer
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);

      if (this.supabaseSignaling) {
        await this.supabaseSignaling.sendSignal({
          type: "offer",
          roomId: this.roomId,
          from: this.localAddress,
          to: this.remoteAddress,
          payload: offer,
          timestamp: Date.now(),
        });
      }
    }
  }

  private async initSupabaseSignaling(): Promise<void> {
    console.log("[WebRTC] Initializing Supabase Realtime signaling...");
    
    this.supabaseSignaling = new SupabaseSignaling(
      this.roomId,
      this.localAddress,
      (signal) => this.handleSupabaseSignal(signal)
    );

    await this.supabaseSignaling.connect();
    console.log("[WebRTC] Supabase Realtime signaling initialized");
  }

  private async handleSupabaseSignal(signal: SignalingMessage): Promise<void> {
    if (this.processedSignals.has(signal.timestamp)) return;
    this.processedSignals.add(signal.timestamp);

    if (signal.from.toLowerCase() !== this.remoteAddress) return;

    console.log(`[WebRTC] Processing Supabase signal: ${signal.type}`);

    try {
      switch (signal.type) {
        case "offer":
          await this.handleOffer(signal.payload as RTCSessionDescriptionInit);
          break;
        case "answer":
          await this.handleAnswer(signal.payload as RTCSessionDescriptionInit);
          break;
        case "ice-candidate":
          await this.handleIceCandidate(signal.payload as RTCIceCandidateInit);
          break;
      }
    } catch (e) {
      console.error(`[WebRTC] Error processing signal:`, e);
    }
  }

  private setupDataChannel(channel: RTCDataChannel): void {
    this.dc = channel;

    channel.onopen = () => {
      console.log("[WebRTC] Data channel opened");
      this.callbacks.onConnected();
    };

    channel.onclose = () => {
      console.log("[WebRTC] Data channel closed");
      this.callbacks.onDisconnected();
    };

    channel.onerror = (error) => {
      console.error("[WebRTC] Data channel error:", error);
      this.callbacks.onError(new Error("Data channel error"));
    };

    channel.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.callbacks.onMessage(data);
      } catch (e) {
        console.error("[WebRTC] Failed to parse message:", e);
      }
    };
  }

  private async handleOffer(offer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.pc) return;

    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);

    if (this.supabaseSignaling) {
      await this.supabaseSignaling.sendSignal({
        type: "answer",
        roomId: this.roomId,
        from: this.localAddress,
        to: this.remoteAddress!,
        payload: answer,
        timestamp: Date.now(),
      });
    }
  }

  private async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.pc) return;
    await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
  }

  private async handleIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.pc) return;
    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.warn("[WebRTC] Failed to add ICE candidate:", e);
    }
  }

  send(data: any): boolean {
    if (!this.dc || this.dc.readyState !== "open") {
      console.warn("[WebRTC] Cannot send: data channel not open");
      return false;
    }

    try {
      this.dc.send(JSON.stringify(data));
      return true;
    } catch (e) {
      console.error("[WebRTC] Failed to send:", e);
      return false;
    }
  }

  isConnected(): boolean {
    return this.dc?.readyState === "open" || this.connectionEstablished;
  }

  isPushEnabled(): boolean {
    return this.supabaseSignaling?.getIsConnected() ?? false;
  }

  disconnect(): void {
    console.log("[WebRTC] Disconnecting");

    // Cleanup Supabase signaling
    if (this.supabaseSignaling) {
      this.supabaseSignaling.disconnect();
      this.supabaseSignaling = null;
    }

    if (this.dc) {
      this.dc.close();
      this.dc = null;
    }

    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }

    this.connectionEstablished = false;
  }
}

// Clear old signals - now a no-op since we use Supabase Realtime
export function clearOldSignals(): void {
  // No-op: Supabase Realtime handles cleanup automatically
  console.log("[WebRTC] Using Supabase Realtime - no localStorage signals to clear");
}
