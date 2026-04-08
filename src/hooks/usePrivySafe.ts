/**
 * usePrivySafe — Safe wrapper around usePrivy() that returns safe defaults
 * when Privy is not configured (no App ID loaded).
 * Prevents crashes from missing PrivyProvider context.
 */
import { usePrivy } from "@privy-io/react-auth";
import { getPrivyAppId } from "@/lib/privyConfig";

interface PrivySafeState {
  ready: boolean;
  authenticated: boolean;
  user: any;
  logout: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
}

const NO_PRIVY: PrivySafeState = {
  ready: true,
  authenticated: false,
  user: null,
  logout: async () => {},
  getAccessToken: async () => null,
};

export function usePrivySafe(): PrivySafeState {
  const appId = getPrivyAppId();
  if (!appId) return NO_PRIVY;
  return usePrivySafeInner();
}

function usePrivySafeInner(): PrivySafeState {
  const { ready, authenticated, user, logout, getAccessToken } = usePrivy();
  return { ready, authenticated, user, logout, getAccessToken };
}
