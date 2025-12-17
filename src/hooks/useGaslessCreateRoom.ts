import { useCallback, useState } from "react";
import { createThirdwebClient, getContract, prepareContractCall, sendTransaction } from "thirdweb";
import { polygon } from "thirdweb/chains";
import { ethers6Adapter } from "thirdweb/adapters/ethers6";
import { BrowserProvider } from "ethers";
import ABI from "@/abi/RoomManagerV7Production.abi.json";

export const ROOMMANAGER_V7_ADDRESS = "0xF99df196a90ae9Ea1A124316D2c85363D2A9cDA1" as const;
export const TRUSTED_FORWARDER_ADDRESS = "0x819e9EEf99446117476820aA2Ef754F068D7305e" as const;

// Thirdweb client - requires clientId from thirdweb dashboard
const thirdwebClient = createThirdwebClient({
  clientId: import.meta.env.VITE_THIRDWEB_CLIENT_ID || "your_thirdweb_client_id",
});

// Gasless config using OpenZeppelin ERC-2771 pattern
const GASLESS_CONFIG = {
  provider: "openzeppelin" as const,
  relayerForwarderAddress: TRUSTED_FORWARDER_ADDRESS,
} as any;

// Helper to get thirdweb account from browser wallet
async function getThirdwebAccount() {
  const eth = (window as any).ethereum;
  if (!eth) throw new Error("WALLET_NOT_FOUND");

  const provider = new BrowserProvider(eth);
  const ethersSigner = await provider.getSigner();
  return ethers6Adapter.signer.fromEthers({ signer: ethersSigner });
}

// Helper to get thirdweb contract instance
function getThirdwebContract() {
  return getContract({
    client: thirdwebClient,
    chain: polygon,
    address: ROOMMANAGER_V7_ADDRESS,
    abi: ABI as any,
  });
}

export function useGaslessCreateRoom() {
  const [isBusy, setIsBusy] = useState(false);

  const createRoomGasless = useCallback(async (
    entryFeeUnits: bigint,
    maxPlayers: number,
    isPrivate: boolean,
    platformFeeBps: number,
    gameId: number,
    turnTimeSec: number
  ): Promise<{ transactionHash: string; roomId: bigint }> => {
    if (isBusy) throw new Error("BUSY");
    setIsBusy(true);

    try {
      const account = await getThirdwebAccount();
      const contract = getThirdwebContract();

      // Prepare the createRoom transaction
      const transaction = prepareContractCall({
        contract,
        method: "function createRoom(uint256 entryFee, uint8 maxPlayers, bool isPrivate, uint16 platformFeeBps, uint8 gameId, uint16 turnTimeSec)",
        params: [
          entryFeeUnits,
          maxPlayers,
          isPrivate,
          platformFeeBps,
          gameId,
          turnTimeSec,
        ],
      });

      // Send gasless transaction via relayer (user signs, relayer pays gas)
      const result = await sendTransaction({
        account,
        transaction,
        gasless: GASLESS_CONFIG,
      });

      // Wait for receipt
      const { waitForReceipt } = await import("thirdweb");
      const receipt = await waitForReceipt(result);

      // Fetch latest room ID from contract
      const { readContract } = await import("thirdweb");
      const roomId = await readContract({
        contract,
        method: "function latestRoomId() view returns (uint256)",
        params: [],
      });

      return {
        transactionHash: receipt.transactionHash,
        roomId: roomId as bigint,
      };
    } finally {
      setIsBusy(false);
    }
  }, [isBusy]);

  return {
    createRoomGasless,
    isBusy,
  };
}

