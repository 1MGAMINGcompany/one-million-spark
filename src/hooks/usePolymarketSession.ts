/**
 * usePolymarketSession — Manages Polymarket auth state for the current user.
 *
 * Handles:
 * - Checking if user has an active PM trading session
 * - Triggering SIWE-based credential derivation
 * - Polling position/order updates for imported markets
 *
 * Credentials are NEVER exposed to the frontend.
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePrivy, useWallets } from "@privy-io/react-auth";

interface PolymarketSessionState {
  hasSession: boolean;
  status: string; // "none" | "active" | "awaiting_credentials" | "expired" | "revoked"
  canTrade: boolean;
  ctfAllowanceSet: boolean;
  derivedAddress: string | null;
  loading: boolean;
  error: string | null;
}

const POLL_INTERVAL_MS = 30_000; // 30s for session checks

export function usePolymarketSession() {
  const { ready, authenticated } = usePrivy();
  const { wallets } = useWallets();

  // Derive isPrivyUser and EOA wallet address unconditionally
  const isPrivyUser = ready && authenticated;

  // SIWE requires the EOA embedded wallet, not the smart wallet (contract can't sign)
  const walletAddress = useMemo(() => {
    const privy = wallets.find((w) => w.walletClientType === "privy");
    return privy?.address?.toLowerCase() ?? null;
  }, [wallets]);

  const [state, setState] = useState<PolymarketSessionState>({
    hasSession: false,
    status: "none",
    canTrade: false,
    ctfAllowanceSet: false,
    derivedAddress: null,
    loading: false,
    error: null,
  });

  const checkSession = useCallback(async () => {
    if (!walletAddress) return;

    try {
      const { data, error } = await supabase.functions.invoke("polymarket-auth", {
        body: { action: "check_session", wallet: walletAddress },
      });

      if (error) throw error;

      setState(prev => ({
        ...prev,
        hasSession: data.has_session,
        status: data.status,
        canTrade: data.can_trade,
        ctfAllowanceSet: data.ctf_allowance_set ?? false,
        derivedAddress: data.derived_address ?? null,
        error: null,
      }));
    } catch (err) {
      console.warn("[usePolymarketSession] check error:", err);
    }
  }, [walletAddress]);

  // Initial check + polling
  useEffect(() => {
    if (!isPrivyUser || !walletAddress) return;

    checkSession();
    const id = setInterval(checkSession, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isPrivyUser, walletAddress, checkSession]);

  /**
   * Derive Polymarket credentials via SIWE signature.
   * Call this when user wants to enable PM trading.
   */
  const deriveCredentials = useCallback(async (
    signMessage: (message: string) => Promise<string>,
  ) => {
    if (!walletAddress) return { success: false, error: "No wallet" };

    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const timestamp = Date.now();
      const message = [
        "Sign this message to enable Polymarket trading on 1MGAMING.",
        "",
        `Wallet: ${walletAddress}`,
        `Timestamp: ${timestamp}`,
        `Chain: Polygon`,
        "",
        "This signature will be used to derive your trading credentials.",
        "No funds will be moved by signing this message.",
      ].join("\n");

      const signature = await signMessage(message);

      const { data, error } = await supabase.functions.invoke("polymarket-auth", {
        body: {
          action: "derive_credentials",
          wallet: walletAddress,
          signature,
          message,
          timestamp,
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      setState(prev => ({
        ...prev,
        hasSession: true,
        status: data.status,
        canTrade: data.can_trade,
        derivedAddress: data.derived_address,
        loading: false,
        error: null,
      }));

      return { success: true, status: data.status, canTrade: data.can_trade };
    } catch (err: any) {
      setState(prev => ({ ...prev, loading: false, error: err.message }));
      return { success: false, error: err.message };
    }
  }, [walletAddress]);

  const revokeSession = useCallback(async () => {
    if (!walletAddress) return;

    await supabase.functions.invoke("polymarket-auth", {
      body: { action: "revoke_session", wallet: walletAddress },
    });

    setState({
      hasSession: false,
      status: "none",
      canTrade: false,
      ctfAllowanceSet: false,
      derivedAddress: null,
      loading: false,
      error: null,
    });
  }, [walletAddress]);

  return {
    ...state,
    deriveCredentials,
    revokeSession,
    refreshSession: checkSession,
  };
}
