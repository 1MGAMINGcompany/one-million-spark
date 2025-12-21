// Polyfills for browser environment (required by Solana/web3.js)
// IMPORTANT: Must be set BEFORE any imports that use them

import { Buffer } from "buffer";

// Immediately set globals before any other code runs
(globalThis as any).Buffer = Buffer;
(globalThis as any).process = (globalThis as any).process || { env: {} };
