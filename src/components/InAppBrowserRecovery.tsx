/**
 * InAppBrowserRecovery Component (Phase 1)
 * 
 * Wraps game content to handle wallet disconnection in in-app browsers (Phantom, Solflare).
 * Provides:
 * - A visible "Reconnect" overlay instead of black screen
 * - Auto-reconnect on visibility/focus events
 * - Server state refetch after reconnection
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { WifiOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/hooks/useWallet";
import { isWalletInAppBrowser } from "@/lib/walletBrowserDetection";
import { refetchGameSession } from "@/lib/sessionRefetch";

interface InAppBrowserRecoveryProps {
  roomPda: string;
  children: React.ReactNode;
}

export function InAppBrowserRecovery({ roomPda, children }: InAppBrowserRecoveryProps) {
  const wallet = useWallet();
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [didReconnect, setDidReconnect] = useState(false);
  const [didRefetch, setDidRefetch] = useState(false);
  
  // Track if we're in a wallet in-app browser
  const inWalletBrowser = isWalletInAppBrowser();
  
  // Refs for stable values in callbacks
  const roomPdaRef = useRef(roomPda);
  useEffect(() => { roomPdaRef.current = roomPda; }, [roomPda]);

  // Debug log for game room context
  useEffect(() => {
    if (roomPda) {
      console.log("[InAppRecovery]", {
        inWalletBrowser,
        connected: wallet.isConnected,
        roomPda: roomPda?.slice(0, 8),
        didReconnect,
        didRefetch,
      });
    }
  }, [inWalletBrowser, wallet.isConnected, roomPda, didReconnect, didRefetch]);

  // Handle manual reconnect button
  const handleReconnect = useCallback(async () => {
    if (!wallet.wallet?.adapter) {
      console.warn("[InAppRecovery] No wallet adapter available");
      return;
    }

    setIsReconnecting(true);
    console.log("[InAppRecovery] Manual reconnect triggered");

    try {
      await wallet.reconnect();
      setDidReconnect(true);
      console.log("[InAppRecovery] Reconnect successful");

      // Refetch server state after reconnect
      if (roomPdaRef.current) {
        console.log("[InAppRecovery] Refetching session after reconnect...");
        const result = await refetchGameSession(roomPdaRef.current);
        setDidRefetch(result.success);
        console.log("[InAppRecovery] Session refetch result:", {
          success: result.success,
          hasSession: !!result.session,
          movesCount: result.moves.length,
        });
      }
    } catch (e) {
      console.error("[InAppRecovery] Reconnect failed:", e);
    } finally {
      setIsReconnecting(false);
    }
  }, [wallet]);

  // Auto-reconnect on visibility/focus changes (in-app browser only)
  useEffect(() => {
    if (!inWalletBrowser) return;

    const handleVisibilityChange = async () => {
      if (document.visibilityState !== "visible") return;
      
      console.log("[InAppRecovery] Page became visible, checking wallet...");

      // Attempt reconnect if disconnected
      if (!wallet.isConnected && wallet.wallet?.adapter) {
        console.log("[InAppRecovery] Wallet disconnected, attempting auto-reconnect...");
        try {
          await wallet.reconnect();
          setDidReconnect(true);
          console.log("[InAppRecovery] Auto-reconnect successful");
        } catch (e) {
          console.warn("[InAppRecovery] Auto-reconnect failed:", e);
        }
      }

      // Always refetch server state on visibility change
      if (roomPdaRef.current) {
        console.log("[InAppRecovery] Refetching session on visibility change...");
        const result = await refetchGameSession(roomPdaRef.current);
        setDidRefetch(result.success);
        console.log("[InAppRecovery] Visibility refetch result:", {
          success: result.success,
          hasSession: !!result.session,
          movesCount: result.moves.length,
        });
      }
    };

    const handleFocus = async () => {
      console.log("[InAppRecovery] Window focused, checking wallet...");

      // Attempt reconnect if disconnected
      if (!wallet.isConnected && wallet.wallet?.adapter) {
        console.log("[InAppRecovery] Wallet disconnected, attempting auto-reconnect on focus...");
        try {
          await wallet.reconnect();
          setDidReconnect(true);
          console.log("[InAppRecovery] Focus auto-reconnect successful");
        } catch (e) {
          console.warn("[InAppRecovery] Focus auto-reconnect failed:", e);
        }
      }

      // Always refetch server state on focus
      if (roomPdaRef.current) {
        console.log("[InAppRecovery] Refetching session on focus...");
        const result = await refetchGameSession(roomPdaRef.current);
        setDidRefetch(result.success);
        console.log("[InAppRecovery] Focus refetch result:", {
          success: result.success,
          hasSession: !!result.session,
          movesCount: result.moves.length,
        });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
    };
  }, [inWalletBrowser, wallet]);

  // Show recovery overlay if in wallet browser and disconnected
  if (inWalletBrowser && !wallet.isConnected && !wallet.isConnecting) {
    return (
      <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center">
        <div className="text-center space-y-6 p-8 max-w-sm">
          <div className="mx-auto w-20 h-20 rounded-full bg-yellow-500/10 flex items-center justify-center">
            <WifiOff className="h-10 w-10 text-yellow-500" />
          </div>
          
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-foreground">
              Wallet Disconnected
            </h2>
            <p className="text-muted-foreground text-sm">
              Your wallet connection was lost. Tap below to reconnect and resume your game.
            </p>
          </div>

          <Button 
            onClick={handleReconnect} 
            disabled={isReconnecting}
            size="lg"
            className="w-full"
          >
            {isReconnecting ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Reconnecting...
              </>
            ) : (
              "Reconnect Wallet"
            )}
          </Button>

          <p className="text-xs text-muted-foreground/60">
            Room: {roomPda?.slice(0, 8)}...
          </p>
        </div>
      </div>
    );
  }

  // Show connecting state if reconnecting
  if (wallet.isConnecting) {
    return (
      <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center">
        <div className="text-center space-y-4 p-8">
          <RefreshCw className="h-12 w-12 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground">Connecting wallet...</p>
        </div>
      </div>
    );
  }

  // Render children normally when connected
  return <>{children}</>;
}
