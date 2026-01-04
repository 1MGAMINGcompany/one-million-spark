/**
 * RulesGate - Hard gate for ranked games
 * 
 * For ranked rooms, this component enforces a strict render order:
 * 1. If not ready → AcceptRulesModal (blocking)
 * 2. If ready but opponent not → WaitingForOpponentPanel
 * 3. Only when both ready → children (DiceRollStart)
 * 
 * This prevents mobile race conditions where DiceRollStart could render
 * before the rules modal was shown.
 */

import { useEffect } from "react";
import { AcceptRulesModal } from "@/components/AcceptRulesModal";
import { WaitingForOpponentPanel } from "@/components/WaitingForOpponentPanel";

interface RulesGateProps {
  /** Whether this is a ranked game */
  isRanked: boolean;
  /** Room PDA for logging/display */
  roomPda?: string;
  /** Current wallet address */
  myWallet?: string;
  /** Whether I have accepted rules */
  iAmReady: boolean;
  /** Whether opponent has accepted rules */
  opponentReady: boolean;
  /** Whether both players are ready */
  bothReady: boolean;
  /** Whether we're currently setting ready */
  isSettingReady: boolean;
  /** Stake in lamports */
  stakeLamports: number;
  /** Turn time in seconds */
  turnTimeSeconds: number;
  /** Opponent wallet for display */
  opponentWallet?: string;
  /** Called when user accepts rules */
  onAcceptRules: () => void;
  /** Called when user leaves */
  onLeave: () => void;
  /** Children (DiceRollStart) - only rendered when both ready */
  children: React.ReactNode;
}

export function RulesGate({
  isRanked,
  roomPda,
  myWallet,
  iAmReady,
  opponentReady,
  bothReady,
  isSettingReady,
  stakeLamports,
  turnTimeSeconds,
  opponentWallet,
  onAcceptRules,
  onLeave,
  children,
}: RulesGateProps) {
  // Debug logging for cross-device sync
  useEffect(() => {
    console.log("[RulesGate]", {
      roomPda: roomPda?.slice(0, 8),
      isRanked,
      myWallet: myWallet?.slice(0, 8),
      myRulesAccepted: iAmReady,
      opponentRulesAccepted: opponentReady,
      bothAccepted: bothReady,
    });
  }, [roomPda, isRanked, myWallet, iAmReady, opponentReady, bothReady]);

  // For casual games, bypass the gate entirely
  if (!isRanked) {
    return <>{children}</>;
  }

  // Convert lamports to SOL for display
  const stakeSol = stakeLamports / 1_000_000_000;

  // Hard gate order for ranked games:
  
  // 1. If I haven't accepted → show AcceptRulesModal (blocking)
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
      />
    );
  }

  // 2. If I accepted but opponent hasn't → show WaitingForOpponentPanel
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

  // 3. Both ready → render children (DiceRollStart)
  return <>{children}</>;
}
