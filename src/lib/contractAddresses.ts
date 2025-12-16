// Canonical contract addresses for 1M Gaming on Polygon Mainnet
// These are the ONLY addresses that should be used across the app

// USDT Token (6 decimals) - checksummed
export const USDT_ADDRESS = "0xC2132D05D31c914a87C6611C10748AEb04B58e8F" as const;
export const USDT_DECIMALS = 6;

// RoomManagerV7Production - main game contract
export const ROOMMANAGER_V7_ADDRESS = "0xA039B03De894ebFa92933a9A7326c1715f040b96" as const;

// ERC-2771 Trusted Forwarder for gasless transactions
export const TRUSTED_FORWARDER_ADDRESS = "0x819e9EEf99446117476820aA2Ef754F068D7305e" as const;

// Fee Recipient address
export const FEE_RECIPIENT_ADDRESS = "0x55dD5b94C332aB44ceAAC7C6AD787497B3Af47a8" as const;

// Phase1 Game Verifier
export const GAME_VERIFIER_ADDRESS = "0x92a9d0482194166Cb7Fd185c41d254B44Bc01faB" as const;

// Polygon Mainnet chain ID
export const POLYGON_CHAIN_ID = 137;
export const POLYGON_CHAIN_ID_HEX = "0x89";

// Platform fee in basis points (500 = 5%)
export const PLATFORM_FEE_BPS = 500;

// Minimum entry fee in USDT (0.5 USDT = 500000 units)
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
