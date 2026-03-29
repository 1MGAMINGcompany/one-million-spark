import { Routes, Route, Navigate } from "react-router-dom";
import { usePrivy } from "@privy-io/react-auth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { DomainContext } from "@/lib/domainDetection";
import LandingPage from "./LandingPage";
import OperatorOnboarding from "./OperatorOnboarding";
import OperatorDashboard from "./OperatorDashboard";
import OperatorApp from "./OperatorApp";
import PurchasePage from "./PurchasePage";
import BuyPredictionsApp from "./BuyPredictionsApp";
import HelpCenter from "@/pages/HelpCenter";
import HelpArticle from "@/pages/HelpArticle";

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
  const { ready, authenticated } = usePrivy();
  if (!ready) return null;
  if (!authenticated) return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** Requires Privy login AND operator.status === 'active' */
function RequireActiveOperator({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, getAccessToken } = usePrivy();

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
        .maybeSingle();
      return data?.status ?? null;
    },
    enabled: ready && authenticated,
    staleTime: 30_000,
  });

  if (!ready || isLoading) return null;
  if (!authenticated) return <Navigate to="/" replace />;
  if (operatorStatus !== "active") return <Navigate to="/buy-predictions-app" replace />;
  return <>{children}</>;
}

interface PlatformAppProps {
  context: DomainContext;
}

export default function PlatformApp({ context }: PlatformAppProps) {
  if (context.type === "operator") {
    return <OperatorApp subdomain={context.subdomain} />;
  }

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/buy-predictions-app" element={<BuyPredictionsApp />} />
      <Route path="/purchase" element={<RequireAuth><PurchasePage /></RequireAuth>} />
      <Route path="/onboarding" element={<RequireActiveOperator><OperatorOnboarding /></RequireActiveOperator>} />
      <Route path="/dashboard" element={<RequireActiveOperator><OperatorDashboard /></RequireActiveOperator>} />
      <Route path="/help" element={<HelpCenter />} />
      <Route path="/help/:slug" element={<HelpArticle />} />
      <Route path="/terms-of-service" element={<LandingPage />} />
      <Route path="/privacy-policy" element={<LandingPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
