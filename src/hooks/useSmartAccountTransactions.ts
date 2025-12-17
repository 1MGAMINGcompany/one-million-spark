import { useState, useCallback } from "react";
import { useSendTransaction, useActiveAccount } from "thirdweb/react";
import { prepareContractCall, getContract, waitForReceipt, readContract } from "thirdweb";
import { polygon } from "thirdweb/chains";
import { keccak256, toBytes } from "viem";
import { toast } from "sonner";
import { thirdwebClient, ROOMMANAGER_V7_ADDRESS, USDT_ADDRESS } from "@/lib/thirdwebClient";

// Rules hash for contract validation
const RULES_TEXT = `
1 MILLION GAMING – OFFICIAL RULES V1
Skill-based gameplay only.
No randomness manipulation.
Winner decided by game logic.
No disputes.
`;
const RULES_HASH = keccak256(toBytes(RULES_TEXT));

// Get the RoomManager contract instance
const roomManagerContract = getContract({
  client: thirdwebClient,
  chain: polygon,
  address: ROOMMANAGER_V7_ADDRESS,
});

// Get the USDT contract instance
const usdtContract = getContract({
  client: thirdwebClient,
  chain: polygon,
  address: USDT_ADDRESS,
});

// True gasless is now enabled with Smart Accounts
export const GASLESS_ENABLED = true;

// Hook for creating rooms with Smart Account (gasless)
export function useSmartCreateRoom() {
  const account = useActiveAccount();
  const [isBusy, setIsBusy] = useState(false);
  
  // Use sendTransaction - gas sponsorship comes from Account Abstraction in ThirdwebSmartProvider
  const { mutateAsync: sendTransaction, isPending } = useSendTransaction();

  // Debug: Log account info on mount/change
  if (account) {
    console.log("[useSmartCreateRoom] Active account:", account.address);
    console.log("[useSmartCreateRoom] Account type:", (account as any).type || typeof account);
    console.log("[useSmartCreateRoom] Full account object:", JSON.stringify(account, null, 2));
  } else {
    console.log("[useSmartCreateRoom] No active account");
  }

  // Check USDT allowance for the Smart Account
  const checkAllowance = useCallback(async (): Promise<bigint> => {
    if (!account) return 0n;
    console.log("[SmartAccount] Checking allowance for:", account.address);
    try {
      const allowance = await readContract({
        contract: usdtContract,
        method: "function allowance(address owner, address spender) view returns (uint256)",
        params: [account.address, ROOMMANAGER_V7_ADDRESS],
      });
      console.log("[SmartAccount] Current USDT allowance:", allowance.toString());
      return allowance;
    } catch (err) {
      console.error("[SmartAccount] Failed to check allowance:", err);
      return 0n;
    }
  }, [account]);

  // Approve USDT via Smart Account (gasless)
  const approveUsdtGasless = useCallback(async (amount: bigint): Promise<boolean> => {
    if (!account) throw new Error("Smart Account not connected");

    console.log("[SmartAccount] Approving USDT:", amount.toString());
    toast.info("Approving USDT (gasless)...");

    try {
      const transaction = prepareContractCall({
        contract: usdtContract,
        method: "function approve(address spender, uint256 amount) returns (bool)",
        params: [ROOMMANAGER_V7_ADDRESS, amount],
      });

      const result = await sendTransaction(transaction);
      console.log("[SmartAccount] Approve TX:", result.transactionHash);

      await waitForReceipt({
        client: thirdwebClient,
        chain: polygon,
        transactionHash: result.transactionHash,
      });

      toast.success("USDT approved (gasless)!");
      return true;
    } catch (err: any) {
      console.error("[SmartAccount] Approve failed:", err);
      toast.error("USDT approval failed: " + (err?.message?.slice(0, 100) || "Unknown error"));
      return false;
    }
  }, [account, sendTransaction]);

  const createRoomGasless = useCallback(async (
    entryFeeUnits: bigint,
    maxPlayers: number,
    isPrivate: boolean,
    platformFeeBps: number,
    gameId: number,
    turnTimeSec: number
  ): Promise<{ roomId: bigint }> => {
    if (!account) {
      throw new Error("Smart Account not connected");
    }

    // Hard defaults & validation
    const maxPlayersU8 = Math.max(2, Math.min(4, maxPlayers || 2));
    const gameIdU32 = Math.max(1, gameId || 1);
    const turnTimeU16 = turnTimeSec || 10;

    console.log("SMART_ACCOUNT_CREATE_ROOM_ARGS:", {
      entryFeeUnits: entryFeeUnits.toString(),
      maxPlayersU8,
      isPrivate,
      platformFeeBps: 500,
      gameIdU32,
      turnTimeU16,
      rulesHash: RULES_HASH,
      contract: ROOMMANAGER_V7_ADDRESS,
      smartAccount: account.address,
    });

    if (entryFeeUnits < 500000n) {
      throw new Error("Minimum entry fee is 0.5 USDT");
    }

    setIsBusy(true);

    try {
      // Step 1: Check allowance and approve if needed
      const currentAllowance = await checkAllowance();
      if (currentAllowance < entryFeeUnits) {
        console.log("[SmartAccount] Allowance insufficient, approving...");
        const approved = await approveUsdtGasless(entryFeeUnits);
        if (!approved) {
          throw new Error("USDT approval failed");
        }
      } else {
        console.log("[SmartAccount] Allowance sufficient, skipping approve");
      }

      // Step 2: Create room
      toast.info("Creating room (gasless)...");

      // Prepare the contract call
      const transaction = prepareContractCall({
        contract: roomManagerContract,
        method: "function createRoom(uint256 entryFee, uint8 maxPlayers, bool isPrivate, uint16 platformFeeBps, uint32 gameId, uint16 turnTimeSec, bytes32 rulesHash) returns (uint256)",
        params: [entryFeeUnits, maxPlayersU8, isPrivate, 500, gameIdU32, turnTimeU16, RULES_HASH as `0x${string}`],
      });

      // Send via Smart Account (gasless - thirdweb sponsors the gas)
      const result = await sendTransaction(transaction);
      console.log("Smart Account TX result:", result);

      toast.success("Transaction submitted, waiting for confirmation...");

      // Wait for receipt
      const receipt = await waitForReceipt({
        client: thirdwebClient,
        chain: polygon,
        transactionHash: result.transactionHash,
      });

      console.log("Transaction receipt:", receipt);

      // Parse roomId from logs
      let roomId: bigint | null = null;
      
      // Look for RoomCreated event
      // Event signature: RoomCreated(uint256 indexed roomId, address indexed creator, ...)
      const ROOM_CREATED_TOPIC = keccak256(toBytes("RoomCreated(uint256,address,uint256,uint8,bool,uint32,uint16)"));
      
      for (const log of receipt.logs) {
        const logAny = log as any;
        if (logAny.topics?.[0]?.toLowerCase() === ROOM_CREATED_TOPIC.toLowerCase()) {
          // roomId is indexed (topics[1])
          if (logAny.topics[1]) {
            roomId = BigInt(logAny.topics[1]);
            console.log("Parsed roomId from event:", roomId.toString());
            break;
          }
        }
      }

      // Fallback: read latestRoomId
      if (roomId === null) {
        console.warn("Event parsing failed, using latestRoomId fallback...");
        try {
          const latestId = await readContract({
            contract: roomManagerContract,
            method: "function latestRoomId() view returns (uint256)",
            params: [],
          });
          if (latestId && latestId > 0n) {
            roomId = latestId;
            console.log("Got roomId from latestRoomId():", roomId.toString());
          }
        } catch (err) {
          console.error("latestRoomId fallback failed:", err);
        }
      }

      if (roomId === null) {
        throw new Error("Failed to get roomId after all fallback strategies");
      }

      toast.success(`Room #${roomId} created successfully!`);
      return { roomId };

    } catch (error: any) {
      console.error("SMART_CREATE_ROOM_ERROR:", error);
      throw error;
    } finally {
      setIsBusy(false);
    }
  }, [account, sendTransaction, checkAllowance, approveUsdtGasless]);

  return {
    createRoomGasless,
    isBusy: isBusy || isPending,
    isGaslessReady: !!account,
    isGaslessEnabled: GASLESS_ENABLED,
  };
}

