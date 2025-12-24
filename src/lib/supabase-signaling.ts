// Supabase Realtime Signaling for WebRTC
// Replaces localStorage polling with cross-device realtime communication

import { supabase } from "@/integrations/supabase/client";
import { RealtimeChannel } from "@supabase/supabase-js";

export interface SignalingMessage {
  type: "offer" | "answer" | "ice-candidate";
  roomId: string;
  from: string;
  to: string;
  payload: RTCSessionDescriptionInit | RTCIceCandidateInit;
  timestamp: number;
}

export class SupabaseSignaling {
  private channel: RealtimeChannel | null = null;
  private isConnected: boolean = false;

  constructor(
    private roomId: string,
    private localAddress: string,
    private onSignal: (signal: SignalingMessage) => void
  ) {}

  async connect(): Promise<void> {
    console.log(`[SupabaseSignaling] Connecting to room: webrtc-${this.roomId}`);
    
    return new Promise((resolve) => {
      // Create a broadcast channel for WebRTC signaling
      this.channel = supabase.channel(`webrtc-${this.roomId}`, {
        config: {
          broadcast: { self: false }, // Don't receive own messages
        },
      });

      this.channel
        .on("broadcast", { event: "signal" }, ({ payload }) => {
          console.log(`[SupabaseSignaling] Received signal:`, payload?.type);
          
          // Only process signals meant for us
          if (payload && payload.to?.toLowerCase() === this.localAddress.toLowerCase()) {
            this.onSignal(payload as SignalingMessage);
          }
        })
        .subscribe((status) => {
          console.log(`[SupabaseSignaling] Subscription status:`, status);
          this.isConnected = status === "SUBSCRIBED";
          if (status === "SUBSCRIBED") {
            resolve();
          }
        });
      
      // Timeout fallback - resolve after 3 seconds even if not subscribed
      setTimeout(() => {
        console.log("[SupabaseSignaling] Subscription timeout, proceeding anyway");
        resolve();
      }, 3000);
    });
  }

  async sendSignal(signal: SignalingMessage): Promise<void> {
    if (!this.channel) {
      console.warn("[SupabaseSignaling] Cannot send: channel not initialized");
      return;
    }

    console.log(`[SupabaseSignaling] Sending signal: ${signal.type} to ${signal.to}`);
    
    await this.channel.send({
      type: "broadcast",
      event: "signal",
      payload: signal,
    });
  }

  getIsConnected(): boolean {
    return this.isConnected;
  }

  disconnect(): void {
    console.log("[SupabaseSignaling] Disconnecting");
    if (this.channel) {
      supabase.removeChannel(this.channel);
      this.channel = null;
    }
    this.isConnected = false;
  }
}
