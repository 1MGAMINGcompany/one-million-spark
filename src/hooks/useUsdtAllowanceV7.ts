import { useReadContract } from "wagmi";
import { ROOMMANAGER_V7_ADDRESS } from "./useRoomManagerV7";

// USDT address on Polygon mainnet
const USDT_ADDRESS = "0xc2132d05d31c914a87c6611c10748aeb04b58e8f" as const;

// ERC20 ABI for allowance function
const ERC20_ALLOWANCE_ABI = [
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

// Hook to get USDT allowance for RoomManagerV7
export function useUsdtAllowanceV7(ownerAddress: `0x${string}` | undefined) {
  return useReadContract({
    address: USDT_ADDRESS,
    abi: ERC20_ALLOWANCE_ABI,
    functionName: "allowance",
    args: ownerAddress ? [ownerAddress, ROOMMANAGER_V7_ADDRESS] : undefined,
    chainId: 137,
    query: {
      enabled: !!ownerAddress,
      refetchInterval: 5000,
    },
  });
}
