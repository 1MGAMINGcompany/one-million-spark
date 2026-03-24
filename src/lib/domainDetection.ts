/**
 * Domain detection for multi-product routing.
 *
 * - 1mgaming.com (or localhost/preview) → flagship app
 * - 1mg.live → white-label platform landing
 * - *.1mg.live → operator branded app
 *
 * Dev overrides via query params:
 *   ?platform=true   → force platform landing
 *   ?operator=xyz    → force operator mode with subdomain "xyz"
 */

export type DomainContext =
  | { type: "flagship" }
  | { type: "platform" }
  | { type: "operator"; subdomain: string };

const PLATFORM_DOMAIN = "1mg.live";

export function detectDomain(): DomainContext {
  const hostname = window.location.hostname;
  const params = new URLSearchParams(window.location.search);

  // Dev overrides
  if (params.get("platform") === "true") return { type: "platform" };
  const opOverride = params.get("operator");
  if (opOverride) return { type: "operator", subdomain: opOverride };

  // Exact match: 1mg.live or www.1mg.live
  if (hostname === PLATFORM_DOMAIN || hostname === `www.${PLATFORM_DOMAIN}`) {
    return { type: "platform" };
  }

  // Subdomain: *.1mg.live
  if (hostname.endsWith(`.${PLATFORM_DOMAIN}`)) {
    const subdomain = hostname.replace(`.${PLATFORM_DOMAIN}`, "");
    if (subdomain && subdomain !== "www") {
      return { type: "operator", subdomain };
    }
    return { type: "platform" };
  }

  // Everything else (1mgaming.com, localhost, preview) → flagship
  return { type: "flagship" };
}
