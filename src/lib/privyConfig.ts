/**
 * Shared Privy configuration helpers.
 * Single source of truth for whether Privy is available.
 */

export const PRIVY_APP_ID: string | undefined = import.meta.env.VITE_PRIVY_APP_ID;

/** True when a valid Privy App ID is configured in the environment */
export const isPrivyConfigured: boolean = Boolean(PRIVY_APP_ID);
