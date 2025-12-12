// WebRTC Peer Connection Manager for P2P Game Sync
// Uses Push Protocol for cross-device signaling and localStorage as fallback
import * as PushAPI from "@pushprotocol/restapi";
import {
  initPushUser,
  sendPushSignal,
  startPushSignalListener,
  fetchRecentSignals,
  PushSignal,
} from "./pushSignaling";

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
  usePushProtocol?: boolean;
}

// Free STUN servers for NAT traversal
const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun.stunprotocol.org:3478" },
];

const SIGNAL_KEY_PREFIX = "webrtc_signal_";
const SIGNAL_POLL_INTERVAL = 500; // ms

export class WebRTCPeer {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private roomId: string;
  private localAddress: string;
  private remoteAddress: string | null = null;
  private callbacks: WebRTCCallbacks;
  private signalPollInterval: NodeJS.Timeout | null = null;
  private processedSignals: Set<number> = new Set();
  private isInitiator: boolean = false;
  private connectionEstablished: boolean = false;
  
  // Push Protocol
  private usePushProtocol: boolean;
  private pushUser: PushAPI.PushAPI | null = null;
  private pushStreamCleanup: (() => void) | null = null;
  private pushInitialized: boolean = false;

  constructor(
    roomId: string,
    localAddress: string,
    callbacks: WebRTCCallbacks,
    options: WebRTCPeerOptions = {}
  ) {
    this.roomId = roomId;
    this.localAddress = localAddress.toLowerCase();
    this.callbacks = callbacks;
    this.usePushProtocol = options.usePushProtocol ?? true;
  }

