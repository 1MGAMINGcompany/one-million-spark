import { useReadContract, useWriteContract, useWaitForTransactionReceipt, useAccount } from "wagmi";
import { useCallback, useEffect, useState } from "react";
import { polygon } from "@/lib/wagmi-config";
import { 
  SEED_MANAGER_ADDRESS, 
  SEED_MANAGER_ABI, 
  SeedPhase, 
  type SeedState,
  COMMIT_WINDOW_SEC,
  REVEAL_WINDOW_SEC,
} from "@/contracts/seedManager";
import { 
  generateRandomSecret, 
  computeCommitment, 
  storeSecret, 
  getStoredSecret,
  clearStoredSecret,
  storeFinalSeedHash,
} from "@/lib/seedUtils";

// Hook to get seed state for a room
export function useSeedState(roomId: bigint | undefined) {
  return useReadContract({
    address: SEED_MANAGER_ADDRESS,
    abi: SEED_MANAGER_ABI,
    functionName: "getSeedState",
    args: roomId !== undefined ? [roomId] : undefined,
    chainId: 137,
    query: {
      enabled: roomId !== undefined,
      refetchInterval: 3000, // Poll every 3 seconds for updates
    },
  });
}

// Hook to check if player has committed
export function useHasCommitted(roomId: bigint | undefined, playerAddress: `0x${string}` | undefined) {
  return useReadContract({
    address: SEED_MANAGER_ADDRESS,
    abi: SEED_MANAGER_ABI,
    functionName: "hasCommitted",
    args: roomId !== undefined && playerAddress ? [roomId, playerAddress] : undefined,
    chainId: 137,
    query: {
      enabled: roomId !== undefined && !!playerAddress,
      refetchInterval: 3000,
    },
  });
}

// Hook to check if player has revealed
export function useHasRevealed(roomId: bigint | undefined, playerAddress: `0x${string}` | undefined) {
  return useReadContract({
    address: SEED_MANAGER_ADDRESS,
    abi: SEED_MANAGER_ABI,
    functionName: "hasRevealed",
    args: roomId !== undefined && playerAddress ? [roomId, playerAddress] : undefined,
    chainId: 137,
    query: {
      enabled: roomId !== undefined && !!playerAddress,
      refetchInterval: 3000,
    },
  });
}

// Hook to commit seed
export function useCommitSeed() {
  const { address } = useAccount();
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const commitSeed = useCallback((roomId: bigint) => {
    if (!address) return null;
    
    // Generate random secret
    const secret = generateRandomSecret();
    const commitment = computeCommitment(secret);
    
    // Store secret locally BEFORE sending transaction
    storeSecret(roomId.toString(), address, secret);
    
    // Send commitment to contract
    writeContract({
      address: SEED_MANAGER_ADDRESS,
      abi: SEED_MANAGER_ABI,
      functionName: "commitSeed",
      args: [roomId, commitment],
      chain: polygon,
      account: address,
    });
    
    return secret;
  }, [address, writeContract]);

  return {
    commitSeed,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
    reset,
  };
}

// Hook to reveal seed
export function useRevealSeed() {
  const { address } = useAccount();
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const revealSeed = useCallback((roomId: bigint) => {
    if (!address) return false;
    
    // Retrieve secret from localStorage
    const secret = getStoredSecret(roomId.toString(), address);
    if (!secret) {
      console.error("No stored secret found for room", roomId.toString());
      return false;
    }
    
    // Send reveal to contract
    writeContract({
      address: SEED_MANAGER_ADDRESS,
      abi: SEED_MANAGER_ABI,
      functionName: "revealSeed",
      args: [roomId, secret],
      chain: polygon,
      account: address,
    });
    
    return true;
  }, [address, writeContract]);

  // Clear secret after successful reveal
  useEffect(() => {
    if (isSuccess && address) {
      // Note: We'd need roomId here to clear - handle in component
    }
  }, [isSuccess, address]);

  return {
    revealSeed,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
    reset,
  };
}

// Hook to request refund if seed not revealed
export function useRefundSeed() {
  const { address } = useAccount();
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const refundSeed = useCallback((roomId: bigint) => {
    if (!address) return;
    
    writeContract({
      address: SEED_MANAGER_ADDRESS,
      abi: SEED_MANAGER_ABI,
      functionName: "refundIfSeedNotRevealed",
      args: [roomId],
      chain: polygon,
      account: address,
    });
  }, [address, writeContract]);

  return {
    refundSeed,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
    reset,
  };
}

// Helper to parse seed state from contract response
export function parseSeedState(
  data: readonly [number, `0x${string}`, bigint, bigint, readonly `0x${string}`[], readonly `0x${string}`[]] | undefined
): SeedState | null {
  if (!data) return null;
  
  return {
    phase: data[0] as SeedPhase,
    finalSeedHash: data[1],
    commitDeadline: data[2],
    revealDeadline: data[3],
    committedPlayers: [...data[4]],
    revealedPlayers: [...data[5]],
  };
}

// Hook for countdown timer
export function useCountdown(deadline: bigint | undefined) {
  const [secondsLeft, setSecondsLeft] = useState<number>(0);
  
  useEffect(() => {
    if (!deadline || deadline === 0n) {
      setSecondsLeft(0);
      return;
    }
    
    const updateCountdown = () => {
      const now = Math.floor(Date.now() / 1000);
      const deadlineSeconds = Number(deadline);
      const remaining = Math.max(0, deadlineSeconds - now);
      setSecondsLeft(remaining);
    };
    
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    
    return () => clearInterval(interval);
  }, [deadline]);
  
  return secondsLeft;
}

// Format seconds to mm:ss
export function formatCountdown(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
