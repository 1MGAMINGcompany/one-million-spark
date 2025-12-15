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
  relayerUrl: import.meta.env.VITE_RELAYER_URL || "https://your-relayer-url",
  relayerForwarderAddress: TRUSTED_FORWARDER_ADDRESS,
};

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
      const eth = (window as any).ethereum;
      if (!eth) throw new Error("WALLET_NOT_FOUND");

      // Get ethers signer from browser wallet
      const provider = new BrowserProvider(eth);
      const ethersSigner = await provider.getSigner();

      // Convert ethers signer to thirdweb account
      const account = await ethers6Adapter.signer.fromEthers({ signer: ethersSigner });

      // Get thirdweb contract instance
      const contract = getContract({
        client: thirdwebClient,
        chain: polygon,
        address: ROOMMANAGER_V7_ADDRESS,
        abi: ABI as any,
      });

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
