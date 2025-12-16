import { useState, useCallback } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { toast } from "sonner";
import { keccak256, toBytes, decodeEventLog, parseAbi } from "viem";
import { polygon } from "viem/chains";
import { ROOMMANAGER_V7_ADDRESS } from "@/lib/contractAddresses";

// Rules hash for contract validation
const RULES_TEXT = `
1 MILLION GAMING – OFFICIAL RULES V1
Skill-based gameplay only.
No randomness manipulation.
Winner decided by game logic.
No disputes.
`;
const RULES_HASH = keccak256(toBytes(RULES_TEXT));

// RoomCreated event for parsing roomId
const ROOM_CREATED_EVENT = parseAbi([
  "event RoomCreated(uint256 indexed roomId, address indexed creator, uint256 entryFee, uint8 maxPlayers, bool isPrivate, uint32 gameId, uint16 turnTimeSec)"
]);

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
      { internalType: "address", name: "winner", type: "address" },
      { internalType: "bool", name: "isDraw", type: "bool" },
      { internalType: "bytes32", name: "gameHash", type: "bytes32" },
      { internalType: "bytes", name: "proofOrSig", type: "bytes" }
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
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const createRoomGasless = useCallback(async (
    entryFeeUnits: bigint,
    maxPlayers: number,
    isPrivate: boolean,
    platformFeeBps: number,
    gameId: number,
    turnTimeSec: number
  ): Promise<{ roomId: bigint }> => {
    if (!address || !isConnected || !walletClient || !publicClient) {
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
      rulesHash: RULES_HASH,
      contract: ROOMMANAGER_V7_ADDRESS,
    });

    if (entryFeeUnits < 500000n) {
      throw new Error("Minimum entry fee is 0.5 USDT");
    }

    setIsBusy(true);

    try {
      // Send transaction using wallet client
      const hash = await walletClient.writeContract({
        address: ROOMMANAGER_V7_ADDRESS as `0x${string}`,
        abi: ROOM_MANAGER_ABI,
        functionName: "createRoom",
        args: [entryFeeUnits, maxPlayersU8, isPrivate, 500, gameIdU32, turnTimeU16, RULES_HASH],
        chain: polygon,
        account: address,
      });

      console.log("Create room TX hash:", hash);
      toast.success("Transaction submitted, waiting for confirmation...");

      // Wait for receipt
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      console.log("Transaction receipt:", receipt);

      // Parse RoomCreated event from logs
      let roomId: bigint | null = null;
      for (const log of receipt.logs) {
        try {
          // Get topics from log
          const topics = (log as { topics?: `0x${string}`[] }).topics;
          if (!topics || topics.length === 0) continue;
          
          const decoded = decodeEventLog({
            abi: ROOM_CREATED_EVENT,
            data: log.data,
            topics: topics as [`0x${string}`, ...`0x${string}`[]],
          }) as { eventName: string; args: { roomId: bigint } };
          
          if (decoded.eventName === "RoomCreated" && decoded.args?.roomId) {
            roomId = decoded.args.roomId;
            console.log("Parsed roomId from event:", roomId.toString());
            break;
          }
        } catch {
          // Not the event we're looking for, continue
        }
      }

      if (roomId === null) {
        throw new Error("Failed to parse roomId from transaction logs");
      }

      toast.success(`Room #${roomId} created successfully!`);
      return { roomId };

    } catch (error: any) {
      console.error("CREATE_ROOM_ERROR:", error);
      throw error;
    } finally {
      setIsBusy(false);
    }
  }, [address, isConnected, walletClient, publicClient]);

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
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const joinRoomGasless = useCallback(async (roomId: bigint): Promise<boolean> => {
    if (!address || !isConnected || !walletClient || !publicClient) {
      toast.error("Wallet not connected");
      return false;
    }

    setIsBusy(true);
    setIsSuccess(false);

    try {
      const hash = await walletClient.writeContract({
        address: ROOMMANAGER_V7_ADDRESS as `0x${string}`,
        abi: ROOM_MANAGER_ABI,
        functionName: "joinRoom",
        args: [roomId],
        chain: polygon,
        account: address,
      });

      console.log("Join room TX hash:", hash);
      await publicClient.waitForTransactionReceipt({ hash });
      setIsSuccess(true);
      toast.success("Joined room successfully!");
      return true;
    } catch (error: any) {
      console.error("JOIN_ROOM_ERROR:", error);
      toast.error(error?.message?.slice(0, 100) || "Failed to join room");
      return false;
    } finally {
      setIsBusy(false);
    }
  }, [address, isConnected, walletClient, publicClient]);

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
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const cancelRoomGasless = useCallback(async (roomId: bigint): Promise<boolean> => {
    if (!address || !isConnected || !walletClient || !publicClient) {
      toast.error("Wallet not connected");
      return false;
    }

    setIsBusy(true);
    setIsSuccess(false);

    try {
      const hash = await walletClient.writeContract({
        address: ROOMMANAGER_V7_ADDRESS as `0x${string}`,
        abi: ROOM_MANAGER_ABI,
        functionName: "cancelRoom",
        args: [roomId],
        chain: polygon,
        account: address,
      });

      console.log("Cancel room TX hash:", hash);
      await publicClient.waitForTransactionReceipt({ hash });
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
  }, [address, isConnected, walletClient, publicClient]);

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
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const finishGameGasless = useCallback(async (
    roomId: bigint, 
    winner: `0x${string}`,
    isDraw: boolean = false,
    gameHash: `0x${string}` = "0x0000000000000000000000000000000000000000000000000000000000000000",
    proofOrSig: `0x${string}` = "0x"
  ): Promise<boolean> => {
    if (!address || !isConnected || !walletClient || !publicClient) {
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

      const hash = await walletClient.writeContract({
        address: ROOMMANAGER_V7_ADDRESS as `0x${string}`,
        abi: ROOM_MANAGER_ABI,
        functionName: "finishGameSig",
        args: [roomId, winner, isDraw, gameHash, proofOrSig],
        chain: polygon,
        account: address,
      });

      console.log("Finish game TX hash:", hash);
      await publicClient.waitForTransactionReceipt({ hash });
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
  }, [address, isConnected, walletClient, publicClient]);

  const reset = useCallback(() => {
    setIsSuccess(false);
    setError(null);
  }, []);

  return { finishGameGasless, isPending, isConfirming, isSuccess, error, reset };
}