// Hook for joining rooms with Smart Account (gasless)
export function useSmartJoinRoom() {
  const account = useActiveAccount();
  const [isBusy, setIsBusy] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const { mutateAsync: sendTransaction, isPending } = useSendTransaction();

  // Check USDT allowance for the Smart Account
  const checkAllowance = useCallback(async (): Promise<bigint> => {
    if (!account) return 0n;
    try {
      const allowance = await readContract({
        contract: usdtContract,
        method: "function allowance(address owner, address spender) view returns (uint256)",
        params: [account.address, ROOMMANAGER_V7_ADDRESS],
      });
      return allowance;
    } catch (err) {
      console.error("[SmartAccount] Failed to check allowance:", err);
      return 0n;
    }
  }, [account]);

  // Approve USDT via Smart Account (gasless)
  const approveUsdtGasless = useCallback(async (amount: bigint): Promise<boolean> => {
    if (!account) throw new Error("Smart Account not connected");

    console.log("[SmartAccount] Approving USDT for join:", amount.toString());
    toast.info("Approving USDT (gasless)...");

    try {
      const transaction = prepareContractCall({
        contract: usdtContract,
        method: "function approve(address spender, uint256 amount) returns (bool)",
        params: [ROOMMANAGER_V7_ADDRESS, amount],
      });

      const result = await sendTransaction(transaction);
      await waitForReceipt({
        client: thirdwebClient,
        chain: polygon,
        transactionHash: result.transactionHash,
      });

      toast.success("USDT approved (gasless)!");
      return true;
    } catch (err: any) {
      console.error("[SmartAccount] Approve failed:", err);
      toast.error("USDT approval failed: " + (err?.message?.slice(0, 100) || "Unknown error"));
      return false;
    }
  }, [account, sendTransaction]);

  const joinRoomGasless = useCallback(async (roomId: bigint, entryFeeUnits?: bigint): Promise<boolean> => {
    if (!account) {
      toast.error("Smart Account not connected");
      return false;
    }

    setIsBusy(true);
    setIsSuccess(false);

    try {
      // Check and approve USDT if entryFeeUnits provided
      if (entryFeeUnits && entryFeeUnits > 0n) {
        const currentAllowance = await checkAllowance();
        if (currentAllowance < entryFeeUnits) {
          console.log("[SmartAccount] Allowance insufficient for join, approving...");
          const approved = await approveUsdtGasless(entryFeeUnits);
          if (!approved) {
            throw new Error("USDT approval failed");
          }
        }
      }

      toast.info("Joining room (gasless)...");

      const transaction = prepareContractCall({
        contract: roomManagerContract,
        method: "function joinRoom(uint256 roomId)",
        params: [roomId],
      });

      const result = await sendTransaction(transaction);
      console.log("Join room TX:", result.transactionHash);

      await waitForReceipt({
        client: thirdwebClient,
        chain: polygon,
        transactionHash: result.transactionHash,
      });

      setIsSuccess(true);
      toast.success("Joined room successfully!");
      return true;
    } catch (error: any) {
      console.error("SMART_JOIN_ROOM_ERROR:", error);
      toast.error(error?.message?.slice(0, 100) || "Failed to join room");
      return false;
    } finally {
      setIsBusy(false);
    }
  }, [account, sendTransaction, checkAllowance, approveUsdtGasless]);

  const reset = useCallback(() => {
    setIsSuccess(false);
  }, []);

  return { joinRoomGasless, isBusy: isBusy || isPending, isSuccess, reset };
}

