// WebRTC Sync - Solana Migration (Push Protocol removed)
// Uses BroadcastChannel for same-browser sync only

export interface WebRTCPeerOptions {
  onConnected?: () => void;
  onDisconnected?: () => void;
  onMessage?: (data: any) => void;
  onError?: (error: Error) => void;
}

// Stub WebRTCPeer class using BroadcastChannel for local sync
export class WebRTCPeer {
  private roomId: string;
  private localAddress: string;
  private options: WebRTCPeerOptions;
  private channel: BroadcastChannel | null = null;
  private connected = false;

  constructor(roomId: string, localAddress: string, options: WebRTCPeerOptions) {
    this.roomId = roomId;
    this.localAddress = localAddress;
    this.options = options;
  }

  async connect(remoteAddress: string, isInitiator: boolean): Promise<void> {
    console.log("[WebRTC] Using BroadcastChannel for local sync (Solana mode)");
    
    try {
      this.channel = new BroadcastChannel(`1m-game-${this.roomId}`);
      
      this.channel.onmessage = (event) => {
        if (event.data?.sender !== this.localAddress) {
          this.options.onMessage?.(event.data);
        }
      };

      this.connected = true;
      this.options.onConnected?.();
    } catch (error) {
      console.error("[WebRTC] BroadcastChannel error:", error);
      this.options.onError?.(error as Error);
    }
  }

  send(data: any): boolean {
    if (!this.channel || !this.connected) return false;
    
    try {
      this.channel.postMessage({ ...data, sender: this.localAddress });
      return true;
    } catch {
      return false;
    }
  }

  disconnect(): void {
    this.connected = false;
    this.channel?.close();
    this.channel = null;
    this.options.onDisconnected?.();
  }

  isPushEnabled(): boolean {
    return false; // Push Protocol removed
  }
}

// Clear old signals - no-op for Solana
export function clearOldSignals(): void {
  // No-op - Push Protocol removed
}
