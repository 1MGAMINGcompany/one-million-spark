import { isPreviewDomain, isProductionDomain } from "@/lib/solana-utils";
import { AlertTriangle, ExternalLink } from "lucide-react";

/**
 * Banner shown on preview domains to prevent wallet signing
 * (Phantom blocks preview domains as potential scams)
 */
export function PreviewDomainBanner() {
  // Don't show on production domains
  if (isProductionDomain()) return null;
  
  // Only show on known preview domains
  if (!isPreviewDomain()) return null;

  return (
    <div className="fixed top-16 left-0 right-0 z-40 bg-amber-500/95 text-black px-4 py-2.5 text-center text-sm font-medium shadow-lg">
      <div className="flex items-center justify-center gap-2 flex-wrap">
        <AlertTriangle className="h-4 w-4" />
        <span>Preview mode – wallet signing disabled for security.</span>
        <a 
          href="https://1mgaming.com" 
          className="inline-flex items-center gap-1 underline font-semibold hover:no-underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          Open 1mgaming.com
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}

/**
 * Hook to check if signing should be disabled
 */
export function useSigningDisabled(): boolean {
  return isPreviewDomain() && !isProductionDomain();
}