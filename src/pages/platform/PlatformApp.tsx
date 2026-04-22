import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { usePrivySafe } from "@/hooks/usePrivySafe";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { DomainContext } from "@/lib/domainDetection";
import { extractOperatorSlug } from "@/lib/domainDetection";
import LandingPage from "./LandingPage";
import OperatorOnboarding from "./OperatorOnboarding";
import OperatorDashboard from "./OperatorDashboard";
import OperatorApp from "./OperatorApp";
import PurchasePage from "./PurchasePage";
import OperatorPurchaseSuccess from "./OperatorPurchaseSuccess";
import BuyPredictionsApp from "./BuyPredictionsApp";
import AffiliateProgram from "./AffiliateProgram";
import HelpCenter from "@/pages/HelpCenter";
import HelpArticle from "@/pages/HelpArticle";
import PlatformAdmin from "./PlatformAdmin";
import PlatformTermsOfService from "./PlatformTermsOfService";
import PlatformPrivacyPolicy from "./PlatformPrivacyPolicy";
import Disclaimer from "./Disclaimer";
import AcceptableUse from "./AcceptableUse";
import TermsOfService from "@/pages/TermsOfService";
import PrivacyPolicy from "@/pages/PrivacyPolicy";

/** Extracts privy DID from JWT without remote verification */
function extractPrivyDid(token: string): string | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (payload.iss !== "privy.io") return null;
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { ready, authenticated } = usePrivySafe();
  if (!ready) return null;
  if (!authenticated) return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** Requires Privy login AND operator.status === 'active' */
function RequireActiveOperator({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, getAccessToken } = usePrivySafe();

  const { data: operatorStatus, isLoading } = useQuery({
    queryKey: ["my_operator_status"],
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) return null;
      const did = extractPrivyDid(token);
      if (!did) return null;
      const { data } = await (supabase as any)
        .from("operators")
        .select("status")
        .eq("user_id", did)
        .order("created_at", { ascending: false });
      return (data || []).some((op: { status?: string }) => op.status === "active") ? "active" : null;
    },
    enabled: ready && authenticated,
    staleTime: 30_000,
  });

  if (!ready || isLoading) return null;
  if (!authenticated) return <Navigate to="/" replace />;
  if (operatorStatus !== "active") return <Navigate to="/buy-predictions-app" replace />;
  return <>{children}</>;
}

/**
 * Handles path-based operator routing.
 * If the first path segment is a valid operator slug, renders OperatorApp.
 * Otherwise falls through to show a "not found" operator page.
 */
function OperatorSlugRoute() {
  const location = useLocation();
  const slug = extractOperatorSlug(location.pathname);

  if (!slug) {
    return <Navigate to="/" replace />;
  }

  return <OperatorApp subdomain={slug} />;
}

interface PlatformAppProps {
  context: DomainContext;
}

export default function PlatformApp({ context }: PlatformAppProps) {
  // Legacy: if somehow an operator context arrives (from old subdomain logic), use it
  if (context.type === "operator") {
    return <OperatorApp subdomain={context.subdomain} />;
  }

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/buy-predictions-app" element={<BuyPredictionsApp />} />
      <Route path="/affiliate" element={<AffiliateProgram />} />
      <Route path="/affiliates" element={<Navigate to="/affiliate" replace />} />
      <Route path="/purchase" element={<RequireAuth><PurchasePage /></RequireAuth>} />
      <Route path="/operator-purchase-success" element={<OperatorPurchaseSuccess />} />
      <Route path="/onboarding" element={<RequireActiveOperator><OperatorOnboarding /></RequireActiveOperator>} />
      <Route path="/dashboard" element={<RequireActiveOperator><OperatorDashboard /></RequireActiveOperator>} />
      <Route path="/help" element={<HelpCenter />} />
      <Route path="/help/:slug" element={<HelpArticle />} />
      <Route path="/admin" element={<PlatformAdmin />} />
      <Route path="/terms" element={<PlatformTermsOfService />} />
      <Route path="/privacy" element={<PlatformPrivacyPolicy />} />
      <Route path="/disclaimer" element={<Disclaimer />} />
      <Route path="/acceptable-use" element={<AcceptableUse />} />
      <Route path="/terms-of-service" element={<TermsOfService />} />
      <Route path="/privacy-policy" element={<PrivacyPolicy />} />
      {/* Catch-all: treat any unknown path as a potential operator slug */}
      <Route path="/:slug" element={<OperatorSlugRoute />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
