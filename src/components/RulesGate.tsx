/**
 * RulesGate - Automatic acceptance for ranked/private games
 * 
 * This component NO LONGER shows popups for rules acceptance.
 * Rules are shown in the Game Rules dropdown instead.
 * 
 * Auto-acceptance flow:
 * 1. When player enters, silently call acceptRules() if not ready
 * 2. Show loading state while acceptance is in flight
 * 3. Once both players ready, render children (DiceRollStart/GameBoard)
 */

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Loader2, Wallet, Bug } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
import { isSameWallet, isPlaceholderWallet } from "@/lib/walletUtils";
import { getSessionToken } from "@/lib/sessionToken";

// Check if running in dev mode
const isDev = import.meta.env.DEV || 
  (typeof window !== "undefined" && window.location.search.includes("debug=1"));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ServerSession = any;

interface RulesGateProps {
  /** Whether this is a ranked game */
  isRanked: boolean;
  /** Room mode for display text */
  mode?: 'casual' | 'ranked' | 'private';
  /** Room PDA for logging/display */
  roomPda?: string;
  /** Current wallet address */
  myWallet?: string;
  /** Room players from on-chain data */
  roomPlayers: string[];
  /** Whether I have accepted rules */
  iAmReady: boolean;
  /** Whether opponent has accepted rules */
  opponentReady: boolean;
  /** Whether both players are ready */
  bothReady: boolean;
  /** Whether we're currently setting ready */
  isSettingReady: boolean;
  /** Stake in lamports - MUST come from on-chain data (Guardrail A) */
  stakeLamports: number | undefined;
  /** Turn time in seconds - MUST come from canonical source */
  turnTimeSeconds: number;
  /** Opponent wallet for display */
  opponentWallet?: string;
  /** Called when user accepts rules (now called automatically) */
  onAcceptRules: () => void;
  /** Called when user leaves */
  onLeave: () => void;
  /** Called when user wants to switch wallet */
  onOpenWalletSelector?: () => void;
  /** Whether authoritative room data has loaded (Guardrail B) */
  isDataLoaded: boolean;
  /** Whether start roll is finalized */
  startRollFinalized: boolean;
  /** 
   * If true, user just confirmed rules via JoinRulesModal and auto-acceptance is in flight.
   * Skip showing AcceptRulesModal - wait for polling to confirm acceptance.
   */
  justJoined?: boolean;
  /** Children (DiceRollStart/GameBoard) - only rendered when both ready */
  children: React.ReactNode;
}

