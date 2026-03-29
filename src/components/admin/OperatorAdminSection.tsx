import OperatorAdminPanel from "@/pages/platform/OperatorAdminPanel";
import { Card } from "@/components/ui/card";
import { Globe } from "lucide-react";

export default function OperatorAdminSection() {
  return (
    <Card className="bg-card border-border/50 p-4">
      <OperatorAdminPanel />
    </Card>
  );
}
