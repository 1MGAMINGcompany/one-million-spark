/**
 * usePolymarketSession — Per-user Polymarket trading wallet management.
 *
 * Model A: Each user gets their own Gnosis Safe + CLOB credentials
 * derived from a one-time SIWE signature. All subsequent trades
 * use these per-user credentials server-side.
 */
import { useState, useEffect, useCallback } from "react";
import { usePrivy, useSignMessage } from "@privy-io/react-auth";
import { supabase } from "@/integrations/supabase/client";
import { usePrivyWallet } from "@/hooks/usePrivyWallet";

interface PolymarketSessionState {
  /** Whether user has completed trading wallet setup */
  hasSession: boolean;
  /** Session status: not_setup | active | expired | awaiting_credentials */
  status: string;
  /** Whether user can place trades right now */
  canTrade: boolean;
  /** Whether Safe wallet has been deployed */
  safeDeployed: boolean;
  /** Whether token approvals are set */
  approvalsSet: boolean;
  /** User's derived Polymarket trading address */
  derivedAddress: string | null;
  /** Loading state */
  loading: boolean;
  /** Error message */
  error: string | null;
  /** Trigger full setup flow (one-time SIWE signature) */
  setupTradingWallet: () => Promise<{ success: boolean; error?: string }>;
  /** Refresh session status */
  refreshSession: () => Promise<void>;
}

const SIWE_MESSAGE_PREFIX = "Sign to enable Polymarket trading on 1MGAMING";

export function usePolymarketSession(): PolymarketSessionState {
  const { walletAddress, isPrivyUser } = usePrivyWallet();
  const { signMessage, getAccessToken } = usePrivy();
  const [hasSession, setHasSession] = useState(false);
  const [status, setStatus] = useState("not_setup");
  const [canTrade, setCanTrade] = useState(false);
  const [safeDeployed, setSafeDeployed] = useState(false);
  const [approvalsSet, setApprovalsSet] = useState(false);
  const [derivedAddress, setDerivedAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check session status on mount / wallet change
  const refreshSession = useCallback(async () => {
    if (!walletAddress) return;

    try {
      const token = await getAccessToken();
      if (!token) return;

      const { data, error: fnError } = await supabase.functions.invoke(
        "polymarket-user-setup",
        {
          body: { action: "check_status", wallet: walletAddress },
          headers: { "x-privy-token": token },
        },
      );

      if (fnError) {
        console.warn("[usePolymarketSession] check_status error:", fnError);
        return;
      }

      setHasSession(data.provisioned ?? false);
      setStatus(data.status ?? "not_setup");
      setCanTrade(data.can_trade ?? false);
      setSafeDeployed(data.safe_deployed ?? false);
      setApprovalsSet(data.approvals_set ?? false);
      setDerivedAddress(data.derived_address ?? null);
    } catch (err) {
      console.warn("[usePolymarketSession] refresh error:", err);
    }
  }, [walletAddress, getAccessToken]);

  useEffect(() => {
    if (isPrivyUser && walletAddress) {
      refreshSession();
    }
  }, [isPrivyUser, walletAddress, refreshSession]);

  // Full setup flow: SIWE signature → derive key → deploy Safe → approvals → CLOB creds
  const setupTradingWallet = useCallback(async (): Promise<{
    success: boolean;
    error?: string;
  }> => {
    if (!walletAddress) {
      return { success: false, error: "No wallet connected" };
    }

    setLoading(true);
    setError(null);

    try {
      // Step 1: Get Privy access token
      const token = await getAccessToken();
      if (!token) {
        throw new Error("Could not get access token");
      }

      // Step 2: Create deterministic SIWE message
      const timestamp = Date.now();
      const siweMessage = `${SIWE_MESSAGE_PREFIX}\n\nWallet: ${walletAddress}\nTimestamp: ${timestamp}\nChain: Polygon (137)`;

      // Step 3: Sign the message with user's Privy wallet
      // Using the Privy signMessage which works with embedded wallets
      const { signature } = await signMessage(
        { message: siweMessage },
        { address: walletAddress as `0x${string}` },
      );

      if (!signature) {
        throw new Error("Signature was empty");
      }

      // Step 4: Send to backend for full setup
      const { data, error: fnError } = await supabase.functions.invoke(
        "polymarket-user-setup",
        {
          body: {
            action: "derive_and_setup",
            wallet: walletAddress,
            signature,
            message: siweMessage,
            timestamp,
          },
          headers: { "x-privy-token": token },
        },
      );

      if (fnError) {
        throw new Error(fnError.message || "Setup failed");
      }

      if (!data?.success) {
        throw new Error(data?.error || "Setup returned failure");
      }

      // Update local state
      setHasSession(true);
      setStatus(data.status || "active");
      setCanTrade(data.can_trade ?? false);
      setSafeDeployed(data.safe_deployed ?? false);
      setApprovalsSet(data.approvals_set ?? false);
      setDerivedAddress(data.derived_address ?? null);

      return { success: true };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("[usePolymarketSession] setup error:", errMsg);
      setError(errMsg);
      return { success: false, error: errMsg };
    } finally {
      setLoading(false);
    }
  }, [walletAddress, getAccessToken, signMessage]);

  return {
    hasSession,
    status,
    canTrade,
    safeDeployed,
    approvalsSet,
    derivedAddress,
    loading,
    error,
    setupTradingWallet,
    refreshSession,
  };
}
