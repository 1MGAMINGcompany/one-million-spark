// Platform/Operator app shell — shipped to 1mg.live and operator paths.
// IMPORTANT: This file MUST NOT statically import any Solana, game, audio,
// or flagship-only modules. Doing so will pull them into the platform bundle
// and undo the domain-level code split.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter } from "react-router-dom";
import { PrivyProviderWrapper } from "./components/PrivyProviderWrapper";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import type { DomainContext } from "@/lib/domainDetection";
import PlatformApp from "@/pages/platform/PlatformApp";

// DEV-ONLY: Import to auto-run config check on app load
import "./lib/devConfigCheck";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 1,
    },
  },
});

/**
 * Catches Supabase auth hash on "/" (errors OR successful magic-link tokens)
 * and forwards to the platform admin page so AdminAuth can pick up the session.
 *
 * Platform-only variant: always redirects to /admin (1mg.live admin path).
 */
function AuthHashRedirect({ children }: { children: React.ReactNode }) {
  const hash = typeof window !== "undefined" ? window.location.hash : "";
  const looksLikeAuthHash =
    hash &&
    (hash.includes("access_token=") ||
      hash.includes("error=") ||
      hash.includes("type=magiclink") ||
      hash.includes("type=recovery"));

  if (looksLikeAuthHash) {
    const adminPath = "/admin";
    if (!window.location.pathname.startsWith(adminPath)) {
      window.location.replace(`${adminPath}${hash}`);
      return null;
    }
  }
  return <>{children}</>;
}

interface AppPlatformProps {
  context: DomainContext;
}

export default function AppPlatform({ context }: AppPlatformProps) {
  return (
    <AppErrorBoundary>
      <PrivyProviderWrapper>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <AuthHashRedirect>
                <PlatformApp context={context} />
              </AuthHashRedirect>
            </BrowserRouter>
          </TooltipProvider>
        </QueryClientProvider>
      </PrivyProviderWrapper>
    </AppErrorBoundary>
  );
}
