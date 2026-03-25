/**
 * useAllowanceGate — Strict on-chain allowance gating for prediction submissions.
 *
 * Reads USDC allowance from Polygon for the relayer, and manages the approval
 * flow with clear step-by-step states for UI rendering.
 */
import { useState, useCallback } from "react";
import { usePolygonUSDC, FEE_RELAYER_ADDRESS } from "./usePolygonUSDC";
import { usePrivyFeeTransfer } from "./usePrivyFeeTransfer";
import { usePrivyWallet } from "./usePrivyWallet";
import { dbg } from "@/lib/debugLog";

// Bridged USDC.e on Polygon — the trading token
const USDC_CONTRACT = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
const USDC_DECIMALS = 6;
const ALLOWANCE_SELECTOR = "0xdd62ed3e";

const POLYGON_RPCS = [
  "https://polygon-bor-rpc.publicnode.com",
  "https://polygon.drpc.org",
  "https://rpc.ankr.com/polygon",
];

function padAddress(address: string): string {
  return address.slice(2).toLowerCase().padStart(64, "0");
}

/** Direct on-chain allowance read — bypasses cached state */
async function readOnChainAllowance(ownerAddress: string): Promise<number | null> {
  const callData =
    ALLOWANCE_SELECTOR +
    padAddress(ownerAddress) +
    padAddress(FEE_RELAYER_ADDRESS);

  for (const rpc of POLYGON_RPCS) {
    try {
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_call",
          params: [{ to: USDC_CONTRACT, data: callData }, "latest"],
        }),
      });
      if (!res.ok) continue;
      const json = await res.json();
      if (json.result) {
        return Number(BigInt(json.result)) / 10 ** USDC_DECIMALS;
      }
    } catch {
      continue;
    }
  }
  return null;
}

export type ApprovalStep =
  | "idle"
  | "checking_allowance"
  | "approval_required"
  | "waiting_wallet"
  | "approval_submitted"
  | "waiting_confirmation"
  | "approval_confirmed"
  | "ready"
  | "error";

export interface AllowanceGateState {
  step: ApprovalStep;
  errorReason: string | null;
  currentAllowance: number | null;
  requiredAmount: number | null;
  ownerAddress: string | null;
  spenderAddress: string;
  txHash: string | null;
}

export interface AllowanceDebugInfo {
  walletAddress: string | null;
  relayerAddress: string;
  currentAllowance: number | null;
  requiredFee: number;
  approvalNeeded: boolean;
  isSmartWallet: boolean;
}

