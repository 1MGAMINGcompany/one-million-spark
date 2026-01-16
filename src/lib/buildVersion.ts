/**
 * Build version for cache busting and debugging.
 * This is automatically updated on each build.
 * Format: vYYYYMMDD.HHMM.bN for easy comparison
 */

// Increment this to force a rebuild when needed
const MANUAL_BUMP = 1;

const buildDate = new Date();
const pad = (n: number) => n.toString().padStart(2, '0');
export const BUILD_VERSION = `v${buildDate.getFullYear()}${pad(buildDate.getMonth() + 1)}${pad(buildDate.getDate())}.${pad(buildDate.getHours())}${pad(buildDate.getMinutes())}.b${MANUAL_BUMP}`;
export const BUILD_TIMESTAMP = buildDate.toISOString();

// Log build version on app start
console.log(`[1MGAMING] Build: ${BUILD_VERSION} | ${BUILD_TIMESTAMP}`);
