/**
 * Shared Privy configuration helpers.
 * Fetches the Privy App ID from the backend at runtime.
 */

import { supabase } from "@/integrations/supabase/client";

let _cachedAppId: string | null = null;
let _fetchPromise: Promise<string | null> | null = null;
let _fetched = false;

/** Fetch Privy App ID from edge function (cached, single-flight) */
export function fetchPrivyAppId(): Promise<string | null> {
  // Return from env if available (local dev)
  const envId = import.meta.env.VITE_PRIVY_APP_ID;
  if (envId) {
    _cachedAppId = envId;
    _fetched = true;
    return Promise.resolve(envId);
  }

  if (_fetched) return Promise.resolve(_cachedAppId);
  if (_fetchPromise) return _fetchPromise;

  _fetchPromise = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke("get-privy-config");
      if (error) {
        console.warn("[privyConfig] Failed to fetch config:", error);
        _fetched = true;
        return null;
      }
      const appId = data?.appId ?? null;
      _cachedAppId = appId;
      _fetched = true;
      console.info(`[Privy] Loaded appId=${appId ? "set" : "missing"} from backend`);
      return appId;
    } catch (err) {
      console.warn("[privyConfig] Fetch error:", err);
      _fetched = true;
      return null;
    }
  })();

  return _fetchPromise;
}

/** Synchronous read of cached App ID (null if not yet fetched or unavailable) */
export function getPrivyAppId(): string | null {
  return _cachedAppId;
}

/** True when a valid Privy App ID has been loaded */
export function isPrivyReady(): boolean {
  return _fetched && _cachedAppId != null;
}

// Legacy compat — reactive check based on cached value
export const PRIVY_APP_ID: string | undefined = undefined;
/** @deprecated Use getPrivyAppId() !== null instead */
export function isPrivyConfigured(): boolean {
  return _cachedAppId != null;
}
