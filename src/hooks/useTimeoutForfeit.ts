import { useCallback, useRef, useEffect, useState } from "react";
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from "wagmi";
import { polygon } from "wagmi/chains";
import { ROOM_MANAGER_ADDRESS, ROOM_MANAGER_ABI } from "@/contracts/roomManager";
import { useToast } from "@/hooks/use-toast";
import { useSound } from "@/contexts/SoundContext";

interface UseTimeoutForfeitOptions {
  roomId: bigint;
  opponentAddress: string | undefined;
  isMyTurn: boolean;
  turnTimeSeconds: number;
  turnStartedAt: number;
  gameEnded: boolean;
  onTimeoutClaimed?: () => void;
}

export function useTimeoutForfeit({
  roomId,
  opponentAddress,
  isMyTurn,
  turnTimeSeconds,
  turnStartedAt,
  gameEnded,
  onTimeoutClaimed,
}: UseTimeoutForfeitOptions) {
  const { toast } = useToast();
  const { play } = useSound();
  const { address: accountAddress } = useAccount();
  const [canClaimTimeout, setCanClaimTimeout] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Contract write for finishing the room
  const { writeContract, data: hash, isPending, error } = useWriteContract();

  // Wait for transaction confirmation
  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({ hash });

  // Calculate time until opponent times out
  const getOpponentTimeRemaining = useCallback(() => {
    if (isMyTurn || gameEnded) return Infinity;
    const elapsed = Math.floor((Date.now() - turnStartedAt) / 1000);
    return Math.max(0, turnTimeSeconds - elapsed);
  }, [isMyTurn, gameEnded, turnStartedAt, turnTimeSeconds]);

  // Monitor opponent's timer
  useEffect(() => {
    if (isMyTurn || gameEnded || !opponentAddress) {
      setCanClaimTimeout(false);
      if (timeoutRef.current) {
        clearInterval(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }

    const checkTimeout = () => {
      const remaining = getOpponentTimeRemaining();
      
      if (remaining === 0 && !canClaimTimeout) {
        setCanClaimTimeout(true);
        play("system/notify");
        toast({
          title: "Opponent Timed Out!",
          description: "You can now claim victory by timeout.",
        });
      }
    };

    checkTimeout();
    timeoutRef.current = setInterval(checkTimeout, 1000);

    return () => {
      if (timeoutRef.current) {
        clearInterval(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [isMyTurn, gameEnded, opponentAddress, getOpponentTimeRemaining, canClaimTimeout, play, toast]);

  // Claim timeout victory on-chain
  const claimTimeoutVictory = useCallback(
    async (winnerAddress: string) => {
      if (!canClaimTimeout || isClaiming || gameEnded) {
        console.log("[TimeoutForfeit] Cannot claim:", { canClaimTimeout, isClaiming, gameEnded });
        return;
      }

      setIsClaiming(true);
      console.log("[TimeoutForfeit] Claiming timeout victory for:", winnerAddress);

      try {
        writeContract({
          address: ROOM_MANAGER_ADDRESS,
          abi: ROOM_MANAGER_ABI,
          functionName: "finishRoom",
          args: [roomId, winnerAddress as `0x${string}`],
          account: accountAddress,
          chain: polygon,
        });
      } catch (e) {
        console.error("[TimeoutForfeit] Failed to claim:", e);
        setIsClaiming(false);
        toast({
          title: "Claim Failed",
          description: "Failed to submit timeout claim. Please try again.",
          variant: "destructive",
        });
      }
    },
    [canClaimTimeout, isClaiming, gameEnded, roomId, writeContract, toast]
  );

  // Handle transaction confirmation
  useEffect(() => {
    if (isConfirmed) {
      setIsClaiming(false);
      setCanClaimTimeout(false);
      play("chess/win");
      toast({
        title: "Timeout Victory Claimed!",
        description: "You won by timeout. Winnings sent to your wallet.",
      });
      onTimeoutClaimed?.();
    }
  }, [isConfirmed, play, toast, onTimeoutClaimed]);

  // Handle errors
  useEffect(() => {
    if (error) {
      setIsClaiming(false);
      console.error("[TimeoutForfeit] Transaction error:", error);
      toast({
        title: "Transaction Failed",
        description: error.message || "Failed to claim timeout victory.",
        variant: "destructive",
      });
    }
  }, [error, toast]);

  return {
    canClaimTimeout,
    isClaiming: isClaiming || isPending || isConfirming,
    claimTimeoutVictory,
    opponentTimeRemaining: getOpponentTimeRemaining(),
  };
}
