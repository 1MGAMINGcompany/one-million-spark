import { Routes, Route } from "react-router-dom";
import type { DomainContext } from "@/lib/domainDetection";
import LandingPage from "./LandingPage";
import OperatorOnboarding from "./OperatorOnboarding";
import OperatorDashboard from "./OperatorDashboard";
import OperatorApp from "./OperatorApp";

interface PlatformAppProps {
  context: DomainContext;
}

export default function PlatformApp({ context }: PlatformAppProps) {
  // Operator subdomain → branded app
  if (context.type === "operator") {
    return <OperatorApp subdomain={context.subdomain} />;
  }

  // Platform landing + operator management routes
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/onboarding" element={<OperatorOnboarding />} />
      <Route path="/dashboard" element={<OperatorDashboard />} />
      <Route path="/terms-of-service" element={<LandingPage />} />
      <Route path="/privacy-policy" element={<LandingPage />} />
      <Route path="*" element={<LandingPage />} />
    </Routes>
  );
}