export function useAllowanceGate() {
  const { walletAddress } = usePrivyWallet();
  const { relayer_allowance, usdc_balance } = usePolygonUSDC();
  const { approveFeeAllowance } = usePrivyFeeTransfer();

  const [step, setStep] = useState<ApprovalStep>("idle");
  const [errorReason, setErrorReason] = useState<string | null>(null);
  const [currentAllowance, setCurrentAllowance] = useState<number | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [requiredAmount, setRequiredAmount] = useState<number | null>(null);

  /**
   * Ensure on-chain allowance >= requiredFee before proceeding.
   * Returns true if allowance is confirmed, false if failed.
   */
  const ensureAllowance = useCallback(
    async (requiredFee: number): Promise<boolean> => {
      setErrorReason(null);
      setTxHash(null);
      setRequiredAmount(requiredFee);

      if (!walletAddress) {
        setStep("error");
        setErrorReason("No wallet connected");
        return false;
      }

      // Step 1: Check on-chain allowance (not cached)
      setStep("checking_allowance");
      dbg("allowance_gate:check_start", {
        owner: walletAddress,
        spender: FEE_RELAYER_ADDRESS,
        token: USDC_CONTRACT,
        requiredFee,
        cachedAllowance: relayer_allowance,
      });

      const onChainAllowance = await readOnChainAllowance(walletAddress);
      setCurrentAllowance(onChainAllowance);

      dbg("allowance_gate:on_chain_read", {
        owner: walletAddress,
        allowance: onChainAllowance,
        requiredFee,
      });

      if (onChainAllowance !== null && onChainAllowance >= requiredFee) {
        setStep("ready");
        dbg("allowance_gate:sufficient", { allowance: onChainAllowance });
        return true;
      }

      // Step 2: Check balance before requesting approval
      if (usdc_balance !== null && usdc_balance < requiredFee) {
        setStep("error");
        setErrorReason(`Insufficient USDC balance: $${usdc_balance.toFixed(2)} < $${requiredFee.toFixed(2)}`);
        dbg("allowance_gate:insufficient_balance", { balance: usdc_balance, required: requiredFee });
        return false;
      }

      // Step 3: Need approval
      setStep("approval_required");
      dbg("allowance_gate:approval_needed", {
        currentAllowance: onChainAllowance,
        requiredFee,
      });

      // Brief pause for UI
      await new Promise(r => setTimeout(r, 500));

      // Step 4: Request approval via Privy
      setStep("waiting_wallet");
      dbg("allowance_gate:requesting_approval", { owner: walletAddress });

      const result = await approveFeeAllowance();

      if (!result.success) {
        const reason = result.error || "unknown";
        const friendlyReason = reason.includes("rejected") || reason.includes("denied") || reason.includes("cancel")
          ? "You rejected the approval in your wallet"
          : reason.includes("revert")
            ? "Approval transaction reverted on-chain"
            : reason.includes("timeout") || reason.includes("not_confirmed")
              ? "Approval confirmation timed out — try again"
              : reason.includes("no_wallet")
                ? "No wallet address found"
                : `Approval failed: ${reason}`;

        setStep("error");
        setErrorReason(friendlyReason);
        setTxHash(result.txHash || null);
        dbg("allowance_gate:approval_failed", {
          error: reason,
          txHash: result.txHash,
          owner: walletAddress,
        });
        return false;
      }

      setTxHash(result.txHash || null);
      setStep("approval_submitted");

      dbg("allowance_gate:approval_tx_sent", {
        txHash: result.txHash,
        owner: walletAddress,
      });

      // Step 5: Verify on-chain allowance after approval
      setStep("waiting_confirmation");

      // Poll on-chain allowance up to 15 attempts (30 seconds)
      for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const confirmed = await readOnChainAllowance(walletAddress);
        dbg("allowance_gate:confirmation_poll", { attempt: i + 1, allowance: confirmed });

        if (confirmed !== null && confirmed >= requiredFee) {
          setCurrentAllowance(confirmed);
          setStep("approval_confirmed");
          dbg("allowance_gate:confirmed", {
            allowance: confirmed,
            txHash: result.txHash,
            owner: walletAddress,
            afterAttempts: i + 1,
          });
          // Brief success flash
          await new Promise(r => setTimeout(r, 800));
          setStep("ready");
          return true;
        }
      }

      // Timed out
      setStep("error");
      setErrorReason("Approval confirmation timed out after 30s. The transaction may still be processing — try again in a moment.");
      dbg("allowance_gate:confirmation_timeout", {
        txHash: result.txHash,
        owner: walletAddress,
      });
      return false;
    },
    [walletAddress, relayer_allowance, usdc_balance, approveFeeAllowance],
  );

  /** Get debug info for the debug panel */
  const getDebugInfo = useCallback(
    (requiredFee: number): AllowanceDebugInfo => ({
      walletAddress: walletAddress || null,
      relayerAddress: FEE_RELAYER_ADDRESS,
      currentAllowance: relayer_allowance,
      requiredFee,
      approvalNeeded: (relayer_allowance ?? 0) < requiredFee,
      isSmartWallet: true, // Privy smart wallets
    }),
    [walletAddress, relayer_allowance],
  );

  /** Force-refresh allowance from chain */
  const refreshAllowance = useCallback(async () => {
    if (!walletAddress) return null;
    const val = await readOnChainAllowance(walletAddress);
    setCurrentAllowance(val);
    return val;
  }, [walletAddress]);

  const reset = useCallback(() => {
    setStep("idle");
    setErrorReason(null);
    setTxHash(null);
    setRequiredAmount(null);
  }, []);

  const state: AllowanceGateState = {
    step,
    errorReason,
    currentAllowance,
    requiredAmount,
    ownerAddress: walletAddress || null,
    spenderAddress: FEE_RELAYER_ADDRESS,
    txHash,
  };

  return { state, ensureAllowance, getDebugInfo, refreshAllowance, reset };
}
