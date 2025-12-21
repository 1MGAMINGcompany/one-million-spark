// Polyfills for browser environment (required by Solana/web3.js)
import { Buffer } from "buffer";

// Polyfill Buffer
if (typeof globalThis.Buffer === "undefined") {
  (globalThis as any).Buffer = Buffer;
}

// Polyfill process
if (typeof globalThis.process === "undefined") {
  (globalThis as any).process = { env: {} };
}
