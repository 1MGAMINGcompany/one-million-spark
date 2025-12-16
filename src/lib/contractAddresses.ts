import { isAddress, getAddress } from "viem";

// Canonical contract addresses for 1M Gaming on Polygon Mainnet
// CRITICAL: These must be exactly 42 characters (0x + 40 hex chars)

// Use lowercase for USDT to avoid checksum issues with ethers v6
export const USDT_ADDRESS = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F" as `0x${string}`;
export const ROOMMANAGER_V7_ADDRESS = "0xA039B03De894ebFa92933a9A7326c1715f040b96" as `0x${string}`;
export const TRUSTED_FORWARDER_ADDRESS = "0x819e9EEf99446117476820aA2Ef754F068D7305e" as `0x${string}`;
export const FEE_RECIPIENT_ADDRESS = "0x55dD5b94C332aB44ceAAC7C6AD787497B3Af47a8" as `0x${string}`;
export const GAME_VERIFIER_ADDRESS = "0x92a9d0482194166Cb7Fd185c41d254B44Bc01faB" as `0x${string}`;

// Validate addresses at module load time
if (!isAddress(USDT_ADDRESS)) throw new Error("BAD_USDT_ADDRESS");
if (!isAddress(ROOMMANAGER_V7_ADDRESS)) throw new Error("BAD_ROOM_MANAGER_ADDRESS");
if (!isAddress(TRUSTED_FORWARDER_ADDRESS)) throw new Error("BAD_FORWARDER_ADDRESS");

// Log address lengths for debugging
console.log("CONTRACT_ADDRESSES_LOADED", {
  USDT: USDT_ADDRESS,
  USDT_LENGTH: USDT_ADDRESS.length,
  ROOM_MANAGER: ROOMMANAGER_V7_ADDRESS,
  ROOM_MANAGER_LENGTH: ROOMMANAGER_V7_ADDRESS.length,
});

// Constants
export const USDT_DECIMALS = 6;
export const POLYGON_CHAIN_ID = 137;
export const POLYGON_CHAIN_ID_HEX = "0x89";
export const PLATFORM_FEE_BPS = 500;
export const MIN_ENTRY_FEE_USDT = 0.5;
export const MIN_ENTRY_FEE_UNITS = 500000n;

// Helper functions
export function usdtToUnits(amount: number): bigint {
  return BigInt(Math.floor(amount * 10 ** USDT_DECIMALS));
}

export function unitsToUsdt(units: bigint): number {
  return Number(units) / 10 ** USDT_DECIMALS;
}

export function formatUsdt(units: bigint): string {
  return (Number(units) / 10 ** USDT_DECIMALS).toFixed(6);
}
