import { Routes, Route, Navigate } from "react-router-dom";
import { usePrivy } from "@privy-io/react-auth";
import type { DomainContext } from "@/lib/domainDetection";
import LandingPage from "./LandingPage";
import OperatorOnboarding from "./OperatorOnboarding";
import OperatorDashboard from "./OperatorDashboard";
import OperatorApp from "./OperatorApp";
import PurchasePage from "./PurchasePage";
import HelpCenter from "@/pages/HelpCenter";
import HelpArticle from "@/pages/HelpArticle";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { ready, authenticated } = usePrivy();
  if (!ready) return null;
  if (!authenticated) return <Navigate to="/" replace />;
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
      <Route path="/purchase" element={<RequireAuth><PurchasePage /></RequireAuth>} />
      <Route path="/onboarding" element={<RequireAuth><OperatorOnboarding /></RequireAuth>} />
      <Route path="/dashboard" element={<RequireAuth><OperatorDashboard /></RequireAuth>} />
      <Route path="/help" element={<HelpCenter />} />
      <Route path="/help/:slug" element={<HelpArticle />} />
      <Route path="/terms-of-service" element={<LandingPage />} />
      <Route path="/privacy-policy" element={<LandingPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
