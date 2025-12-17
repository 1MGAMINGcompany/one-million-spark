// WebRTC Peer Connection Manager for P2P Game Sync
// Uses localStorage/BroadcastChannel only (Push Protocol removed for Solana)

import { PushSignal } from "./pushSignaling";

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
];

const SIGNAL_KEY_PREFIX = "webrtc_signal_";
const SIGNAL_POLL_INTERVAL = 500;

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

  constructor(
    roomId: string,
    localAddress: string,
    callbacks: WebRTCCallbacks,
    options: WebRTCPeerOptions = {}
  ) {
    this.roomId = roomId;
    this.localAddress = localAddress.toLowerCase();
    this.callbacks = callbacks;
  }

  async connect(remoteAddress: string, isInitiator: boolean): Promise<void> {
    this.remoteAddress = remoteAddress.toLowerCase();
    this.isInitiator = isInitiator;

    console.log(`[WebRTC] Connecting as ${isInitiator ? "initiator" : "responder"}`);

    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

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

    this.pc.ondatachannel = (event) => {
      console.log("[WebRTC] Received data channel");
      this.setupDataChannel(event.channel);
    };

    this.startSignalPolling();

    if (isInitiator) {
      this.dc = this.pc.createDataChannel("game-sync", { ordered: true });
      this.setupDataChannel(this.dc);

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
    // Send via localStorage (for same-browser tabs)
    const key = `${SIGNAL_KEY_PREFIX}${this.roomId}_${signal.to}`;
    const existing = localStorage.getItem(key);
    const signals: RTCSignal[] = existing ? JSON.parse(existing) : [];
    signals.push(signal);
    
    const trimmed = signals.slice(-50);
    localStorage.setItem(key, JSON.stringify(trimmed));
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
      if (this.processedSignals.has(signal.timestamp)) continue;
      this.processedSignals.add(signal.timestamp);
      if (signal.from !== this.remoteAddress) continue;

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
    return false;
  }

  disconnect(): void {
    if (this.signalPollInterval) {
      clearInterval(this.signalPollInterval);
      this.signalPollInterval = null;
    }
    if (this.dc) {
      this.dc.close();
      this.dc = null;
    }
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    const key = `${SIGNAL_KEY_PREFIX}${this.roomId}_${this.localAddress}`;
    localStorage.removeItem(key);
    this.connectionEstablished = false;
  }
}

export function clearOldSignals(): void {
  const keys = Object.keys(localStorage).filter((k) =>
    k.startsWith(SIGNAL_KEY_PREFIX)
  );
  const now = Date.now();
  const maxAge = 5 * 60 * 1000;

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
