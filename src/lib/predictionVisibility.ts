/**
 * Shared visibility filter for prediction queries.
 *
 * Flagship / preview / localhost always shows ALL visibility tiers
 * so that imported events (which default to "platform") are never
 * accidentally hidden.
 */
export const PREDICTION_VISIBILITY_VALUES = ["flagship", "platform", "all"] as const;