export function useGaslessJoinRoom() {
  const [isBusy, setIsBusy] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const joinRoomGasless = useCallback(async (roomId: bigint): Promise<{ transactionHash: string }> => {
    if (isBusy) throw new Error("BUSY");
    setIsBusy(true);
    setIsSuccess(false);
    setError(null);

    try {
      const account = await getThirdwebAccount();
      const contract = getThirdwebContract();

      // Prepare the joinRoom transaction
      const transaction = prepareContractCall({
        contract,
        method: "function joinRoom(uint256 roomId)",
        params: [roomId],
      });

      // Send gasless transaction via relayer (user signs, relayer pays gas)
      const result = await sendTransaction({
        account,
        transaction,
        gasless: GASLESS_CONFIG,
      });

      // Wait for receipt
      const { waitForReceipt } = await import("thirdweb");
      const receipt = await waitForReceipt(result);

      setIsSuccess(true);
      return {
        transactionHash: receipt.transactionHash,
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setIsBusy(false);
    }
  }, [isBusy]);

  const reset = useCallback(() => {
    setIsSuccess(false);
    setError(null);
  }, []);

  return {
    joinRoomGasless,
    isBusy,
    isSuccess,
    error,
    reset,
  };
}

export function useGaslessCancelRoom() {
  const [isBusy, setIsBusy] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const cancelRoomGasless = useCallback(async (roomId: bigint): Promise<{ transactionHash: string }> => {
    if (isBusy) throw new Error("BUSY");
    setIsBusy(true);
    setIsSuccess(false);
    setError(null);

    try {
      const account = await getThirdwebAccount();
      const contract = getThirdwebContract();

      // Prepare the cancelRoom transaction
      const transaction = prepareContractCall({
        contract,
        method: "function cancelRoom(uint256 roomId)",
        params: [roomId],
      });

      // Send gasless transaction via relayer (user signs, relayer pays gas)
      const result = await sendTransaction({
        account,
        transaction,
        gasless: GASLESS_CONFIG,
      });

      // Wait for receipt
      const { waitForReceipt } = await import("thirdweb");
      const receipt = await waitForReceipt(result);

      setIsSuccess(true);
      return {
        transactionHash: receipt.transactionHash,
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setIsBusy(false);
    }
  }, [isBusy]);

  const reset = useCallback(() => {
    setIsSuccess(false);
    setError(null);
  }, []);

  return {
    cancelRoomGasless,
    isBusy,
    isSuccess,
    error,
    reset,
  };
}

export function useGaslessFinishGame() {
  const [isBusy, setIsBusy] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const finishGameGasless = useCallback(async (
    roomId: bigint,
    winnerAddress: `0x${string}`,
    isDraw: boolean = false,
    gameHash: `0x${string}` = "0x0000000000000000000000000000000000000000000000000000000000000000",
    proofOrSig: `0x${string}` = "0x"
  ): Promise<{ transactionHash: string }> => {
    if (isBusy) throw new Error("BUSY");
    setIsBusy(true);
    setIsSuccess(false);
    setError(null);

    try {
      const account = await getThirdwebAccount();
      const contract = getThirdwebContract();

      // Prepare the finishGameSig transaction (V7 signature: roomId, winner, isDraw, gameHash, proofOrSig)
      const transaction = prepareContractCall({
        contract,
        method: "function finishGameSig(uint256 roomId, address winner, bool isDraw, bytes32 gameHash, bytes proofOrSig)",
        params: [roomId, winnerAddress, isDraw, gameHash, proofOrSig],
      });

      // Send gasless transaction via relayer (user signs, relayer pays gas)
      const result = await sendTransaction({
        account,
        transaction,
        gasless: GASLESS_CONFIG,
      });

      // Wait for receipt
      const { waitForReceipt } = await import("thirdweb");
      const receipt = await waitForReceipt(result);

      setIsSuccess(true);
      return {
        transactionHash: receipt.transactionHash,
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setIsBusy(false);
    }
  }, [isBusy]);

  const reset = useCallback(() => {
    setIsSuccess(false);
    setError(null);
  }, []);

  return {
    finishGameGasless,
    isBusy,
    isPending: isBusy,
    isConfirming: false,
    isSuccess,
    error,
    reset,
  };
}
