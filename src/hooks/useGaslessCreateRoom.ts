import { useState, useCallback } from "react";
import { useAccount } from "wagmi";
import { parseUnits } from "viem";
import { toast } from "sonner";
import { sendTransaction, prepareContractCall, getContract } from "thirdweb";
import { polygon } from "thirdweb/chains";
import { ethers6Adapter } from "thirdweb/adapters/ethers6";
import { 
  thirdwebClient, 
  GASLESS_CONFIG,
  ROOMMANAGER_V7_ADDRESS,
  TRUSTED_FORWARDER_ADDRESS
} from "@/lib/thirdwebClient";

// RoomManagerV7Production ABI
const ROOM_MANAGER_ABI = [
  {
    inputs: [
      { internalType: "uint256", name: "entryFee", type: "uint256" },
      { internalType: "uint8", name: "maxPlayers", type: "uint8" },
      { internalType: "bool", name: "isPrivate", type: "bool" },
      { internalType: "uint16", name: "platformFeeBps", type: "uint16" },
      { internalType: "uint32", name: "gameId", type: "uint32" },
      { internalType: "uint16", name: "turnTimeSec", type: "uint16" }
    ],
    name: "createRoom",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
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
    name: "finishGame",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  }
] as const;

async function getThirdwebAccount() {
  const ethereum = (window as any).ethereum;
  if (!ethereum) throw new Error("No wallet provider found");
  
  const { ethers } = await import("ethers");
  const provider = new ethers.BrowserProvider(ethereum);
  const signer = await provider.getSigner();
  
  return ethers6Adapter.signer.fromEthers({ signer });
}

function getContract_() {
  return getContract({
    client: thirdwebClient,
    chain: polygon,
    address: ROOMMANAGER_V7_ADDRESS,
    abi: ROOM_MANAGER_ABI,
  });
}

interface CreateRoomParams {
  entryFeeUsdt: string;
  maxPlayers: number;
  isPrivate: boolean;
  gameId: number;
  turnTimeSec: number;
}

// Main hook for creating rooms (used by CreateRoom.tsx)
export function useGaslessCreateRoom() {
  const { address, isConnected } = useAccount();
  const [isBusy, setIsBusy] = useState(false);

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
    const entryFeeBase = entryFeeUnits;
    const maxPlayersU8 = Math.max(2, Math.min(4, maxPlayers || 2));
    const isPrivateBool = Boolean(isPrivate);
    const platformFee = 500; // Always 5%
    const gameIdU32 = Math.max(1, gameId || 1);
    const turnTimeU16 = turnTimeSec || 10;

    console.log("CREATE_ROOM_GASLESS_ARGS:", {
      entryFeeBase: entryFeeBase.toString(),
      maxPlayersU8,
      isPrivateBool,
      platformFee,
      gameIdU32,
      turnTimeU16,
    });

    if (entryFeeBase < 500000n) {
      throw new Error("Minimum entry fee is 0.5 USDT");
    }

    setIsBusy(true);

    try {
      const account = await getThirdwebAccount();
      console.log("Sending via ERC-2771 forwarder:", TRUSTED_FORWARDER_ADDRESS);

      const contract = getContract_();

      const transaction = prepareContractCall({
        contract,
        method: "createRoom",
        params: [entryFeeBase, maxPlayersU8, isPrivateBool, platformFee, gameIdU32, turnTimeU16],
      });

      const result = await sendTransaction({
        transaction,
        account,
        gasless: GASLESS_CONFIG,
      });

      console.log("Gasless TX result:", result);
      toast.success("Room created successfully!");
      
      // Return roomId (will be in event logs, for now return 1)
      return { roomId: 1n };

    } catch (error: any) {
      console.error("CREATE_ROOM_GASLESS_ERROR:", error);
      throw error;
    } finally {
      setIsBusy(false);
    }
  }, [address, isConnected]);

  return {
    createRoomGasless,
    isBusy,
    isGaslessReady: true,
    trustedForwarder: TRUSTED_FORWARDER_ADDRESS,
  };
}

// Hook for joining rooms (used by Room.tsx)
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
      const account = await getThirdwebAccount();
      const contract = getContract_();

      const transaction = prepareContractCall({
        contract,
        method: "joinRoom",
        params: [roomId],
      });

      const result = await sendTransaction({
        transaction,
        account,
        gasless: GASLESS_CONFIG,
      });

      console.log("Join room TX:", result);
      setIsSuccess(true);
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

// Hook for cancelling rooms (used by Room.tsx)
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
      const account = await getThirdwebAccount();
      const contract = getContract_();

      const transaction = prepareContractCall({
        contract,
        method: "cancelRoom",
        params: [roomId],
      });

      const result = await sendTransaction({
        transaction,
        account,
        gasless: GASLESS_CONFIG,
      });

      console.log("Cancel room TX:", result);
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

// Hook for finishing games (used by FinishGameButton.tsx)
export function useGaslessFinishGame() {
  const { address, isConnected } = useAccount();
  const [isPending, setIsPending] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<Error | null>(null);

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
      const account = await getThirdwebAccount();
      const contract = getContract_();

      const transaction = prepareContractCall({
        contract,
        method: "finishGame",
        params: [roomId, winner],
      });

      setIsPending(false);
      setIsConfirming(true);

      const result = await sendTransaction({
        transaction,
        account,
        gasless: GASLESS_CONFIG,
      });

      console.log("Finish game TX:", result);
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
