import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { usePrivy, useSendTransaction } from "@privy-io/react-auth";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { usePolygonUSDC } from "@/hooks/usePolygonUSDC";
import {
  ArrowRight,
  CheckCircle,
  Loader2,
  AlertCircle,
  Shield,
  Fuel,
  Headphones,
  DollarSign,
  Wallet,
} from "lucide-react";

const TREASURY_ADDRESS = "0x72F3AA1B3B0815033AD6037edC1586dE592Ed88d";
const USDC_CONTRACT = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
const PURCHASE_AMOUNT = 2400;
const PURCHASE_AMOUNT_RAW = "0x" + (BigInt(PURCHASE_AMOUNT) * BigInt(10 ** 6)).toString(16); // 2400 USDC

// ERC-20 transfer(address,uint256) function selector
const TRANSFER_SELECTOR = "0xa9059cbb";

function encodeTransferData(to: string, amountHex: string): string {
  const paddedTo = to.slice(2).toLowerCase().padStart(64, "0");
  const paddedAmount = amountHex.slice(2).padStart(64, "0");
  return TRANSFER_SELECTOR + paddedTo + paddedAmount;
}

type Step = "disclosure" | "payment" | "confirming" | "success" | "error";

export default function PurchasePage() {
  const navigate = useNavigate();
  const { getAccessToken } = usePrivy();
  const { sendTransaction } = useSendTransaction();
  const { usdc_balance, usdc_balance_formatted, is_loading: balanceLoading, wallet_address } = usePolygonUSDC();

  const [step, setStep] = useState<Step>("disclosure");
  const [agreedFee, setAgreedFee] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const hasEnoughBalance = usdc_balance !== null && usdc_balance >= PURCHASE_AMOUNT;

  const handlePayment = useCallback(async () => {
    setError(null);
    setStep("payment");

    try {
      const data = encodeTransferData(TREASURY_ADDRESS, PURCHASE_AMOUNT_RAW);

      const txReceipt = await sendTransaction({
        to: USDC_CONTRACT,
        data,
        chainId: 137,
      } as any);

      const hash = (txReceipt as any)?.transactionHash || (txReceipt as any)?.hash;
      if (!hash) throw new Error("Transaction submitted but no hash returned");

      setTxHash(hash);
      setStep("confirming");
      setConfirming(true);

      // Verify on backend
      const token = await getAccessToken();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/operator-manage`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-privy-token": token || "",
          },
          body: JSON.stringify({
            action: "confirm_purchase",
            tx_hash: hash,
          }),
        }
      );
      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || "Verification failed");
      }

      setStep("success");
    } catch (e: any) {
      console.error("[PurchasePage] Error:", e);
      setError(e?.message || "Transaction failed");
      setStep("error");
    } finally {
      setConfirming(false);
    }
  }, [sendTransaction, getAccessToken]);

  if (step === "success") {
    return (
      <div className="min-h-screen bg-[#06080f] text-white flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <CheckCircle size={64} className="text-green-400 mx-auto mb-6" />
          <h1 className="text-3xl font-bold mb-3">You're In!</h1>
          <p className="text-white/50 mb-8">
            Payment confirmed. Let's set up your branded predictions app.
          </p>
          <Button
            onClick={() => navigate("/onboarding")}
            size="lg"
            className="bg-blue-600 hover:bg-blue-500 text-white border-0"
          >
            Start Setup <ArrowRight size={18} />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#06080f] text-white flex items-center justify-center px-4 py-20">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-xl font-bold tracking-tight mb-2">
            <span className="text-blue-400">1MG</span>
            <span className="text-white/60">.live</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold">Platform Access</h1>
        </div>

        {/* Purchase Card */}
        <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6 sm:p-8">
          {/* Price */}
          <div className="text-center mb-6 pb-6 border-b border-white/5">
            <div className="text-4xl font-bold text-white mb-1">$2,400</div>
            <div className="text-white/40 text-sm">USDC on Polygon • One-time payment</div>
          </div>

          {/* What's included */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-3">What's Included</h3>
            <div className="space-y-3">
              {[
                { icon: Shield, text: "Complete backend infrastructure" },
                { icon: Fuel, text: "All gas fees covered" },
                { icon: Headphones, text: "24/7 support" },
                { icon: DollarSign, text: "Built-in liquidity & money flow" },
              ].map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center gap-3 text-sm text-white/60">
                  <Icon size={16} className="text-blue-400 shrink-0" />
                  <span>{text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Fee Disclosure */}
          <div className="bg-blue-500/5 border border-blue-500/10 rounded-xl p-4 mb-6">
            <h4 className="text-sm font-semibold text-blue-300 mb-2">Platform Fee: 1% per prediction</h4>
            <p className="text-xs text-white/40 leading-relaxed">
              We charge a 1% platform fee on every prediction to cover transaction fees (gas),
              24/7 support, backend infrastructure, and sports money flow management.
              Your custom operator fee is added on top.
            </p>
          </div>

          {/* Agreement Checkbox */}
          <div className="flex items-start gap-3 mb-6">
            <Checkbox
              id="agree-fee"
              checked={agreedFee}
              onCheckedChange={(v) => setAgreedFee(v === true)}
              className="mt-0.5 border-white/20 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
            />
            <label htmlFor="agree-fee" className="text-sm text-white/50 cursor-pointer leading-relaxed">
              I understand the 1% platform fee on all predictions and agree to the terms.
            </label>
          </div>

          {/* Balance */}
          <div className="bg-white/[0.02] rounded-xl p-4 mb-6 border border-white/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-white/50">
                <Wallet size={16} />
                <span>USDC Balance (Polygon)</span>
              </div>
              <div className={`text-sm font-mono font-semibold ${hasEnoughBalance ? "text-green-400" : "text-red-400"}`}>
                {balanceLoading ? "..." : usdc_balance_formatted ? `$${usdc_balance_formatted}` : "$0.00"}
              </div>
            </div>
            {!balanceLoading && !hasEnoughBalance && usdc_balance !== null && (
              <p className="text-xs text-red-400/70 mt-2">
                Insufficient balance. You need ${PURCHASE_AMOUNT} USDC on Polygon.
              </p>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-6">
              <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          {/* CTA */}
          <Button
            onClick={handlePayment}
            disabled={!agreedFee || !hasEnoughBalance || confirming || step === "confirming"}
            size="lg"
            className="w-full bg-blue-600 hover:bg-blue-500 text-white border-0 h-14 text-lg"
          >
            {step === "confirming" ? (
              <>
                <Loader2 size={20} className="animate-spin" /> Confirming on-chain...
              </>
            ) : step === "payment" ? (
              <>
                <Loader2 size={20} className="animate-spin" /> Sending transaction...
              </>
            ) : (
              <>
                Confirm Purchase — ${PURCHASE_AMOUNT} USDC <ArrowRight size={18} />
              </>
            )}
          </Button>

          {txHash && (
            <p className="text-xs text-white/20 text-center mt-3 font-mono break-all">
              TX: {txHash}
            </p>
          )}
        </div>

        {/* Back link */}
        <div className="text-center mt-6">
          <button onClick={() => navigate("/")} className="text-sm text-white/30 hover:text-white/50 transition-colors">
            ← Back to home
          </button>
        </div>
      </div>
    </div>
  );
}