  async connect(remoteAddress: string, isInitiator: boolean): Promise<void> {
    this.remoteAddress = remoteAddress.toLowerCase();
    this.isInitiator = isInitiator;

    console.log(`[WebRTC] Connecting as ${isInitiator ? "initiator" : "responder"}`);
    console.log(`[WebRTC] Local: ${this.localAddress}, Remote: ${this.remoteAddress}`);
    console.log(`[WebRTC] Using Push Protocol: ${this.usePushProtocol}`);

    // Initialize Push Protocol if enabled
    if (this.usePushProtocol) {
      await this.initPushProtocol();
    }

    // Create peer connection
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // Handle ICE candidates
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal({
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

    // Start polling for localStorage signals (fallback)
    this.startSignalPolling();

    // Fetch any recent Push signals we might have missed
    if (this.usePushProtocol && this.pushUser) {
      await this.fetchMissedPushSignals();
    }

    if (isInitiator) {
      // Create data channel (initiator creates it)
      this.dc = this.pc.createDataChannel("game-sync", {
        ordered: true,
      });
      this.setupDataChannel(this.dc);

      // Create and send offer
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);

      this.sendSignal({
        type: "offer",
        roomId: this.roomId,
        from: this.localAddress,
        to: this.remoteAddress,
        payload: offer,
        timestamp: Date.now(),
      });
    }
  }

  private async initPushProtocol(): Promise<void> {
    try {
      console.log("[WebRTC] Initializing Push Protocol...");
      this.pushUser = await initPushUser(this.localAddress);
      
      // Start listening for Push signals
      this.pushStreamCleanup = await startPushSignalListener(
        this.pushUser,
        this.roomId,
        this.localAddress,
        (signal) => this.handlePushSignal(signal)
      );
      
      this.pushInitialized = true;
      console.log("[WebRTC] Push Protocol initialized successfully");
    } catch (error) {
      console.warn("[WebRTC] Push Protocol initialization failed, using localStorage only:", error);
      this.usePushProtocol = false;
    }
  }

  private async fetchMissedPushSignals(): Promise<void> {
    if (!this.pushUser || !this.remoteAddress) return;

    try {
      const signals = await fetchRecentSignals(
        this.pushUser,
        this.remoteAddress,
        this.roomId,
        this.localAddress
      );

      for (const signal of signals) {
        await this.handlePushSignal(signal);
      }
    } catch (error) {
      console.warn("[WebRTC] Failed to fetch missed signals:", error);
    }
  }

  private async handlePushSignal(signal: PushSignal): Promise<void> {
    if (this.processedSignals.has(signal.timestamp)) return;
    this.processedSignals.add(signal.timestamp);

    if (signal.from.toLowerCase() !== this.remoteAddress) return;

    console.log(`[WebRTC] Processing Push signal: ${signal.type}`);

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
      console.error(`[WebRTC] Error processing Push signal:`, e);
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

  private async sendSignal(signal: RTCSignal): Promise<void> {
    // Send via Push Protocol if available
    if (this.usePushProtocol && this.pushUser && signal.to) {
      try {
        await sendPushSignal(this.pushUser, {
          type: signal.type,
          roomId: signal.roomId,
          from: signal.from,
          to: signal.to,
          payload: signal.payload,
          timestamp: signal.timestamp,
        });
        console.log(`[WebRTC] Sent Push signal: ${signal.type}`);
      } catch (error) {
        console.warn("[WebRTC] Push signal failed, using localStorage:", error);
      }
    }

    // Always send via localStorage as fallback (for same-browser tabs)
    const key = `${SIGNAL_KEY_PREFIX}${this.roomId}_${signal.to}`;
    const existing = localStorage.getItem(key);
    const signals: RTCSignal[] = existing ? JSON.parse(existing) : [];
    signals.push(signal);
    
    // Keep only recent signals (last 50)
    const trimmed = signals.slice(-50);
    localStorage.setItem(key, JSON.stringify(trimmed));

    console.log(`[WebRTC] Sent localStorage signal: ${signal.type}`);
  }

  private startSignalPolling(): void {
    this.signalPollInterval = setInterval(() => {
      this.pollSignals();
    }, SIGNAL_POLL_INTERVAL);
  }

  private async pollSignals(): Promise<void> {
    if (!this.pc) return;

    const key = `${SIGNAL_KEY_PREFIX}${this.roomId}_${this.localAddress}`;
    const existing = localStorage.getItem(key);
    if (!existing) return;

    const signals: RTCSignal[] = JSON.parse(existing);

    for (const signal of signals) {
      // Skip already processed signals
      if (this.processedSignals.has(signal.timestamp)) continue;
      this.processedSignals.add(signal.timestamp);

      // Skip signals not from our peer
      if (signal.from !== this.remoteAddress) continue;

      console.log(`[WebRTC] Processing localStorage signal: ${signal.type}`);

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
  }

  private async handleOffer(offer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.pc) return;

    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);

    this.sendSignal({
      type: "answer",
      roomId: this.roomId,
      from: this.localAddress,
      to: this.remoteAddress!,
      payload: answer,
      timestamp: Date.now(),
    });
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
    return this.pushInitialized;
  }

  disconnect(): void {
    console.log("[WebRTC] Disconnecting");

    if (this.signalPollInterval) {
      clearInterval(this.signalPollInterval);
      this.signalPollInterval = null;
    }

    // Cleanup Push Protocol stream
    if (this.pushStreamCleanup) {
      this.pushStreamCleanup();
      this.pushStreamCleanup = null;
    }

    if (this.dc) {
      this.dc.close();
      this.dc = null;
    }

    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }

    // Clean up localStorage signals
    const key = `${SIGNAL_KEY_PREFIX}${this.roomId}_${this.localAddress}`;
    localStorage.removeItem(key);

    this.connectionEstablished = false;
    this.pushInitialized = false;
    this.pushUser = null;
  }
}

// Clear old signals on page load
export function clearOldSignals(): void {
  const keys = Object.keys(localStorage).filter((k) =>
    k.startsWith(SIGNAL_KEY_PREFIX)
  );
  const now = Date.now();
  const maxAge = 5 * 60 * 1000; // 5 minutes

  for (const key of keys) {
    try {
      const signals: RTCSignal[] = JSON.parse(localStorage.getItem(key) || "[]");
      const recent = signals.filter((s) => now - s.timestamp < maxAge);
      if (recent.length === 0) {
        localStorage.removeItem(key);
      } else if (recent.length !== signals.length) {
        localStorage.setItem(key, JSON.stringify(recent));
      }
    } catch (e) {
      localStorage.removeItem(key);
    }
  }
}
