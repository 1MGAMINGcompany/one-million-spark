import { useState, useCallback } from "react";
import { useAccount, useWriteContract } from "wagmi";
import { toast } from "sonner";
import { polygon } from "wagmi/chains";
import { keccak256, toBytes } from "viem";
import { ROOMMANAGER_V7_ADDRESS } from "@/lib/contractAddresses";

// Rules hash for contract validation
const RULES_TEXT = `1 MILLION GAMING RULES V1`;
const RULES_HASH = keccak256(toBytes(RULES_TEXT));

// RoomManagerV7Production ABI - minimal for our needs
const ROOM_MANAGER_ABI = [
  {
    inputs: [
      { internalType: "uint256", name: "entryFee", type: "uint256" },
      { internalType: "uint8", name: "maxPlayers", type: "uint8" },
      { internalType: "bool", name: "isPrivate", type: "bool" },
      { internalType: "uint16", name: "platformFeeBps", type: "uint16" },
      { internalType: "uint32", name: "gameId", type: "uint32" },
      { internalType: "uint16", name: "turnTimeSec", type: "uint16" },
      { internalType: "bytes32", name: "rulesHash", type: "bytes32" }
    ],
    name: "createRoom",
    outputs: [{ internalType: "uint256", name: "roomId", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ internalType: "uint256", name: "roomId", type: "uint256" }],
    name: "joinRoom",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ internalType: "uint256", name: "roomId", type: "uint256" }],
    name: "cancelRoom",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { internalType: "uint256", name: "roomId", type: "uint256" },
      { internalType: "address", name: "winner", type: "address" }
    ],
    name: "finishGameSig",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  }
] as const;

// Main hook for creating rooms
export function useGaslessCreateRoom() {
  const { address, isConnected } = useAccount();
  const [isBusy, setIsBusy] = useState(false);
  const { writeContractAsync } = useWriteContract();

  const createRoomGasless = useCallback(async (
    entryFeeUnits: bigint,
    maxPlayers: number,
    isPrivate: boolean,
    platformFeeBps: number,
    gameId: number,
    turnTimeSec: number
  ): Promise<{ roomId: bigint }> => {
    if (!address || !isConnected) {
      throw new Error("Wallet not connected");
    }

    // Hard defaults & validation
    const maxPlayersU8 = Math.max(2, Math.min(4, maxPlayers || 2));
    const gameIdU32 = Math.max(1, gameId || 1);
    const turnTimeU16 = turnTimeSec || 10;

    console.log("CREATE_ROOM_ARGS:", {
      entryFeeUnits: entryFeeUnits.toString(),
      maxPlayersU8,
      isPrivate,
      platformFeeBps: 500,
      gameIdU32,
      turnTimeU16,
      contract: ROOMMANAGER_V7_ADDRESS,
    });

    if (entryFeeUnits < 500000n) {
      throw new Error("Minimum entry fee is 0.5 USDT");
    }

    setIsBusy(true);

    try {
      const hash = await writeContractAsync({
        address: ROOMMANAGER_V7_ADDRESS as `0x${string}`,
        abi: ROOM_MANAGER_ABI,
        functionName: "createRoom",
        args: [entryFeeUnits, maxPlayersU8, isPrivate, 500, gameIdU32, turnTimeU16, RULES_HASH],
        chain: polygon,
        account: address,
      });

      console.log("Create room TX hash:", hash);
      toast.success("Room created successfully!");
      
      // Return roomId (parsed from events in production)
      return { roomId: 1n };

    } catch (error: any) {
      console.error("CREATE_ROOM_ERROR:", error);
      throw error;
    } finally {
      setIsBusy(false);
    }
  }, [address, isConnected, writeContractAsync]);

  return {
    createRoomGasless,
    isBusy,
    isGaslessReady: true,
  };
}

