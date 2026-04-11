/**
 * usePolymarketSession — Per-user Polymarket trading wallet management.
 *
 * V2: After server-side setup returns a trading key, the browser derives
 * CLOB API credentials directly from Polymarket (bypassing geo-blocking).
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
const SAVE_CREDS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/polymarket-save-credentials`;

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

      // Proactive browser credential derivation when session has trading key but no API keys
      if (nextState.status === "awaiting_browser_credentials" && data.trading_key) {
        console.log("[usePolymarketSession] Proactively deriving credentials from browser...");
        try {
          const { deriveClobCredentials } = await import("@/lib/clobCredentialClient");
          const derivedResult = await deriveClobCredentials(data.trading_key as `0x${string}`);
          if (derivedResult.credentials) {
            const saveResp = await fetch(SAVE_CREDS_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-privy-token": token, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
              body: JSON.stringify({ wallet: walletAddress, api_key: derivedResult.credentials.apiKey, api_secret: derivedResult.credentials.apiSecret, passphrase: derivedResult.credentials.passphrase }),
            });
            const saveData = await saveResp.json().catch(() => ({}));
            if (saveResp.ok && saveData?.success) {
              // Re-check session to confirm backend now reports active
              const verifyResp = await fetch(USER_SETUP_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-privy-token": token, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
                body: JSON.stringify({ action: "check_status", wallet: walletAddress, app_wallet: walletAddress, eoa_wallet: eoaAddress ?? undefined }),
              });
              const verifyData = await verifyResp.json().catch(() => ({}));
              if (verifyData?.can_trade) {
                nextState.status = "active";
                nextState.canTrade = true;
                console.log("[usePolymarketSession] Proactive credential derivation succeeded and verified");
              } else {
                console.warn("[usePolymarketSession] Credentials saved but backend still not trade-ready:", verifyData?.status);
                nextState.canTrade = false;
              }
            } else {
              console.warn("[usePolymarketSession] Save credentials failed:", saveData?.error);
              nextState.canTrade = false;
            }
          } else {
            console.warn("[usePolymarketSession] Browser credential derivation returned no credentials:", derivedResult.error);
            nextState.canTrade = false;
          }
        } catch (err) {
          console.warn("[usePolymarketSession] Proactive credential derivation failed:", err);
          nextState.canTrade = false;
        }
      }

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

  /**
   * Browser-side CLOB credential derivation.
   * Called after server setup returns a trading key.
   */
  const deriveBrowserCredentials = useCallback(async (
    tradingKey: string,
    token: string,
  ): Promise<boolean> => {
    try {
      console.log("[usePolymarketSession] Deriving CLOB credentials from browser...");
      const { deriveClobCredentials } = await import("@/lib/clobCredentialClient");
      const result = await deriveClobCredentials(tradingKey as `0x${string}`);

      if (!result.credentials) {
        console.error("[usePolymarketSession] Browser credential derivation failed:", result.error);
        setError(result.error || "Credential derivation failed");
        return false;
      }

      // Save credentials to backend
      const saveResp = await fetch(SAVE_CREDS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-privy-token": token,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          wallet: walletAddress,
          api_key: result.credentials.apiKey,
          api_secret: result.credentials.apiSecret,
          passphrase: result.credentials.passphrase,
        }),
      });

      const saveData = await saveResp.json().catch(() => ({}));
      if (!saveResp.ok || saveData?.error) {
        console.error("[usePolymarketSession] Save credentials failed:", saveData?.error);
        setError(saveData?.error || "Failed to save credentials");
        return false;
      }

      console.log("[usePolymarketSession] Browser credentials saved successfully");
      setStatus("active");
      setCanTrade(true);
      setError(null);
      return true;
    } catch (err) {
      console.error("[usePolymarketSession] Browser credential derivation error:", err);
      setError(err instanceof Error ? err.message : String(err));
      return false;
    }
  }, [walletAddress]);

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
      setDerivedAddress(data.derived_address ?? null);
      setSafeDeployed(data.safe_deployed ?? false);
      setApprovalsSet(data.approvals_set ?? false);

      // If server returns trading_key and requires browser credentials, derive them now
      if (data.requires_browser_credentials && data.trading_key) {
        const credSuccess = await deriveBrowserCredentials(data.trading_key, token);
        if (!credSuccess) {
          setStatus("awaiting_browser_credentials");
          setCanTrade(false);
          return { success: true, ready: false, error: "Credential derivation failed — retry later" };
        }
        return { success: true, ready: true };
      }

      // Legacy path: server already derived credentials
      setStatus(data.status || "active");
      setCanTrade(data.can_trade ?? false);
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
  }, [walletAddress, eoaAddress, getAccessToken, signMessage, deriveBrowserCredentials]);

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
