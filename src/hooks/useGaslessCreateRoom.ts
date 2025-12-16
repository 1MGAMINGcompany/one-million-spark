import { useCallback, useState } from "react";
import { 
  createThirdwebClient, 
  getContract, 
  prepareContractCall, 
  sendTransaction,
  waitForReceipt,
  readContract 
} from "thirdweb";
import { polygon } from "thirdweb/chains";
import { ethers6Adapter } from "thirdweb/adapters/ethers6";
import { BrowserProvider, formatUnits } from "ethers";
import ABI from "@/abi/RoomManagerV7Production.abi.json";
import { logCreateRoomDebug } from "@/lib/txErrorLogger";

export const ROOMMANAGER_V7_ADDRESS = "0x4f3998195462100D867129747967BFCb56C07fe2" as const;
export const TRUSTED_FORWARDER_ADDRESS = "0x819e9EEf99446117476820aA2Ef754F068D7305e" as const;
export const USDT_TOKEN_ADDRESS = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F" as const;

// Thirdweb client - uses env variable for gasless transactions
const thirdwebClient = createThirdwebClient({
  clientId: import.meta.env.VITE_THIRDWEB_CLIENT_ID || "e9e1086beb8bf58653a15ccaa171f889",
});

// Gasless config using OpenZeppelin ERC-2771 pattern
const GASLESS_CONFIG = {
  provider: "openzeppelin" as const,
  relayerUrl: "https://prj_cmj4z7zde06ad7j0lbgauwexy.engine.thirdweb.com",
  relayerForwarderAddress: TRUSTED_FORWARDER_ADDRESS,
} as any;

// Helper to get chain ID from wallet
async function getWalletChainId(): Promise<string> {
  const eth = (window as any).ethereum;
  if (!eth) return 'unknown';
  try {
    return await eth.request({ method: 'eth_chainId' });
  } catch {
    return 'error';
  }
}

// Helper to get wallet address
async function getWalletAddress(): Promise<string> {
  const eth = (window as any).ethereum;
  if (!eth) return 'unknown';
  try {
    const accounts = await eth.request({ method: 'eth_accounts' });
    return accounts?.[0] || 'no-account';
  } catch {
    return 'error';
  }
}

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

    // Collect debug context upfront
    const chainId = await getWalletChainId();
    const walletAddress = await getWalletAddress();
    const debugContext = {
      chainId,
      walletAddress,
      contractAddress: ROOMMANAGER_V7_ADDRESS,
      functionName: 'createRoom',
      params: {
        entryFeeUnits: entryFeeUnits.toString(),
        maxPlayers,
        isPrivate,
        platformFeeBps,
        gameId,
        turnTimeSec,
      },
      usdtTokenAddress: USDT_TOKEN_ADDRESS,
      stakeRaw: entryFeeUnits.toString(),
      stakeFormatted: formatUnits(entryFeeUnits, 6) + ' USDT',
    };

    try {
      const account = await getThirdwebAccount();
      const contract = getThirdwebContract();

      // Prepare the createRoom transaction (gameId is uint32 per contract ABI)
      const transaction = prepareContractCall({
        contract,
        method: "function createRoom(uint256 entryFee, uint8 maxPlayers, bool isPrivate, uint16 platformFeeBps, uint32 gameId, uint16 turnTimeSec)",
        params: [
          entryFeeUnits,
          maxPlayers,
          isPrivate,
          platformFeeBps,
          gameId,
          turnTimeSec,
        ],
      });

      // Log ALL inputs immediately before sending transaction
      console.group("CREATE_ROOM_INPUTS");
      console.log("chainId:", chainId);
      console.log("wallet address (msg.sender):", walletAddress);
      console.log("RoomManager contract address:", ROOMMANAGER_V7_ADDRESS);
      console.log("function name:", "createRoom");
      console.log("--- Parameters (in order) ---");
      console.log("  [0] entryFee (uint256):", entryFeeUnits.toString());
      console.log("  [1] maxPlayers (uint8):", maxPlayers);
      console.log("  [2] isPrivate (bool):", isPrivate);
      console.log("  [3] platformFeeBps (uint16):", platformFeeBps);
      console.log("  [4] gameId (uint32):", gameId);
      console.log("  [5] turnTimeSec (uint16):", turnTimeSec);
      console.log("--- Stake Info ---");
      console.log("stake amount (raw units):", entryFeeUnits.toString());
      console.log("stake amount (formatted):", formatUnits(entryFeeUnits, 6), "USDT");
      console.log("USDT token address:", USDT_TOKEN_ADDRESS);
      console.log("feeRecipient address:", "contract-defined (owner)");
      console.log("gameId / gameType:", gameId);
      console.log("--- Transaction Object ---");
      console.log("tx.to:", ROOMMANAGER_V7_ADDRESS);
      console.log("tx.data:", transaction);
      console.log("tx.value:", "0 (gasless via relayer)");
      console.groupEnd();

      // Send gasless transaction via relayer (user signs, relayer pays gas)
      const result = await sendTransaction({
        account,
        transaction,
        gasless: GASLESS_CONFIG,
      });

      // Wait for receipt (static import - no dynamic loading)
      const receipt = await waitForReceipt({ client: thirdwebClient, chain: polygon, transactionHash: result.transactionHash });

      // Fetch latest room ID from contract (static import - no dynamic loading)
      const roomId = await readContract({
        contract,
        method: "function latestRoomId() view returns (uint256)",
        params: [],
      });

      return {
        transactionHash: receipt.transactionHash,
        roomId: roomId as bigint,
      };
    } catch (err) {
      // Log comprehensive debug info on failure
      logCreateRoomDebug(debugContext, err);
      throw err;
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

      // Wait for receipt (static import - no dynamic loading)
      const receipt = await waitForReceipt({ client: thirdwebClient, chain: polygon, transactionHash: result.transactionHash });

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

      // Wait for receipt (static import - no dynamic loading)
      const receipt = await waitForReceipt({ client: thirdwebClient, chain: polygon, transactionHash: result.transactionHash });

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

      // Wait for receipt (static import - no dynamic loading)
      const receipt = await waitForReceipt({ client: thirdwebClient, chain: polygon, transactionHash: result.transactionHash });

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
