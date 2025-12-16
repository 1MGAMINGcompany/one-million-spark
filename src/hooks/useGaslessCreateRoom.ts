import { useState, useCallback } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { toast } from "sonner";
import { keccak256, toBytes, decodeEventLog, parseAbi, encodeFunctionData, decodeFunctionResult } from "viem";
import { ROOMMANAGER_V7_ADDRESS, USDT_ADDRESS } from "@/lib/contractAddresses";
import { sendGaslessTransaction } from "@/lib/smartAccountClient";

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

// ABI for latestRoomId fallback
const LATEST_ROOM_ABI = parseAbi([
  "function latestRoomId() view returns (uint256)"
]);

// USDT ERC20 ABI (approve only)
const USDT_ABI = [
  {
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" }
    ],
    name: "allowance",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  }
];

// RoomManagerV7Production ABI
const ROOM_MANAGER_ABI: any[] = [
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
  },
  {
    inputs: [],
    name: "latestRoomId",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  }
];

// TRUE gasless via Smart Account (ERC-4337)
export const GASLESS_ENABLED = true;

// Main hook for creating rooms with gasless transactions
export function useGaslessCreateRoom() {
  const { address, isConnected } = useAccount();
  const [isBusy, setIsBusy] = useState(false);
  const publicClient = usePublicClient();

  // Check current USDT allowance
  const checkAllowance = useCallback(async (): Promise<bigint> => {
    if (!publicClient || !address) return 0n;
    try {
      const data = encodeFunctionData({
        abi: USDT_ABI,
        functionName: "allowance",
        args: [address, ROOMMANAGER_V7_ADDRESS]
      });
      const result = await publicClient.call({
        to: USDT_ADDRESS as `0x${string}`,
        data,
      });
      if (result.data) {
        return BigInt(result.data);
      }
      return 0n;
    } catch (err) {
      console.error("Failed to check allowance:", err);
      return 0n;
    }
  }, [publicClient, address]);

  // Approve USDT via gasless transaction
  const approveUsdtGasless = useCallback(async (amount: bigint): Promise<boolean> => {
    if (!address) throw new Error("Wallet not connected");
    
    console.log("[Gasless] Approving USDT:", amount.toString());
    toast.info("Approving USDT (gasless)...");

    try {
      const result = await sendGaslessTransaction({
        contractAddress: USDT_ADDRESS,
        abi: USDT_ABI,
        method: "approve",
        params: [ROOMMANAGER_V7_ADDRESS, amount],
        userAddress: address,
      });
      
      console.log("[Gasless] Approve result:", result);
      toast.success("USDT approved!");
      return true;
    } catch (err: any) {
      console.error("[Gasless] Approve failed:", err);
      toast.error("USDT approval failed: " + (err?.message || "Unknown error"));
      return false;
    }
  }, [address]);

  const createRoomGasless = useCallback(async (
    entryFeeUnits: bigint,
    maxPlayers: number,
    isPrivate: boolean,
    platformFeeBps: number,
    gameId: number,
    turnTimeSec: number
  ): Promise<{ roomId: bigint }> => {
    if (!address || !isConnected || !publicClient) {
      throw new Error("Wallet not connected");
    }

    // Hard defaults & validation
    const maxPlayersU8 = Math.max(2, Math.min(4, maxPlayers || 2));
    const gameIdU32 = Math.max(1, gameId || 1);
    const turnTimeU16 = turnTimeSec || 10;

    console.log("CREATE_ROOM_ARGS (Gasless):", {
      entryFeeUnits: entryFeeUnits.toString(),
      maxPlayersU8,
      isPrivate,
      platformFeeBps: 500,
      gameIdU32,
      turnTimeU16,
      rulesHash: RULES_HASH,
      contract: ROOMMANAGER_V7_ADDRESS,
      userAddress: address,
    });

    if (entryFeeUnits < 500000n) {
      throw new Error("Minimum entry fee is 0.5 USDT");
    }

    setIsBusy(true);

    try {
      // Step 1: Check allowance and approve if needed
      const currentAllowance = await checkAllowance();
      console.log("[Gasless] Current allowance:", currentAllowance.toString());
      
      if (currentAllowance < entryFeeUnits) {
        console.log("[Gasless] Insufficient allowance, approving exact amount...");
        const approved = await approveUsdtGasless(entryFeeUnits);
        if (!approved) {
          throw new Error("USDT approval failed");
        }
        // Brief wait for approval to propagate
        await new Promise(r => setTimeout(r, 2000));
      }

      // Step 2: Create room via gasless transaction
      toast.info("Creating room (gasless)...");
      
      const result = await sendGaslessTransaction({
        contractAddress: ROOMMANAGER_V7_ADDRESS,
        abi: ROOM_MANAGER_ABI,
        method: "createRoom",
        params: [entryFeeUnits, maxPlayersU8, isPrivate, 500, gameIdU32, turnTimeU16, RULES_HASH],
        userAddress: address,
      });

      console.log("[Gasless] Create room result:", result);

      // Parse roomId from transaction receipt
      let roomId: bigint | null = null;
      
      // The result should contain transaction receipt with logs
      const receipt = result as any;
      const logs = receipt?.logs || receipt?.receipt?.logs || [];
      
      // STRATEGY 1: Parse RoomCreated event from logs
      for (const log of logs) {
        try {
          const topics = log.topics || (log as any).topics;
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

      // STRATEGY 2: Fallback - read latestRoomId via raw call
      if (roomId === null) {
        console.warn("Event parsing failed, falling back to latestRoomId()...");
        try {
          const callData = encodeFunctionData({
            abi: LATEST_ROOM_ABI,
            functionName: "latestRoomId",
          });
          
          const latestResult = await publicClient.call({
            to: ROOMMANAGER_V7_ADDRESS as `0x${string}`,
            data: callData,
          });
          
          if (latestResult.data) {
            const decoded = decodeFunctionResult({
              abi: LATEST_ROOM_ABI,
              functionName: "latestRoomId",
              data: latestResult.data,
            }) as bigint;
            
            if (decoded && decoded > 0n) {
              roomId = decoded;
              console.log("Got roomId from latestRoomId():", roomId.toString());
            }
          }
        } catch (fallbackErr) {
          console.error("latestRoomId() fallback failed:", fallbackErr);
        }
      }

      // STRATEGY 3: If still null, try parsing indexed topic directly
      if (roomId === null) {
        console.warn("latestRoomId fallback failed, trying direct topic parse...");
        for (const log of logs) {
          const topics = log.topics || (log as any).topics;
          // RoomCreated has roomId as first indexed param (topics[1])
          if (topics && topics.length >= 2) {
            try {
              const possibleRoomId = BigInt(topics[1]);
              if (possibleRoomId > 0n) {
                roomId = possibleRoomId;
                console.log("Got roomId from topic[1]:", roomId.toString());
                break;
              }
            } catch {
              // Not a valid bigint, continue
            }
          }
        }
      }

      if (roomId === null) {
        throw new Error("Failed to get roomId after all fallback strategies");
      }

      toast.success(`Room #${roomId} created successfully!`);
      return { roomId };

    } catch (error: any) {
      console.error("CREATE_ROOM_ERROR:", error);
      throw error;
    } finally {
      setIsBusy(false);
    }
  }, [address, isConnected, publicClient, checkAllowance, approveUsdtGasless]);

  return {
    createRoomGasless,
    isBusy,
    isGaslessReady: true,
    isGaslessEnabled: GASLESS_ENABLED,
  };
}

// Hook for joining rooms (still using wagmi for now)
export function useGaslessJoinRoom() {
  const { address, isConnected } = useAccount();
  const [isBusy, setIsBusy] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const joinRoomGasless = useCallback(async (roomId: bigint): Promise<boolean> => {
    if (!address || !isConnected) {
      toast.error("Wallet not connected");
      return false;
    }

    setIsBusy(true);
    setIsSuccess(false);

    try {
      toast.info("Joining room (gasless)...");
      
      const result = await sendGaslessTransaction({
        contractAddress: ROOMMANAGER_V7_ADDRESS,
        abi: ROOM_MANAGER_ABI,
        method: "joinRoom",
        params: [roomId],
        userAddress: address,
      });

      console.log("[Gasless] Join room result:", result);
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
  }, [address, isConnected]);

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

  const cancelRoomGasless = useCallback(async (roomId: bigint): Promise<boolean> => {
    if (!address || !isConnected) {
      toast.error("Wallet not connected");
      return false;
    }

    setIsBusy(true);
    setIsSuccess(false);

    try {
      toast.info("Cancelling room (gasless)...");
      
      const result = await sendGaslessTransaction({
        contractAddress: ROOMMANAGER_V7_ADDRESS,
        abi: ROOM_MANAGER_ABI,
        method: "cancelRoom",
        params: [roomId],
        userAddress: address,
      });

      console.log("[Gasless] Cancel room result:", result);
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
  }, [address, isConnected]);

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

  const finishGameGasless = useCallback(async (
    roomId: bigint, 
    winner: `0x${string}`,
    isDraw: boolean = false,
    gameHash: `0x${string}` = "0x0000000000000000000000000000000000000000000000000000000000000000",
    proofOrSig: `0x${string}` = "0x"
  ): Promise<boolean> => {
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

      toast.info("Finishing game (gasless)...");
      
      const result = await sendGaslessTransaction({
        contractAddress: ROOMMANAGER_V7_ADDRESS,
        abi: ROOM_MANAGER_ABI,
        method: "finishGameSig",
        params: [roomId, winner, isDraw, gameHash, proofOrSig],
        userAddress: address,
      });

      console.log("[Gasless] Finish game result:", result);
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
  }, [address, isConnected]);

  const reset = useCallback(() => {
    setIsSuccess(false);
    setError(null);
  }, []);

  return { finishGameGasless, isPending, isConfirming, isSuccess, error, reset };
}
