/**
 * Canonical Polygon token configuration for Edge Functions.
 *
 * ALL prediction-related money flows (fees, settlements, purchases, payouts)
 * use USDC.e (Bridged USDC) on Polygon. This file is the single source of truth.
 */

/** Bridged USDC (USDC.e) — the canonical trading & settlement token */
export const USDC_CONTRACT = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";

/** Native Circle USDC — only used in swap-to-USDC.e detection, NOT for money flow */
export const USDC_NATIVE_CONTRACT = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";

/** Decimals for both USDC variants on Polygon */
export const USDC_DECIMALS = 6;

/** Platform treasury wallet */
export const TREASURY_WALLET = "0x72F3AA1B3B0815033AD6037edC1586dE592Ed88d";

/** Fee relayer wallet */
export const FEE_RELAYER_ADDRESS = "0x3b3bf64329CCf08a727e4fEd41821E8534685fAD";

/** Multi-provider RPC fallback list */
export const POLYGON_RPCS = [
  "https://polygon-bor-rpc.publicnode.com",
  "https://polygon.drpc.org",
  "https://rpc.ankr.com/polygon",
  "https://polygon-rpc.com",
];
