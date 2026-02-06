/**
 * RulesGate - Hard gate for ranked games
 * 
 * CRITICAL SAFETY INVARIANTS:
 * 1. Ranked games may ONLY proceed if both players accepted rules
 * 2. Game board/DiceRoll MUST NOT render unless bothReady === true (for ranked)
 * 3. This prevents mobile race conditions and ensures funds safety
 * 
 * For ranked rooms, this component enforces a strict render order:
 * 1. If not loaded → blocking loading state
 * 2. If no wallet connected → blocking "Connect wallet" panel
 * 3. If wallet not in room → WalletMismatchPanel
 * 4. If not ready → AcceptRulesModal (blocking)
 * 5. If ready but opponent not → WaitingForOpponentPanel
 * 6. Only when both ready → children (DiceRollStart/GameBoard)
 * 
 * This prevents mobile race conditions where DiceRollStart could render
 * before the rules modal was shown.
 */

import { useEffect, useMemo, useState, useCallback } from "react";
import { AcceptRulesModal } from "@/components/AcceptRulesModal";
import { WaitingForOpponentPanel } from "@/components/WaitingForOpponentPanel";
import { WalletMismatchPanel } from "@/components/WalletMismatchPanel";
import { Button } from "@/components/ui/button";
import { Loader2, Wallet, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
import { isSameWallet, isPlaceholderWallet } from "@/lib/walletUtils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ServerSession = any;

interface RulesGateProps {
  /** Whether this is a ranked game */
  isRanked: boolean;
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
  /** Called when user accepts rules */
  onAcceptRules: () => void;
  /** Called when user leaves */
  onLeave: () => void;
  /** Called when user wants to switch wallet */
  onOpenWalletSelector?: () => void;
  /** Whether authoritative room data has loaded (Guardrail B) */
  isDataLoaded: boolean;
  /** Whether start roll is finalized */
  startRollFinalized: boolean;
  /** Children - DEPRECATED: no longer rendered (dice roll skipped, game starts immediately) */
  children?: React.ReactNode;
  /** Handler to trigger forfeit settlement when stuck on waiting screen */
  onForfeit?: () => void;
  /** Loading state during forfeit */
  isForfeiting?: boolean;
}

export function RulesGate({
  isRanked,
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
  children,
  onForfeit,
  isForfeiting,
}: RulesGateProps) {
  const { t } = useTranslation();
  
  // --- START: Server-truth polling state (prevents mobile/desktop deadlocks) ---
  const [serverSession, setServerSession] = useState<ServerSession | null>(null);
  const [serverStartRollFinalized, setServerStartRollFinalized] = useState(false);
  const [serverBothReady, setServerBothReady] = useState(false);
  const [serverPollErrors, setServerPollErrors] = useState(0);
  const [showHardReload, setShowHardReload] = useState(false);
  
  const debugEnabled = useMemo(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("debug") === "1";
  }, []);
  
  // Note: showResyncButton/isResyncing/handleResync removed - the fullscreen syncing overlay
  // was blocking DiceRollStart UI. Now we let children render immediately when effectiveBothReady.

  // --- Poll server truth while ranked gates could block the game ---
  // This breaks the deadlock: "RulesGate blocks children => useStartRoll never runs => never hydrates"
  useEffect(() => {
    if (!roomPda) return;
    if (!isRanked) return;
    // If either the prop OR our server snapshot says finalized, stop polling
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
          setServerPollErrors((n) => n + 1);
          return;
        }

        const s = data?.session;
        if (!s) return;

        setServerSession(s);

        if (s.start_roll_finalized) {
          console.log("[RulesGate] Server poll found start_roll_finalized=true");
          setServerStartRollFinalized(true);
        }

        // Acceptances table can be empty — flags are still canonical for readiness
        if (s.p1_ready && s.p2_ready) {
          console.log("[RulesGate] Server poll found both players ready");
          setServerBothReady(true);
        }
      } catch (e) {
        if (!cancelled) {
          console.warn("[RulesGate] game-session-get exception:", e);
          setServerPollErrors((n) => n + 1);
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

  // Hard escape hatch: never allow infinite waiting screens (15s timeout)
  useEffect(() => {
    if (!roomPda || !isRanked) return;

    if (effectiveStartRollFinalized) {
      setShowHardReload(false);
      return;
    }

    setShowHardReload(false);
    const t = setTimeout(() => setShowHardReload(true), 15000);
    return () => clearTimeout(t);
  }, [roomPda, isRanked, effectiveStartRollFinalized]);
  // --- END: Server-truth polling ---

  // Check if my wallet is in the room players list (use isSameWallet for correct Base58 comparison)
  const myWalletInRoom = useMemo(() => {
    if (!myWallet || !roomPlayers.length) return false;
    return roomPlayers.some(p => isSameWallet(p, myWallet));
  }, [myWallet, roomPlayers]);

  // Filter valid players (exclude all placeholders including default pubkey 111111...)
  const validPlayers = useMemo(() => {
    return roomPlayers.filter((p) => !isPlaceholderWallet(p));
  }, [roomPlayers]);

  // Debug logging for cross-device sync and invalid state detection
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
      stakeLamports,
      turnTimeSeconds,
      startRollFinalized,
      effectiveStartRollFinalized,
      serverStartRollFinalized,
      serverBothReady,
      isDataLoaded,
    };
    console.log("[RulesGate]", state);
    
    // CRITICAL: Log warning if ranked game attempts to render children without both ready
    if (isRanked && !effectiveBothReady) {
      console.warn("[RulesGate] BLOCKED: Ranked game children blocked - not both ready", state);
    }
  }, [roomPda, isRanked, myWallet, myWalletInRoom, validPlayers.length, iAmReady, opponentReady, bothReady, effectiveBothReady, stakeLamports, turnTimeSeconds, startRollFinalized, effectiveStartRollFinalized, serverStartRollFinalized, serverBothReady, isDataLoaded]);

  // For casual games, bypass the gate entirely
  if (!isRanked) {
    return <>{children}</>;
  }

  // STEP 5: If dice roll is finalized (prop OR server-polled), game has started - NEVER re-gate
  // This prevents black screen when app backgrounds/foregrounds mid-game
  if (effectiveStartRollFinalized) {
    console.log("[RulesGate] Server says start roll finalized — bypassing gates");
    return <>{children}</>;
  }

  // Convert lamports to SOL for display (handle undefined)
  const stakeSol = stakeLamports !== undefined ? stakeLamports / 1_000_000_000 : 0;

  // Hard gate order for ranked games:
  
  // 1. If data not loaded → show blocking loading state
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

  // 2. If no wallet connected → show blocking "Connect wallet" panel
  if (!myWallet) {
    return (
      <div data-overlay="RulesGate.connectWallet" className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-card border rounded-xl p-8 text-center space-y-4">
          <Wallet className="h-12 w-12 text-primary mx-auto" />
          <h2 className="text-xl font-semibold">
            {t("wallet.connectToContinue", "Connect Wallet to Continue")}
          </h2>
          <p className="text-muted-foreground text-sm">
            {t("wallet.needWalletForRanked", "You need to connect your wallet to participate in this ranked match.")}
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

  // 3. If wallet connected but not in room → show WalletMismatchPanel
  if (!myWalletInRoom && validPlayers.length > 0) {
    return (
      <WalletMismatchPanel
        connectedWallet={myWallet}
        roomPlayers={roomPlayers}
        onSwitchWallet={onOpenWalletSelector}
        onBackToRooms={onLeave}
      />
    );
  }

  // 4. REMOVED: AcceptRulesModal - readiness is now set automatically via record_acceptance
  // Creator: set on room creation
  // Joiner: set immediately after join transaction
  
  // 5. If not both ready yet → show passive waiting panel (no button, no "I'm Ready" click)
  if (!effectiveBothReady) {
    return (
      <WaitingForOpponentPanel
        onLeave={onLeave}
        roomPda={roomPda}
        opponentWallet={opponentWallet}
        waitingFor="rules"
        stakeSol={stakeSol}
        playerCount={validPlayers.length}
        onForfeit={onForfeit}
        isForfeiting={isForfeiting}
      />
    );
  }

  // 6. Both ready → per architecture decision (game-start-creator-first-no-dice),
  // the game starts immediately with creator going first - NO dice roll ceremony.
  // The DB function maybe_finalize_start_state handles this automatically.
  // Render null (not children) - the game page will show the game board directly.
  // Children (DiceRollStart) are no longer rendered.
  return null;
}
