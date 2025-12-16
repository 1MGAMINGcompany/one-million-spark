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
import { BrowserProvider } from "ethers";
import ABI from "@/abi/RoomManagerV7Production.abi.json";
import { logCreateRoomDebug } from "@/lib/txErrorLogger";
import {
  ROOMMANAGER_V7_ADDRESS,
  TRUSTED_FORWARDER_ADDRESS,
  USDT_ADDRESS,
  USDT_DECIMALS,
  POLYGON_CHAIN_ID_HEX,
} from "@/lib/contractAddresses";

// Re-export addresses for backwards compatibility
export { ROOMMANAGER_V7_ADDRESS, TRUSTED_FORWARDER_ADDRESS, USDT_ADDRESS as USDT_TOKEN_ADDRESS };

// Thirdweb client - uses env variable for gasless transactions
const thirdwebClient = createThirdwebClient({
  clientId: import.meta.env.VITE_THIRDWEB_CLIENT_ID || "e9e1086beb8bf58653a15ccaa171f889",
});

// Gasless config using OpenZeppelin ERC-2771 pattern
const GASLESS_CONFIG = {
  provider: "openzeppelin" as const,
  relayerUrl: import.meta.env.VITE_RELAYER_URL || "https://prj_cmj4z7zde06ad7j0lbgauwexy.engine.thirdweb.com",
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

// Helper to format USDT units
function formatUsdtUnits(units: bigint): string {
  return (Number(units) / 10 ** USDT_DECIMALS).toFixed(USDT_DECIMALS);
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
    
    // Validate chain ID
    if (chainId !== POLYGON_CHAIN_ID_HEX) {
      setIsBusy(false);
      throw new Error(`WRONG_NETWORK: Expected ${POLYGON_CHAIN_ID_HEX} (Polygon), got ${chainId}`);
    }

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
      usdtTokenAddress: USDT_ADDRESS,
      stakeRaw: entryFeeUnits.toString(),
      stakeFormatted: formatUsdtUnits(entryFeeUnits) + ' USDT',
    };

    try {
      const account = await getThirdwebAccount();
      const contract = getThirdwebContract();

      // Prepare the createRoom transaction with explicit types matching contract
      // entryFee: uint256, maxPlayers: uint8, isPrivate: bool, 
      // platformFeeBps: uint16, gameId: uint32, turnTimeSec: uint16
      const transaction = prepareContractCall({
        contract,
        method: "function createRoom(uint256 entryFee, uint8 maxPlayers, bool isPrivate, uint16 platformFeeBps, uint32 gameId, uint16 turnTimeSec) returns (uint256)",
        params: [
          entryFeeUnits,           // uint256 - BigInt
          maxPlayers,              // uint8 - number (will be cast)
          isPrivate,               // bool
          platformFeeBps,          // uint16 - number (will be cast)
          gameId,                  // uint32 - number (will be cast)
          turnTimeSec,             // uint16 - number (will be cast)
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
      console.log("stake amount (formatted):", formatUsdtUnits(entryFeeUnits), "USDT");
      console.log("USDT token address:", USDT_ADDRESS);
      console.log("--- Gasless Config ---");
      console.log("relayerUrl:", GASLESS_CONFIG.relayerUrl);
      console.log("trustedForwarder:", TRUSTED_FORWARDER_ADDRESS);
      console.log("tx.value:", "0 (gasless via relayer)");
      console.groupEnd();

      // Send gasless transaction via relayer (user signs, relayer pays gas)
      const result = await sendTransaction({
        account,
        transaction,
        gasless: GASLESS_CONFIG,
      });

      // Wait for receipt
      const receipt = await waitForReceipt({ 
        client: thirdwebClient, 
        chain: polygon, 
        transactionHash: result.transactionHash 
      });

      // Fetch latest room ID from contract
      const roomId = await readContract({
        contract,
        method: "function latestRoomId() view returns (uint256)",
        params: [],
      });

      console.log("CREATE_ROOM_SUCCESS:", {
        transactionHash: receipt.transactionHash,
        roomId: roomId.toString(),
      });

      return {
        transactionHash: receipt.transactionHash,
        roomId: roomId as bigint,
      };
    } catch (err) {
      // Log comprehensive debug info on failure
      logCreateRoomDebug(debugContext, err);
      
      // Extract revert reason if available
      const errorMsg = (err as any)?.message || String(err);
      const revertMatch = errorMsg.match(/reason="([^"]+)"/);
      const dataMatch = errorMsg.match(/data="([^"]+)"/);
      
      if (revertMatch || dataMatch) {
        console.error("REVERT_REASON:", revertMatch?.[1] || dataMatch?.[1]);
      }
      
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

      // Wait for receipt
      const receipt = await waitForReceipt({ 
        client: thirdwebClient, 
        chain: polygon, 
        transactionHash: result.transactionHash 
      });

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
      const receipt = await waitForReceipt({ 
        client: thirdwebClient, 
        chain: polygon, 
        transactionHash: result.transactionHash 
      });

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
      const receipt = await waitForReceipt({ 
        client: thirdwebClient, 
        chain: polygon, 
        transactionHash: result.transactionHash 
      });

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
