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

import { useEffect, useMemo } from "react";
import { AcceptRulesModal } from "@/components/AcceptRulesModal";
import { WaitingForOpponentPanel } from "@/components/WaitingForOpponentPanel";
import { WalletMismatchPanel } from "@/components/WalletMismatchPanel";
import { Button } from "@/components/ui/button";
import { Loader2, Wallet } from "lucide-react";
import { useTranslation } from "react-i18next";

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
  /** Children (DiceRollStart/GameBoard) - only rendered when both ready */
  children: React.ReactNode;
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
}: RulesGateProps) {
  const { t } = useTranslation();

  // Check if my wallet is in the room players list
  const myWalletInRoom = useMemo(() => {
    if (!myWallet || !roomPlayers.length) return false;
    return roomPlayers.some(
      p => p.toLowerCase() === myWallet.toLowerCase()
    );
  }, [myWallet, roomPlayers]);

  // Filter valid players (exclude placeholders)
  const validPlayers = useMemo(() => {
    return roomPlayers.filter(
      p => !p.startsWith("waiting-") && !p.startsWith("error-") && !p.startsWith("ai-")
    );
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
      stakeLamports,
      turnTimeSeconds,
      startRollFinalized,
      isDataLoaded,
    };
    console.log("[RulesGate]", state);
    
    // CRITICAL: Log warning if ranked game attempts to render children without both ready
    if (isRanked && !bothReady) {
      console.warn("[RulesGate] BLOCKED: Ranked game children blocked - not both ready", state);
    }
  }, [roomPda, isRanked, myWallet, myWalletInRoom, validPlayers.length, iAmReady, opponentReady, bothReady, stakeLamports, turnTimeSeconds, startRollFinalized, isDataLoaded]);

  // For casual games, bypass the gate entirely
  if (!isRanked) {
    return <>{children}</>;
  }

  // STEP 5: If dice roll is finalized, game has started - NEVER re-gate
  // This prevents black screen when app backgrounds/foregrounds mid-game
  if (startRollFinalized) {
    console.log("[RulesGate] Game already started (startRollFinalized), bypassing gates");
    return <>{children}</>;
  }

  // Convert lamports to SOL for display (handle undefined)
  const stakeSol = stakeLamports !== undefined ? stakeLamports / 1_000_000_000 : 0;

  // Hard gate order for ranked games:
  
  // 1. If data not loaded → show blocking loading state
  if (!isDataLoaded) {
    return (
      <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center">
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
      <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4">
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

  // 4. If I haven't accepted → show AcceptRulesModal (blocking)
  if (!iAmReady) {
    return (
      <AcceptRulesModal
        open={true}
        onAccept={onAcceptRules}
        onLeave={onLeave}
        stakeSol={stakeSol}
        turnTimeSeconds={turnTimeSeconds}
        isLoading={isSettingReady}
        opponentReady={opponentReady}
        isDataLoaded={isDataLoaded}
        connectedWallet={myWallet}
        roomPda={roomPda}
        roomPlayers={roomPlayers}
      />
    );
  }

  // 5. If I accepted but opponent hasn't → show WaitingForOpponentPanel
  if (!bothReady) {
    return (
      <WaitingForOpponentPanel
        onLeave={onLeave}
        roomPda={roomPda}
        opponentWallet={opponentWallet}
        waitingFor="rules"
      />
    );
  }

  // 6. Both ready → render children (DiceRollStart or GameBoard)
  return <>{children}</>;
}
