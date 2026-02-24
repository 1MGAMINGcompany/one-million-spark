// Polyfills for browser environment (required by Solana/web3.js)
// IMPORTANT: Must be set BEFORE any imports that use them

import { Buffer } from "buffer";

// Immediately set globals before any other code runs
(globalThis as any).Buffer = Buffer;
(globalThis as any).process = (globalThis as any).process || { env: {} };

// Polyfill crypto.randomUUID for older browsers / in-app wallets (Phantom, Samsung Internet)
if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID !== "function") {
  (globalThis.crypto as any).randomUUID = (): string => {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 1
    const h = [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
    return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
  };
}