// Hook for cancelling rooms with Smart Account (gasless)
export function useSmartCancelRoom() {
  const account = useActiveAccount();
  const [isBusy, setIsBusy] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const { mutateAsync: sendTransaction, isPending } = useSendTransaction();

  const cancelRoomGasless = useCallback(async (roomId: bigint): Promise<boolean> => {
    if (!account) {
      toast.error("Smart Account not connected");
      return false;
    }

    setIsBusy(true);
    setIsSuccess(false);

    try {
      const transaction = prepareContractCall({
        contract: roomManagerContract,
        method: "function cancelRoom(uint256 roomId)",
        params: [roomId],
      });

      const result = await sendTransaction(transaction);
      console.log("Cancel room TX:", result.transactionHash);

      await waitForReceipt({
        client: thirdwebClient,
        chain: polygon,
        transactionHash: result.transactionHash,
      });

      setIsSuccess(true);
      toast.success("Room cancelled");
      return true;
    } catch (error: any) {
      console.error("SMART_CANCEL_ROOM_ERROR:", error);
      toast.error(error?.message?.slice(0, 100) || "Failed to cancel room");
      return false;
    } finally {
      setIsBusy(false);
    }
  }, [account, sendTransaction]);

  const reset = useCallback(() => {
    setIsSuccess(false);
  }, []);

  return { cancelRoomGasless, isBusy: isBusy || isPending, isSuccess, reset };
}

// Hook for finishing games with Smart Account (gasless)
export function useSmartFinishGame() {
  const account = useActiveAccount();
  const [isPending, setIsPending] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { mutateAsync: sendTransaction, isPending: txPending } = useSendTransaction();

  const finishGameGasless = useCallback(async (
    roomId: bigint,
    winner: `0x${string}`,
    isDraw: boolean = false,
    gameHash: `0x${string}` = "0x0000000000000000000000000000000000000000000000000000000000000000",
    proofOrSig: `0x${string}` = "0x"
  ): Promise<boolean> => {
    if (!account) {
      setError(new Error("Smart Account not connected"));
      return false;
    }

    setIsPending(true);
    setIsConfirming(false);
    setIsSuccess(false);
    setError(null);

    try {
      setIsPending(false);
      setIsConfirming(true);

      const transaction = prepareContractCall({
        contract: roomManagerContract,
        method: "function finishGameSig(uint256 roomId, address winner, bool isDraw, bytes32 gameHash, bytes proofOrSig)",
        params: [roomId, winner, isDraw, gameHash, proofOrSig],
      });

      const result = await sendTransaction(transaction);
      console.log("Finish game TX:", result.transactionHash);

      await waitForReceipt({
        client: thirdwebClient,
        chain: polygon,
        transactionHash: result.transactionHash,
      });

      setIsSuccess(true);
      return true;
    } catch (err: any) {
      console.error("SMART_FINISH_GAME_ERROR:", err);
      setError(err instanceof Error ? err : new Error(String(err)));
      return false;
    } finally {
      setIsPending(false);
      setIsConfirming(false);
    }
  }, [account, sendTransaction]);

  const reset = useCallback(() => {
    setIsSuccess(false);
    setError(null);
  }, []);

  return { 
    finishGameGasless, 
    isPending: isPending || txPending, 
    isConfirming, 
    isSuccess, 
    error, 
    reset 
  };
}
