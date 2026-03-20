/**
 * usePolymarketSession — Stub hook (shared backend keys model).
 *
 * Polymarket CLOB credentials are now stored as backend secrets,
 * so per-user session derivation is no longer needed.
 * This hook returns a static "ready" state for backward compatibility.
 */

export function usePolymarketSession() {
  return {
    hasSession: true,
    status: "active" as const,
    canTrade: true,
    ctfAllowanceSet: true,
    derivedAddress: null,
    loading: false,
    error: null,
    deriveCredentials: async () => ({ success: true as const }),
    revokeSession: async () => {},
    refreshSession: async () => {},
  };
}
