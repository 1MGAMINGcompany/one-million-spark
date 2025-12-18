import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Generates a unique room ID as a u64 bigint.
 * Uses milliseconds since epoch + small randomness to avoid collisions.
 */
export function newRoomIdU64(): bigint {
  const now = BigInt(Date.now());
  const r = BigInt(Math.floor(Math.random() * 1000)); // 0..999
  return now * 1000n + r;
}
