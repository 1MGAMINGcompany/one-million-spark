/**
 * RulesGate - Hard gate for ranked games
 * 
 * CRITICAL SAFETY INVARIANTS:
 * 1. Ranked games may ONLY proceed if both players accepted rules
 * 2. Game board/DiceRoll MUST NOT render unless bothReady === true (for ranked)
 * 3. This prevents mobile race conditions and ensures funds safety
 * 
 * For ranked rooms, this component enforces a strict render order:
 * 1. If not ready → AcceptRulesModal (blocking)
 * 2. If ready but opponent not → WaitingForOpponentPanel
 * 3. Only when both ready → children (DiceRollStart/GameBoard)
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
  /** Stake in lamports - MUST come from on-chain data */
  stakeLamports: number;
  /** Turn time in seconds */
  turnTimeSeconds: number;
  /** Opponent wallet for display */
  opponentWallet?: string;
  /** Called when user accepts rules */
  onAcceptRules: () => void;
  /** Called when user leaves */
  onLeave: () => void;
  /** Whether authoritative room data has loaded */
  isDataLoaded: boolean;
  /** Children (DiceRollStart/GameBoard) - only rendered when both ready */
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
  isDataLoaded,
  children,
}: RulesGateProps) {
  // Debug logging for cross-device sync and invalid state detection
  useEffect(() => {
    const state = {
      roomPda: roomPda?.slice(0, 8),
      isRanked,
      myWallet: myWallet?.slice(0, 8),
      myRulesAccepted: iAmReady,
      opponentRulesAccepted: opponentReady,
      bothAccepted: bothReady,
    };
    console.log("[RulesGate]", state);
    
    // CRITICAL: Log warning if ranked game attempts to render children without both ready
    if (isRanked && !bothReady) {
      console.warn("[RulesGate] BLOCKED: Ranked game children blocked - not both ready", state);
    }
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
        isDataLoaded={isDataLoaded}
        connectedWallet={myWallet}
        roomPda={roomPda}
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
