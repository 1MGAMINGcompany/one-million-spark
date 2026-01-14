/**
 * Sync Health Hook
 * 
 * Tracks connection health across WebRTC, Realtime, and Polling.
 * Provides a unified "connected enough" status that doesn't block gameplay.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { isWalletInAppBrowser } from "@/lib/walletBrowserDetection";

export interface SyncHealthState {
  /** Overall sync is healthy (any transport working) */
  isHealthy: boolean;
  /** In a wallet in-app browser (WebRTC disabled) */
  inWalletBrowser: boolean;
  /** Supabase Realtime channel status */
  realtimeStatus: "connecting" | "subscribed" | "closed" | "error";
  /** Polling fallback is active */
  pollingActive: boolean;
  /** Time since last successful poll (ms) */
  lastPollAgoMs: number;
  /** Time since any message received (ms) */
  lastMessageAgoMs: number;
  /** Debug string for logging */
  debugString: string;
}

interface UseSyncHealthOptions {
  realtimeConnected: boolean;
  enabled?: boolean;
}

export function useSyncHealth({
  realtimeConnected,
  enabled = true,
}: UseSyncHealthOptions) {
  const inWalletBrowser = isWalletInAppBrowser();
  const [pollingActive, setPollingActive] = useState(false);
  const [lastPollTime, setLastPollTime] = useState(0);
  const [lastMessageTime, setLastMessageTime] = useState(Date.now());
  const [now, setNow] = useState(Date.now());

  // Update "now" every second for relative time calculations
  useEffect(() => {
    if (!enabled) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [enabled]);

  // Mark polling as active
  const markPollSuccess = useCallback(() => {
    const timestamp = Date.now();
    setPollingActive(true);
    setLastPollTime(timestamp);
    setLastMessageTime(timestamp);
  }, []);

  // Mark any message received
  const markMessageReceived = useCallback(() => {
    setLastMessageTime(Date.now());
  }, []);

  // Calculate health state
  const realtimeStatus: SyncHealthState["realtimeStatus"] = realtimeConnected
    ? "subscribed"
    : "connecting";

  const lastPollAgoMs = lastPollTime > 0 ? now - lastPollTime : Infinity;
  const lastMessageAgoMs = now - lastMessageTime;

  // Consider "healthy" if:
  // 1. Realtime is subscribed, OR
  // 2. Polling has succeeded in the last 5 seconds
  const isHealthy =
    realtimeConnected || (pollingActive && lastPollAgoMs < 5000);

  // Debug log
  const debugString = `[SyncHealth] { inWalletBrowser: ${inWalletBrowser}, realtimeStatus: "${realtimeStatus}", pollingActive: ${pollingActive}, lastPollAgoMs: ${lastPollAgoMs}, lastMessageAgoMs: ${lastMessageAgoMs} }`;

  // Log on mount and significant changes
  useEffect(() => {
    if (enabled) {
      console.log(debugString);
    }
  }, [enabled, isHealthy, realtimeStatus, pollingActive]);

  return {
    isHealthy,
    inWalletBrowser,
    realtimeStatus,
    pollingActive,
    lastPollAgoMs,
    lastMessageAgoMs,
    debugString,
    markPollSuccess,
    markMessageReceived,
  };
}
