import { useState } from "react";
import { useSendTransaction } from "@privy-io/react-auth";
import { encodeFunctionData, parseAbi } from "viem";
import { USDC_E_CONTRACT, USDC_DECIMALS } from "@/lib/polygon-tokens";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowUpRight,
  Loader2,
  X,
  Copy,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface CashOutModalProps {
  open: boolean;
  onClose: () => void;
  balance: number | null;
  onSuccess: () => void;
}

export function CashOutModal({
  open,
  onClose,
  balance,
  onSuccess,
}: CashOutModalProps) {
  const { sendTransaction } = useSendTransaction();
  const [dest, setDest] = useState("");
  const [amount, setAmount] = useState("");
  const [sending, setSending] = useState(false);
  const [step, setStep] = useState<"form" | "confirm">("form");
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const parsedAmount = parseFloat(amount);
  const isValidAddress = /^0x[a-fA-F0-9]{40}$/.test(dest);
  const isValidAmount =
    !isNaN(parsedAmount) && parsedAmount >= 1 && (balance == null || parsedAmount <= balance);

  const handleCopyAddress = async () => {
    if (!dest) return;
    await navigator.clipboard.writeText(dest);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSend = async () => {
    if (!isValidAddress || !isValidAmount) return;
    setSending(true);
    try {
      const rawAmount = BigInt(Math.floor(parsedAmount * 10 ** USDC_DECIMALS));
      const data = encodeFunctionData({
        abi: parseAbi([
          "function transfer(address to, uint256 amount) returns (bool)",
        ]),
        functionName: "transfer",
        args: [dest as `0x${string}`, rawAmount],
      });
      const txReceipt = await sendTransaction({
        to: USDC_E_CONTRACT as `0x${string}`,
        chainId: 137,
        data,
      });
      const txHash =
        typeof txReceipt === "object" && txReceipt?.hash
          ? txReceipt.hash
          : String(txReceipt);
      const shortHash = txHash
        ? `${txHash.slice(0, 6)}…${txHash.slice(-4)}`
        : "";
      toast.success(
        `Sent $${parsedAmount.toFixed(2)} USDC${shortHash ? ` (${shortHash})` : ""}`,
        { duration: 6000 }
      );
      onSuccess();
      onClose();
      setDest("");
      setAmount("");
      setStep("form");
    } catch (e: any) {
      console.error("Cash out failed:", e);
      if (
        e?.message?.includes("User rejected") ||
        e?.message?.includes("CLOSED_MODAL")
      ) {
        toast.info("Transaction cancelled");
      } else {
        toast.error("Transfer failed. Please try again.");
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => {
          if (!sending) {
            onClose();
            setStep("form");
          }
        }}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-card border border-border rounded-t-2xl sm:rounded-2xl p-5 space-y-4 animate-in slide-in-from-bottom-4 sm:slide-in-from-bottom-0 sm:fade-in duration-200">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-foreground">Cash Out</h2>
          <button
            onClick={() => {
              if (!sending) {
                onClose();
                setStep("form");
              }
            }}
            className="p-1.5 rounded-lg hover:bg-muted/50 transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {step === "form" && (
          <>
            <p className="text-sm text-muted-foreground">
              Send your USDC to Coinbase to withdraw to your bank.
            </p>

            {/* Balance */}
            {balance != null && (
              <div className="flex items-center justify-between bg-secondary/50 rounded-lg px-3 py-2">
                <span className="text-xs text-muted-foreground">
                  Available balance
                </span>
                <span className="text-sm font-semibold text-foreground">
                  ${balance.toFixed(2)}
                </span>
              </div>
            )}

            {/* Destination */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Coinbase wallet address
              </label>
              <div className="relative">
                <Input
                  value={dest}
                  onChange={(e) => setDest(e.target.value.trim())}
                  placeholder="0x..."
                  className="font-mono text-sm pr-10"
                />
                {dest && (
                  <button
                    onClick={handleCopyAddress}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1"
                  >
                    {copied ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>
                )}
              </div>
              {dest && !isValidAddress && (
                <p className="text-xs text-destructive">
                  Enter a valid Polygon wallet address
                </p>
              )}
            </div>

            {/* Amount */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Amount (USD)
              </label>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="10.00"
                min="1"
                step="0.01"
                className="text-sm"
              />
              {amount && parsedAmount < 1 && (
                <p className="text-xs text-destructive">Minimum $1.00</p>
              )}
              {amount &&
                balance != null &&
                parsedAmount > balance && (
                  <p className="text-xs text-destructive">
                    Exceeds available balance
                  </p>
                )}
              {balance != null && (
                <button
                  onClick={() => setAmount(balance.toFixed(2))}
                  className="text-xs text-primary hover:underline"
                >
                  Send max (${balance.toFixed(2)})
                </button>
              )}
            </div>

            {/* Network info */}
            <div className="bg-muted/30 border border-border/50 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">
                Funds are sent on the <strong>Polygon</strong> network. Make
                sure your Coinbase account supports receiving USDC on Polygon.
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <Button
                variant="outline"
                onClick={() => {
                  onClose();
                  setStep("form");
                }}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={() => setStep("confirm")}
                disabled={!isValidAddress || !isValidAmount}
                className="flex-1"
              >
                <ArrowUpRight className="w-4 h-4 mr-1" />
                Continue
              </Button>
            </div>
          </>
        )}

        {step === "confirm" && (
          <>
            {/* Confirmation step */}
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                <p className="text-sm font-semibold text-foreground">
                  Confirm your transfer
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Make sure this is your Coinbase address. This transaction{" "}
                <strong>cannot be reversed</strong>.
              </p>
            </div>

            <div className="space-y-3">
              <div className="bg-secondary/50 rounded-lg p-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Sending</span>
                  <span className="font-semibold text-foreground">
                    ${parsedAmount.toFixed(2)} USDC
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Network</span>
                  <span className="font-medium text-foreground">Polygon</span>
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground block mb-1">To</span>
                  <span className="font-mono text-xs text-foreground break-all">
                    {dest}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <Button
                variant="outline"
                onClick={() => setStep("form")}
                disabled={sending}
                className="flex-1"
              >
                Back
              </Button>
              <Button
                onClick={handleSend}
                disabled={sending}
                variant="gold"
                className="flex-1"
              >
                {sending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    Sending…
                  </>
                ) : (
                  <>
                    <ArrowUpRight className="w-4 h-4 mr-1" />
                    Send to Coinbase
                  </>
                )}
              </Button>
            </div>
          </>
        )}

        <p className="text-[10px] text-center text-muted-foreground">
          Network fee: ~$0.001 (sponsored)
        </p>
      </div>
    </div>
  );
}
