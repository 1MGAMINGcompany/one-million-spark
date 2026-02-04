// Supabase Realtime Signaling for WebRTC
// Replaces localStorage polling with cross-device realtime communication

import { supabase } from "@/integrations/supabase/client";
import { RealtimeChannel } from "@supabase/supabase-js";

// Safe shortener to prevent crashes on undefined values
const short = (v: any) => (typeof v === "string" ? v.slice(0, 8) : "unknown");

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
  private messageQueue: SignalingMessage[] = [];

  constructor(
    private roomId: string,
    private localAddress: string,
    private onSignal: (signal: SignalingMessage) => void
  ) {}

  async connect(): Promise<void> {
    const channelName = `webrtc-${this.roomId}`;
    console.log(`[SupabaseSignaling] Connecting to channel: ${channelName}`);
    console.log(`[SupabaseSignaling] Local address: ${short(this.localAddress)}...`);
    
    return new Promise((resolve, reject) => {
      // Create a broadcast channel for WebRTC signaling
      this.channel = supabase.channel(channelName, {
        config: {
          broadcast: { 
            self: false, // Don't receive own messages
          },
        },
      });

      let resolved = false;
      
      this.channel
        .on("broadcast", { event: "signal" }, ({ payload }) => {
          if (!payload) {
            console.log("[SupabaseSignaling] Received empty payload, ignoring");
            return;
          }
          
          console.log(`[SupabaseSignaling] Received signal: ${payload.type} from ${short(payload.from)}... to ${short(payload.to)}...`);
          
          // Only process signals meant for us
          if (payload.to?.toLowerCase() === this.localAddress.toLowerCase()) {
            console.log(`[SupabaseSignaling] Signal is for us, processing...`);
            this.onSignal(payload as SignalingMessage);
          } else {
            console.log(`[SupabaseSignaling] Signal not for us (we are ${short(this.localAddress)}...), ignoring`);
          }
        })
        .subscribe((status, err) => {
          console.log(`[SupabaseSignaling] Subscription status: ${status}`);
          
          if (status === "SUBSCRIBED") {
            this.isConnected = true;
            console.log("[SupabaseSignaling] ✅ Successfully subscribed to channel");
            
            // Send any queued messages
            this.flushQueue();
            
            if (!resolved) {
              resolved = true;
              resolve();
            }
          } else if (status === "CHANNEL_ERROR") {
            console.error("[SupabaseSignaling] Channel error:", err);
            if (!resolved) {
              resolved = true;
              reject(new Error(`Channel error: ${err}`));
            }
          } else if (status === "TIMED_OUT") {
            console.error("[SupabaseSignaling] Subscription timed out");
            if (!resolved) {
              resolved = true;
              reject(new Error("Subscription timed out"));
            }
          } else if (status === "CLOSED") {
            console.log("[SupabaseSignaling] Channel closed");
            this.isConnected = false;
          }
        });
      
      // Timeout fallback - resolve after 3 seconds even if not subscribed
      setTimeout(() => {
        if (!resolved) {
          console.warn("[SupabaseSignaling] Subscription timeout, proceeding anyway");
          this.isConnected = true; // Assume it will connect
          resolved = true;
          resolve();
        }
      }, 3000);
    });
  }

  private async flushQueue(): Promise<void> {
    if (this.messageQueue.length === 0) return;
    
    console.log(`[SupabaseSignaling] Flushing ${this.messageQueue.length} queued messages`);
    const queue = [...this.messageQueue];
    this.messageQueue = [];
    
    for (const signal of queue) {
      await this.sendSignal(signal);
    }
  }

  async sendSignal(signal: SignalingMessage): Promise<void> {
    if (!this.channel) {
      console.warn("[SupabaseSignaling] Cannot send: channel not initialized, queuing...");
      this.messageQueue.push(signal);
      return;
    }

    if (!this.isConnected) {
      console.warn("[SupabaseSignaling] Not connected yet, queuing signal...");
      this.messageQueue.push(signal);
      return;
    }

    console.log(`[SupabaseSignaling] Sending signal: ${signal.type} to ${short(signal.to)}...`);
    
    // Retry up to 3 times
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const result = await this.channel.send({
          type: "broadcast",
          event: "signal",
          payload: signal,
        });
        
        if (result === "ok") {
          console.log(`[SupabaseSignaling] ✅ Signal sent successfully (attempt ${attempt + 1})`);
          return;
        } else {
          console.warn(`[SupabaseSignaling] Signal send result: ${result}, attempt ${attempt + 1}`);
          if (attempt < 2) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
      } catch (e) {
        console.error(`[SupabaseSignaling] Failed to send signal (attempt ${attempt + 1}):`, e);
        if (attempt < 2) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    }
    
    console.error("[SupabaseSignaling] Failed to send signal after 3 attempts");
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
    this.messageQueue = [];
  }
}
