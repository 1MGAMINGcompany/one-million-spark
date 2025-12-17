// Push Protocol removed - Solana migration
// This file is kept as a stub for backwards compatibility

export const PUSH_ENV = "prod";

export const APP_CHANNEL_ADDRESS = "0x0000000000000000000000000000000000000000" as `0x${string}`;

export async function pushSubscribe(user: `0x${string}`) {
  console.warn("Push Protocol not available on Solana");
  return [];
}

export async function getUserNotifications(user: `0x${string}`) {
  console.warn("Push Protocol not available on Solana");
  return [];
}
