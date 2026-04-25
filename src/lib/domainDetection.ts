/**
 * Domain detection for multi-product routing.
 *
 * - 1mgaming.com (or localhost/preview) → flagship app
 * - 1mg.live / www.1mg.live → white-label platform (path-based operator routing)
 *
 * Path-based operator routing:
 *   1mg.live/demo       → operator app for "demo"
 *   1mg.live/yourname   → operator app for "yourname"
 *   1mg.live/            → platform landing page
 *
 * Dev overrides via query params:
 *   ?platform=true   → force platform landing
 *   ?operator=xyz    → force operator mode with slug "xyz"
 */

export type DomainContext =
  | { type: "flagship" }
  | { type: "platform" }
  | { type: "operator"; subdomain: string };

const PLATFORM_DOMAIN = "1mg.live";

/** Known platform routes that should NOT be treated as operator slugs */
const PLATFORM_ROUTES = new Set([
  "buy-predictions-app",
  "purchase",
  "onboarding",
  "dashboard",
  "demo",
  "help",
  "admin",
  "support",
  "terms-of-service",
  "privacy-policy",
  "terms",
  "privacy",
  "disclaimer",
  "acceptable-use",
  "predictions",
]);

export function detectDomain(): DomainContext {
  const hostname = window.location.hostname;
  const params = new URLSearchParams(window.location.search);
  const pathname = window.location.pathname;

  // Dev overrides
  if (params.get("platform") === "true") return { type: "platform" };
  const opOverride = params.get("operator");
  if (opOverride) return { type: "operator", subdomain: opOverride };

  // Permanent public demo route: keep it in the platform router even on preview/flagship hosts.
  if (pathname === "/demo") return { type: "platform" };

  // Platform domain: 1mg.live or www.1mg.live
  if (
    hostname === PLATFORM_DOMAIN ||
    hostname === `www.${PLATFORM_DOMAIN}`
  ) {
    return { type: "platform" };
  }

  // Everything else (1mgaming.com, localhost, preview) → flagship
  return { type: "flagship" };
}

/**
 * Builds a canonical operator app URL using path-based format.
 * e.g. "demo" → "https://1mg.live/demo"
 */
export function buildOperatorUrl(slug: string): string {
  return `https://1mg.live/${slug}`;
}

/**
 * Check if a first path segment should be treated as a potential operator slug.
 * Returns the slug if it looks like one, null otherwise.
 */
export function extractOperatorSlug(pathname: string): string | null {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return null;
  const first = segments[0].toLowerCase();
  if (PLATFORM_ROUTES.has(first)) return null;
  // Must be a simple alphanumeric slug (with hyphens allowed)
  if (!/^[a-z0-9][a-z0-9-]*$/.test(first)) return null;
  return first;
}
