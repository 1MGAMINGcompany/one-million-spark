/**
 * Ramp Network off-ramp configuration.
 *
 * The publishable API key is read from VITE_RAMP_API_KEY.
 * When absent the fiat cash-out button is hidden in the UI.
 */

export const RAMP_API_KEY = import.meta.env.VITE_RAMP_API_KEY as string | undefined;

/** Whether Ramp off-ramp is configured and available */
export const RAMP_ENABLED = !!RAMP_API_KEY;

/** Ramp asset symbol for Native USDC on Polygon */
export const RAMP_OFFRAMP_ASSET = "USDC_POLYGON";

/** App display name shown inside the Ramp widget */
export const RAMP_APP_NAME = "1MG";
