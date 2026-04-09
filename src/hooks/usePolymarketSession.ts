/**
 * usePolymarketSession — Per-user Polymarket trading wallet management.
 */
import { useState, useEffect, useCallback } from "react";
import { usePrivy, useSignMessage } from "@privy-io/react-auth";
import { usePrivyWallet } from "@/hooks/usePrivyWallet";
import { getPrivyAppId } from "@/lib/privyConfig";

interface PolymarketSessionState {
  hasSession: boolean;
  status: string;
  canTrade: boolean;
  safeDeployed: boolean;
  approvalsSet: boolean;
  derivedAddress: string | null;
  loading: boolean;
  error: string | null;
  setupTradingWallet: () => Promise<{ success: boolean; ready?: boolean; error?: string }>;
  refreshSession: () => Promise<{
    hasSession: boolean;
    status: string;
    canTrade: boolean;
    safeDeployed: boolean;
    approvalsSet: boolean;
    derivedAddress: string | null;
  } | null>;
}

const NOOP_SESSION: PolymarketSessionState = {
  hasSession: false,
  status: "not_configured",
  canTrade: false,
  safeDeployed: false,
  approvalsSet: false,
  derivedAddress: null,
  loading: false,
  error: null,
  setupTradingWallet: async () => ({ success: false, error: "Privy not configured" }),
  refreshSession: async () => null,
};

const SIWE_MESSAGE_PREFIX = "Sign to enable trading on 1mg.live";
const USER_SETUP_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/polymarket-user-setup`;

export function usePolymarketSession(): PolymarketSessionState {
  if (!getPrivyAppId()) return NOOP_SESSION;
  return usePolymarketSessionInner();
}

function usePolymarketSessionInner(): PolymarketSessionState {
  const { walletAddress, eoaAddress, isPrivyUser } = usePrivyWallet();
  const { getAccessToken } = usePrivy();
  const { signMessage } = useSignMessage();
  const [hasSession, setHasSession] = useState(false);
  const [status, setStatus] = useState("not_setup");
  const [canTrade, setCanTrade] = useState(false);
  const [safeDeployed, setSafeDeployed] = useState(false);
  const [approvalsSet, setApprovalsSet] = useState(false);
  const [derivedAddress, setDerivedAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshSession = useCallback(async () => {
    if (!walletAddress) return null;

    try {
      const token = await getAccessToken();
      if (!token) return null;

      const response = await fetch(USER_SETUP_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-privy-token": token,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          action: "check_status",
          wallet: walletAddress,
          app_wallet: walletAddress,
          eoa_wallet: eoaAddress ?? undefined,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.error) {
        const message = data?.error || "Could not check trading wallet status";
        setError(message);
        console.warn("[usePolymarketSession] check_status error:", message);
        return null;
      }

      const nextState = {
        hasSession: data.provisioned ?? false,
        status: data.status ?? "not_setup",
        canTrade: data.can_trade ?? false,
        safeDeployed: data.safe_deployed ?? false,
        approvalsSet: data.approvals_set ?? false,
        derivedAddress: data.derived_address ?? null,
      };

      setHasSession(nextState.hasSession);
      setStatus(nextState.status);
      setCanTrade(nextState.canTrade);
      setSafeDeployed(nextState.safeDeployed);
      setApprovalsSet(nextState.approvalsSet);
      setDerivedAddress(nextState.derivedAddress);
      setError(null);

      return nextState;
    } catch (err) {
      console.warn("[usePolymarketSession] refresh error:", err);
      return null;
    }
  }, [walletAddress, eoaAddress, getAccessToken]);

  useEffect(() => {
    if (isPrivyUser && walletAddress) {
      refreshSession();
    }
  }, [isPrivyUser, walletAddress, refreshSession]);

  const setupTradingWallet = useCallback(async (): Promise<{
    success: boolean;
    ready?: boolean;
    error?: string;
  }> => {
    if (!walletAddress) {
      return { success: false, error: "No wallet connected" };
    }

    setLoading(true);
    setError(null);

    try {
      const token = await getAccessToken();
      if (!token) {
        throw new Error("Could not get access token");
      }

      const signerAddress = eoaAddress ?? walletAddress;

      const siweMessage = `${SIWE_MESSAGE_PREFIX}\n\nPrimary Wallet: ${walletAddress}\nSigner Wallet: ${signerAddress}\nChain: Polygon (137)`;

      const result = await signMessage(
        { message: siweMessage },
        { address: signerAddress as `0x${string}` },
      );

      const signature = typeof result === "string" ? result : result?.signature;
      if (!signature) {
        throw new Error("Signature was empty or user rejected");
      }

      const response = await fetch(USER_SETUP_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-privy-token": token,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          action: "derive_and_setup",
          wallet: walletAddress,
          app_wallet: walletAddress,
          eoa_wallet: eoaAddress ?? undefined,
          signer_wallet: signerAddress,
          signature,
          message: siweMessage,
          timestamp,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.error) {
        throw new Error(data?.error || "Setup failed");
      }

      if (!data?.success) {
        throw new Error(data?.error || "Setup returned failure");
      }

      setHasSession(true);
      setStatus(data.status || "active");
      setCanTrade(data.can_trade ?? false);
      setSafeDeployed(data.safe_deployed ?? false);
      setApprovalsSet(data.approvals_set ?? false);
      setDerivedAddress(data.derived_address ?? null);
      setError(null);

      return { success: true, ready: Boolean(data.can_trade) };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("[usePolymarketSession] setup error:", errMsg);
      setError(errMsg);
      return { success: false, error: errMsg };
    } finally {
      setLoading(false);
    }
  }, [walletAddress, eoaAddress, getAccessToken, signMessage]);

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
