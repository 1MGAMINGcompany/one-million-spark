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
  { urls: "stun:stun.cloudflare.com:3478" },
  // Free TURN server for mobile/restricted networks
  {
    urls: "turn:openrelay.metered.ca:80",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

export class WebRTCPeer {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private roomId: string;
  private localAddress: string;
  private remoteAddress: string | null = null;
  private callbacks: WebRTCCallbacks;
  private processedSignals: Set<string> = new Set();
  private isInitiator: boolean = false;
  private connectionEstablished: boolean = false;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  
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

    console.log(`[WebRTC] Connecting as ${isInitiator ? "INITIATOR" : "RESPONDER"}`);
    console.log(`[WebRTC] Local: ${this.localAddress.slice(0, 8)}..., Remote: ${this.remoteAddress.slice(0, 8)}...`);

    // Initialize Supabase Realtime signaling FIRST (so we can receive signals)
    await this.initSupabaseSignaling();

    // Create peer connection
    this.createPeerConnection();

    if (isInitiator) {
      // Create data channel (initiator creates it)
      this.dc = this.pc!.createDataChannel("game-sync", {
        ordered: true,
      });
      this.setupDataChannel(this.dc);

      // Wait for responder to be subscribed to signaling
      console.log("[WebRTC] Initiator waiting 2s for responder to subscribe...");
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Create and send offer
      console.log("[WebRTC] Creating offer...");
      const offer = await this.pc!.createOffer();
      await this.pc!.setLocalDescription(offer);

      console.log("[WebRTC] Sending offer via Supabase Realtime...");
      await this.supabaseSignaling!.sendSignal({
        type: "offer",
        roomId: this.roomId,
        from: this.localAddress,
        to: this.remoteAddress,
        payload: offer,
        timestamp: Date.now(),
      });
      console.log("[WebRTC] Offer sent, waiting for answer...");
    } else {
      console.log("[WebRTC] Responder ready, waiting for offer...");
    }
  }

  private createPeerConnection(): void {
    console.log("[WebRTC] Creating RTCPeerConnection...");
    
    this.pc = new RTCPeerConnection({ 
      iceServers: ICE_SERVERS,
      iceCandidatePoolSize: 10,
    });

    // Handle ICE candidates
    this.pc.onicecandidate = (event) => {
      if (event.candidate && this.supabaseSignaling && this.remoteAddress) {
        console.log("[WebRTC] Sending ICE candidate...");
        this.supabaseSignaling.sendSignal({
          type: "ice-candidate",
          roomId: this.roomId,
          from: this.localAddress,
          to: this.remoteAddress,
          payload: event.candidate.toJSON(),
          timestamp: Date.now(),
        });
      }
    };

    // Handle ICE gathering state
    this.pc.onicegatheringstatechange = () => {
      console.log(`[WebRTC] ICE gathering state: ${this.pc?.iceGatheringState}`);
    };

    // Handle ICE connection state
    this.pc.oniceconnectionstatechange = () => {
      const state = this.pc?.iceConnectionState;
      console.log(`[WebRTC] ICE connection state: ${state}`);
      
      if (state === "failed") {
        console.error("[WebRTC] ICE connection failed - may need TURN server");
        this.callbacks.onError(new Error("Connection failed - network may be restricted"));
      }
    };

    // Handle connection state
    this.pc.onconnectionstatechange = () => {
      const state = this.pc?.connectionState;
      console.log(`[WebRTC] Connection state: ${state}`);
      
      if (state === "connected") {
        console.log("[WebRTC] ✅ Peer connection established!");
        this.connectionEstablished = true;
        // Note: onConnected is called when data channel opens, not here
      } else if (state === "disconnected") {
        console.log("[WebRTC] Peer connection disconnected");
        this.connectionEstablished = false;
        this.callbacks.onDisconnected();
      } else if (state === "failed") {
        console.error("[WebRTC] Peer connection failed");
        this.connectionEstablished = false;
        this.callbacks.onDisconnected();
      }
    };

    // Handle incoming data channel (for responder)
    this.pc.ondatachannel = (event) => {
      console.log("[WebRTC] Received data channel from initiator");
      this.setupDataChannel(event.channel);
    };
  }

  private async initSupabaseSignaling(): Promise<void> {
    console.log("[WebRTC] Initializing Supabase Realtime signaling...");
    
    this.supabaseSignaling = new SupabaseSignaling(
      this.roomId,
      this.localAddress,
      (signal) => this.handleSupabaseSignal(signal)
    );

    await this.supabaseSignaling.connect();
    console.log("[WebRTC] Supabase Realtime signaling ready");
  }

  private async handleSupabaseSignal(signal: SignalingMessage): Promise<void> {
    // Create unique signal ID to avoid duplicates
    const signalId = `${signal.type}-${signal.from}-${signal.timestamp}`;
    if (this.processedSignals.has(signalId)) {
      console.log(`[WebRTC] Skipping duplicate signal: ${signal.type}`);
      return;
    }
    this.processedSignals.add(signalId);

    // Verify it's from our expected peer
    if (signal.from.toLowerCase() !== this.remoteAddress) {
      console.log(`[WebRTC] Ignoring signal from unknown peer: ${signal.from.slice(0, 8)}...`);
      return;
    }

    console.log(`[WebRTC] Processing signal: ${signal.type} from ${signal.from.slice(0, 8)}...`);

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
      this.callbacks.onError(e instanceof Error ? e : new Error(String(e)));
    }
  }

  private setupDataChannel(channel: RTCDataChannel): void {
    console.log(`[WebRTC] Setting up data channel, state: ${channel.readyState}`);
    this.dc = channel;

    channel.onopen = () => {
      console.log("[WebRTC] ✅ Data channel OPEN! Ready for messages.");
      this.connectionEstablished = true;
      this.callbacks.onConnected();
    };

    channel.onclose = () => {
      console.log("[WebRTC] Data channel closed");
      this.connectionEstablished = false;
      this.callbacks.onDisconnected();
    };

    channel.onerror = (error) => {
      console.error("[WebRTC] Data channel error:", error);
      this.callbacks.onError(new Error("Data channel error"));
    };

    channel.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("[WebRTC] Message received:", data.type || "unknown");
        this.callbacks.onMessage(data);
      } catch (e) {
        console.error("[WebRTC] Failed to parse message:", e);
      }
    };
    
    // If channel is already open (can happen), trigger connected immediately
    if (channel.readyState === "open") {
      console.log("[WebRTC] Data channel already open, triggering connected callback");
      this.connectionEstablished = true;
      this.callbacks.onConnected();
    }
  }

  private async handleOffer(offer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.pc) {
      console.error("[WebRTC] No peer connection for offer!");
      return;
    }

    console.log("[WebRTC] Received offer, setting remote description...");
    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));

    // Add any pending ICE candidates
    for (const candidate of this.pendingCandidates) {
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
        console.log("[WebRTC] Added pending ICE candidate");
      } catch (e) {
        console.warn("[WebRTC] Failed to add pending ICE candidate:", e);
      }
    }
    this.pendingCandidates = [];

    console.log("[WebRTC] Creating answer...");
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);

    console.log("[WebRTC] Sending answer via Supabase Realtime...");
    await this.supabaseSignaling!.sendSignal({
      type: "answer",
      roomId: this.roomId,
      from: this.localAddress,
      to: this.remoteAddress!,
      payload: answer,
      timestamp: Date.now(),
    });
  }

  private async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.pc) {
      console.error("[WebRTC] No peer connection for answer!");
      return;
    }

    console.log("[WebRTC] Received answer, setting remote description...");
    await this.pc.setRemoteDescription(new RTCSessionDescription(answer));

    // Add any pending ICE candidates
    for (const candidate of this.pendingCandidates) {
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
        console.log("[WebRTC] Added pending ICE candidate");
      } catch (e) {
        console.warn("[WebRTC] Failed to add pending ICE candidate:", e);
      }
    }
    this.pendingCandidates = [];
  }

  private async handleIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.pc) {
      console.warn("[WebRTC] No peer connection, queuing ICE candidate");
      this.pendingCandidates.push(candidate);
      return;
    }

    // If remote description not set yet, queue the candidate
    if (!this.pc.remoteDescription) {
      console.log("[WebRTC] Remote description not set, queuing ICE candidate");
      this.pendingCandidates.push(candidate);
      return;
    }

    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
      console.log("[WebRTC] Added ICE candidate");
    } catch (e) {
      console.warn("[WebRTC] Failed to add ICE candidate:", e);
    }
  }

  send(data: any): boolean {
    if (!this.dc) {
      console.warn("[WebRTC] Cannot send: no data channel");
      return false;
    }
    
    if (this.dc.readyState !== "open") {
      console.warn(`[WebRTC] Cannot send: data channel state is ${this.dc.readyState}`);
      return false;
    }

    try {
      this.dc.send(JSON.stringify(data));
      console.log("[WebRTC] Message sent successfully");
      return true;
    } catch (e) {
      console.error("[WebRTC] Failed to send:", e);
      return false;
    }
  }

  isConnected(): boolean {
    const dcOpen = this.dc?.readyState === "open";
    console.log(`[WebRTC] isConnected check: dcOpen=${dcOpen}, connectionEstablished=${this.connectionEstablished}`);
    return dcOpen;
  }

  isPushEnabled(): boolean {
    // Only return true if data channel is actually open (not just signaling)
    return this.dc?.readyState === "open";
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
    this.pendingCandidates = [];
    this.processedSignals.clear();
  }
}

// Clear old signals - now a no-op since we use Supabase Realtime
export function clearOldSignals(): void {
  // No-op: Supabase Realtime handles cleanup automatically
  console.log("[WebRTC] Using Supabase Realtime - no localStorage signals to clear");
}
