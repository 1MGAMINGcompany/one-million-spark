/**
 * Build version for cache busting and debugging.
 * This is automatically updated on each build.
 */
export const BUILD_VERSION = `build-${Date.now()}`;
export const BUILD_TIMESTAMP = new Date().toISOString();

// Log build version on app start
console.log(`[1MGAMING] Build: ${BUILD_VERSION} | ${BUILD_TIMESTAMP}`);
