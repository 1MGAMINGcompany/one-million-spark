import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, CheckCircle } from "lucide-react";

interface SuccessState {
  txHash?: string | null;
  amount?: number;
}

export default function OperatorPurchaseSuccess() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state as SuccessState | null) || {};

  // Fall back to query string if state was lost (e.g. refresh)
  const params = new URLSearchParams(location.search);
  const txHash = state.txHash ?? params.get("tx") ?? null;
  const promoCode = params.get("promo");
  const amountStr = params.get("amount");
  const amount =
    typeof state.amount === "number"
      ? state.amount
      : amountStr
      ? Number(amountStr)
      : 2400;
  const isFreeActivation = amount === 0 || promoCode?.toUpperCase() === "BESTRONG";

  // Fire GoAffPro conversion — best-effort, never blocks UI
  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      if (!/^(www\.)?1mg\.live$/i.test(window.location.hostname)) return;

      const w = window as any;
      const orderNumber = txHash || `purchase_${Date.now()}`;
      const orderTotal = typeof amount === "number" ? amount : 2400;

      w.goaffpro_order = {
        number: orderNumber,
        total: orderTotal,
      };

      // GoAffPro auto-detects window.goaffpro_order on script load.
      // If loader has already initialized, manually trigger conversion fire.
      if (typeof w.goaffpro === "object" && typeof w.goaffpro.conversion === "function") {
        w.goaffpro.conversion(w.goaffpro_order);
      }
    } catch (e) {
      console.warn("[GoAffPro] conversion fire failed (non-blocking)", e);
    }
  }, [txHash, amount]);

  return (
    <div className="min-h-screen bg-[#06080f] text-white flex items-center justify-center px-4">
      <div className="max-w-md text-center">
        <CheckCircle size={64} className="text-green-400 mx-auto mb-6" />
        <h1 className="text-3xl font-bold mb-3">You're In!</h1>
        <p className="text-white/50 mb-8">
          {isFreeActivation
            ? "Access activated. Your free operator app access is ready. Let’s set up your branded predictions app."
            : "Payment confirmed. Let's set up your branded predictions app."}
        </p>
        <Button
          onClick={() => navigate("/onboarding")}
          size="lg"
          className="bg-blue-600 hover:bg-blue-500 text-white border-0"
        >
          Start Setup <ArrowRight size={18} />
        </Button>
        {txHash && (
          <p className="text-[11px] text-white/20 text-center mt-6 font-mono break-all">
            TX: {txHash}
          </p>
        )}
      </div>
    </div>
  );
}
