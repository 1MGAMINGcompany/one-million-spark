import { Loader2, CheckCircle2, AlertTriangle, ShieldCheck, Wallet } from "lucide-react";
import type { ApprovalStep } from "@/hooks/useAllowanceGate";

const STEP_CONFIG: Record<ApprovalStep, { icon: React.ReactNode; label: string; className: string } | null> = {
  idle: null,
  checking_allowance: {
    icon: <Loader2 className="w-4 h-4 animate-spin" />,
    label: "Checking approval status…",
    className: "text-muted-foreground",
  },
  approval_required: {
    icon: <ShieldCheck className="w-4 h-4" />,
    label: "One-time USDC approval needed",
    className: "text-primary",
  },
  waiting_wallet: {
    icon: <Wallet className="w-4 h-4 animate-pulse" />,
    label: "Approve in your wallet…",
    className: "text-primary",
  },
  approval_submitted: {
    icon: <Loader2 className="w-4 h-4 animate-spin" />,
    label: "Approval sent — waiting for blockchain…",
    className: "text-primary",
  },
  waiting_confirmation: {
    icon: <Loader2 className="w-4 h-4 animate-spin" />,
    label: "Confirming on Polygon…",
    className: "text-primary",
  },
  approval_confirmed: {
    icon: <CheckCircle2 className="w-4 h-4" />,
    label: "Approval confirmed ✓",
    className: "text-green-400",
  },
  ready: null,
  error: null,
};

export default function ApprovalStepIndicator({
  step,
  errorReason,
}: {
  step: ApprovalStep;
  errorReason: string | null;
}) {
  if (step === "error" && errorReason) {
    return (
      <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">
        <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
        <p className="text-xs text-destructive">{errorReason}</p>
      </div>
    );
  }

  const config = STEP_CONFIG[step];
  if (!config) return null;

  return (
    <div className={`flex items-center gap-2 rounded-lg px-3 py-2 bg-secondary/40 ${config.className}`}>
      {config.icon}
      <span className="text-xs font-medium">{config.label}</span>
    </div>
  );
}