export function RulesGate({
  isRanked,
  mode = isRanked ? 'ranked' : 'casual',
  roomPda,
  myWallet,
  roomPlayers,
  iAmReady,
  opponentReady,
  bothReady,
  isSettingReady,
  stakeLamports,
  turnTimeSeconds,
  opponentWallet,
  onAcceptRules,
  onLeave,
  onOpenWalletSelector,
  isDataLoaded,
  startRollFinalized,
  justJoined = false,
  children,
}: RulesGateProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  
  // Track if we've already triggered auto-accept
  const autoAcceptTriggeredRef = useRef(false);
  
  // Check if session token exists for this room
  const hasSessionToken = useMemo(() => {
    if (!roomPda) return false;
    const token = getSessionToken(roomPda);
    return !!token;
  }, [roomPda]);

  // --- START: Server-truth polling state (prevents mobile/desktop deadlocks) ---
  const [serverSession, setServerSession] = useState<ServerSession | null>(null);
  const [serverStartRollFinalized, setServerStartRollFinalized] = useState(false);
  const [serverBothReady, setServerBothReady] = useState(false);

  // 🔍 DEBUG: Copy debug info handler (dev only)
  const [debugLoading, setDebugLoading] = useState(false);
  const handleCopyDebugInfo = useCallback(async () => {
    if (!roomPda) return;
    setDebugLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("game-session-get", {
        body: { roomPda },
      });
      
      const debugPayload = {
        ...(data?.debug || {}),
        localState: {
          myWallet: myWallet?.slice(0, 8),
          iAmReady,
          opponentReady,
          bothReady,
          startRollFinalized,
          isDataLoaded,
          hasSessionToken,
          justJoined,
        },
        error: error?.message || null,
      };
      
      const jsonStr = JSON.stringify(debugPayload, null, 2);
      await navigator.clipboard.writeText(jsonStr);
      console.log("[RulesGate] Debug info copied:", debugPayload);
      alert("Debug info copied to clipboard! Check console for details.");
    } catch (err) {
      console.error("[RulesGate] Failed to fetch debug info:", err);
      alert("Failed to fetch debug info. Check console.");
    } finally {
      setDebugLoading(false);
    }
  }, [roomPda, myWallet, iAmReady, opponentReady, bothReady, startRollFinalized, isDataLoaded, hasSessionToken, justJoined]);

  // --- Poll server truth while ranked gates could block the game ---
  useEffect(() => {
    if (!roomPda) return;
    if (!isRanked) return;
    if (startRollFinalized || serverStartRollFinalized) return;

    let cancelled = false;

    const poll = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("game-session-get", {
          body: { roomPda },
        });

        if (cancelled) return;

        if (error) {
          console.warn("[RulesGate] game-session-get error:", error);
          return;
        }

        const s = data?.session;
        if (!s) return;

        setServerSession(s);

        if (s.start_roll_finalized) {
          console.log("[RulesGate] Server poll found start_roll_finalized=true");
          setServerStartRollFinalized(true);
        }

        if (s.p1_ready && s.p2_ready) {
          console.log("[RulesGate] Server poll found both players ready");
          setServerBothReady(true);
        }
      } catch (e) {
        if (!cancelled) {
          console.warn("[RulesGate] game-session-get exception:", e);
        }
      }
    };

    poll();
    const id = setInterval(poll, 2000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [roomPda, isRanked, startRollFinalized, serverStartRollFinalized]);

  // Compute effective values combining props and server-polled data
  const effectiveStartRollFinalized =
    !!startRollFinalized ||
    serverStartRollFinalized ||
    !!serverSession?.start_roll_finalized;

  const effectiveBothReady =
    !!bothReady ||
    serverBothReady ||
    (!!serverSession?.p1_ready && !!serverSession?.p2_ready);

  // Check if my wallet is in the room players list
  const myWalletInRoom = useMemo(() => {
    if (!myWallet || !roomPlayers.length) return false;
    return roomPlayers.some(p => isSameWallet(p, myWallet));
  }, [myWallet, roomPlayers]);

  // Filter valid players (exclude all placeholders)
  const validPlayers = useMemo(() => {
    return roomPlayers.filter((p) => !isPlaceholderWallet(p));
  }, [roomPlayers]);

  // AUTO-ACCEPT: Silently accept rules when player enters and has session token
  useEffect(() => {
    // Skip if already triggered, not ranked, or not loaded
    if (autoAcceptTriggeredRef.current) return;
    if (!isRanked) return;
    if (!isDataLoaded) return;
    if (!myWallet) return;
    if (!myWalletInRoom) return;
    if (!hasSessionToken) return;
    if (iAmReady) return; // Already ready
    if (isSettingReady) return; // Already in progress

    // Trigger auto-accept
    autoAcceptTriggeredRef.current = true;
    console.log("[RulesGate] Auto-accepting rules for player:", myWallet?.slice(0, 8));
    onAcceptRules();
  }, [isRanked, isDataLoaded, myWallet, myWalletInRoom, hasSessionToken, iAmReady, isSettingReady, onAcceptRules]);

  // Debug logging
  useEffect(() => {
    const state = {
      roomPda: roomPda?.slice(0, 8),
      isRanked,
      myWallet: myWallet?.slice(0, 8),
      myInRoom: myWalletInRoom,
      validPlayers: validPlayers.length,
      myReady: iAmReady,
      opponentReady,
      bothReady,
      effectiveBothReady,
      effectiveStartRollFinalized,
      isDataLoaded,
      autoAcceptTriggered: autoAcceptTriggeredRef.current,
    };
    console.log("[RulesGate]", state);
  }, [roomPda, isRanked, myWallet, myWalletInRoom, validPlayers.length, iAmReady, opponentReady, bothReady, effectiveBothReady, effectiveStartRollFinalized, isDataLoaded]);

  // For casual games, bypass the gate entirely
  if (!isRanked) {
    return <>{children}</>;
  }

  // If dice roll is finalized, game has started - NEVER re-gate
  if (effectiveStartRollFinalized) {
    console.log("[RulesGate] Server says start roll finalized — bypassing gates");
    return <>{children}</>;
  }

  // 1. If data not loaded → show loading state
  if (!isDataLoaded) {
    return (
      <div data-overlay="RulesGate.loading" className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground">
            {t("common.loadingMatchDetails", "Loading match details...")}
          </p>
        </div>
      </div>
    );
  }

  // 2. If no wallet connected → show "Connect wallet" panel
  if (!myWallet) {
    return (
      <div data-overlay="RulesGate.connectWallet" className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-card border rounded-xl p-8 text-center space-y-4">
          <Wallet className="h-12 w-12 text-primary mx-auto" />
          <h2 className="text-xl font-semibold">
            {t("wallet.connectToContinue", "Connect Wallet to Continue")}
          </h2>
          <p className="text-muted-foreground text-sm">
            {t("wallet.needWalletForMatch", "You need to connect your wallet to participate in this {{mode}} match.", { mode: mode === "private" ? "private" : mode === "ranked" ? "ranked" : "" }).replace("this  match", "this match")}
          </p>
          {onOpenWalletSelector && (
            <Button onClick={onOpenWalletSelector} className="w-full">
              {t("wallet.connectWallet", "Connect Wallet")}
            </Button>
          )}
          <Button variant="ghost" onClick={onLeave} className="w-full">
            {t("leaveMatch.backToRooms", "Back to Rooms")}
          </Button>
        </div>
      </div>
    );
  }

  // 3. If wallet not in room → show error with back button (no separate mismatch panel)
  if (!myWalletInRoom && validPlayers.length > 0) {
    return (
      <div data-overlay="RulesGate.walletMismatch" className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-card border rounded-xl p-8 text-center space-y-4">
          <Wallet className="h-12 w-12 text-destructive mx-auto" />
          <h2 className="text-xl font-semibold">
            {t("wallet.wrongWalletConnected", "Wrong Wallet Connected")}
          </h2>
          <p className="text-muted-foreground text-sm">
            {t("wallet.switchToParticipant", "Please switch to the wallet that joined this room.")}
          </p>
          {onOpenWalletSelector && (
            <Button onClick={onOpenWalletSelector} className="w-full">
              {t("wallet.switchWallet", "Switch Wallet")}
            </Button>
          )}
          <Button variant="ghost" onClick={onLeave} className="w-full">
            {t("leaveMatch.backToRooms", "Back to Rooms")}
          </Button>
        </div>
      </div>
    );
  }

  // 4. If I haven't accepted yet → show syncing state (auto-accept is in flight)
  if (!iAmReady) {
    return (
      <div data-overlay="RulesGate.syncing" className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground">
            {t("common.confirmingEntry", "Confirming entry...")}
          </p>
        </div>
      </div>
    );
  }

  // 5. If I accepted but opponent hasn't → show waiting state (no popup)
  if (!effectiveBothReady) {
    return (
      <div data-overlay="RulesGate.waitingOpponent" className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-card border rounded-xl p-8 text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
          <h2 className="text-lg font-semibold">
            {t("waitingPanel.waitingOpponentReady", "Waiting for opponent to be ready...")}
          </h2>
          <p className="text-muted-foreground text-sm">
            {t("waitingPanel.gameStartsAuto", "Game starts automatically when both players are ready.")}
          </p>
          <Button variant="ghost" onClick={onLeave} className="w-full">
            {t("waitingPanel.leaveMatch", "Leave Match")}
          </Button>
        </div>
      </div>
    );
  }

  // 6. Both ready → render children (DiceRollStart or GameBoard)
  return (
    <>
      {children}
      {/* 🔍 DEBUG: Hidden debug button (dev only) */}
      {isDev && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopyDebugInfo}
          disabled={debugLoading}
          className="fixed bottom-2 left-2 z-50 opacity-30 hover:opacity-100 text-xs"
          title="Copy Debug Info (Dev Only)"
        >
          <Bug className="h-3 w-3 mr-1" />
          {debugLoading ? "..." : "Debug"}
        </Button>
      )}
    </>
  );
}