// Hook for joining rooms
export function useGaslessJoinRoom() {
  const { address, isConnected } = useAccount();
  const [isBusy, setIsBusy] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const { writeContractAsync } = useWriteContract();

  const joinRoomGasless = useCallback(async (roomId: bigint): Promise<boolean> => {
    if (!address || !isConnected) {
      toast.error("Wallet not connected");
      return false;
    }

    setIsBusy(true);
    setIsSuccess(false);

    try {
      const hash = await writeContractAsync({
        address: ROOMMANAGER_V7_ADDRESS as `0x${string}`,
        abi: ROOM_MANAGER_ABI,
        functionName: "joinRoom",
        args: [roomId],
        chain: polygon,
        account: address,
      });

      console.log("Join room TX hash:", hash);
      setIsSuccess(true);
      return true;
    } catch (error: any) {
      console.error("JOIN_ROOM_ERROR:", error);
      toast.error(error?.message?.slice(0, 100) || "Failed to join room");
      return false;
    } finally {
      setIsBusy(false);
    }
  }, [address, isConnected, writeContractAsync]);

  const reset = useCallback(() => {
    setIsSuccess(false);
  }, []);

  return { joinRoomGasless, isBusy, isSuccess, reset };
}

// Hook for cancelling rooms
export function useGaslessCancelRoom() {
  const { address, isConnected } = useAccount();
  const [isBusy, setIsBusy] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const { writeContractAsync } = useWriteContract();

  const cancelRoomGasless = useCallback(async (roomId: bigint): Promise<boolean> => {
    if (!address || !isConnected) {
      toast.error("Wallet not connected");
      return false;
    }

    setIsBusy(true);
    setIsSuccess(false);

    try {
      const hash = await writeContractAsync({
        address: ROOMMANAGER_V7_ADDRESS as `0x${string}`,
        abi: ROOM_MANAGER_ABI,
        functionName: "cancelRoom",
        args: [roomId],
        chain: polygon,
        account: address,
      });

      console.log("Cancel room TX hash:", hash);
      setIsSuccess(true);
      toast.success("Room cancelled");
      return true;
    } catch (error: any) {
      console.error("CANCEL_ROOM_ERROR:", error);
      toast.error(error?.message?.slice(0, 100) || "Failed to cancel room");
      return false;
    } finally {
      setIsBusy(false);
    }
  }, [address, isConnected, writeContractAsync]);

  const reset = useCallback(() => {
    setIsSuccess(false);
  }, []);

  return { cancelRoomGasless, isBusy, isSuccess, reset };
}

// Hook for finishing games
export function useGaslessFinishGame() {
  const { address, isConnected } = useAccount();
  const [isPending, setIsPending] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { writeContractAsync } = useWriteContract();

  const finishGameGasless = useCallback(async (roomId: bigint, winner: `0x${string}`): Promise<boolean> => {
    if (!address || !isConnected) {
      setError(new Error("Wallet not connected"));
      return false;
    }

    setIsPending(true);
    setIsConfirming(false);
    setIsSuccess(false);
    setError(null);

    try {
      setIsPending(false);
      setIsConfirming(true);

      const hash = await writeContractAsync({
        address: ROOMMANAGER_V7_ADDRESS as `0x${string}`,
        abi: ROOM_MANAGER_ABI,
        functionName: "finishGameSig",
        args: [roomId, winner],
        chain: polygon,
        account: address,
      });

      console.log("Finish game TX hash:", hash);
      setIsSuccess(true);
      return true;
    } catch (err: any) {
      console.error("FINISH_GAME_ERROR:", err);
      setError(err instanceof Error ? err : new Error(String(err)));
      return false;
    } finally {
      setIsPending(false);
      setIsConfirming(false);
    }
  }, [address, isConnected, writeContractAsync]);

  const reset = useCallback(() => {
    setIsSuccess(false);
    setError(null);
  }, []);

  return { finishGameGasless, isPending, isConfirming, isSuccess, error, reset };
}
