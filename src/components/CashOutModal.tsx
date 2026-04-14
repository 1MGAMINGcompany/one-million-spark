import { useState } from "react";
import { useSendTransaction } from "@privy-io/react-auth";
import { encodeFunctionData, parseAbi } from "viem";
import { USDC_DECIMALS } from "@/lib/polygon-tokens";
import { useSwapUsdceToNative } from "@/hooks/useSwapUsdceToNative";
import { useRampOfframp } from "@/hooks/useRampOfframp";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowUpRight,
  Loader2,
  X,
  Copy,
  Check,
  RefreshCw,
  CheckCircle2,
  ExternalLink,
  Banknote,
  Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

/** Native USDC on Polygon — what exchanges expect */
const USDC_NATIVE = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" as const;

interface CashOutModalProps {
  open: boolean;
  onClose: () => void;
  balance: number | null;
  onSuccess: () => void;
}

interface TxResult {
  amount: number;
  dest: string;
  txHash: string;
}

type Step = "pick" | "form" | "confirm" | "success" | "ramp-amount";

export function CashOutModal({
  open,
  onClose,
  balance,
  onSuccess,
}: CashOutModalProps) {
  const { sendTransaction } = useSendTransaction();
  const { executeSwap, swapping } = useSwapUsdceToNative();
  const { startOfframp, launching: rampLaunching, isAvailable: rampAvailable } = useRampOfframp();
  const [dest, setDest] = useState("");
  const [amount, setAmount] = useState("");
  const [sending, setSending] = useState(false);
  const [step, setStep] = useState<Step>("pick");
  const [copied, setCopied] = useState(false);
  const [copiedTx, setCopiedTx] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [txResult, setTxResult] = useState<TxResult | null>(null);
  const [rampAmount, setRampAmount] = useState("");

  if (!open) return null;

  const isBusy = sending || swapping || rampLaunching;
  const parsedAmount = parseFloat(amount);
  const isValidAddress = /^0x[a-fA-F0-9]{40}$/.test(dest);
  const isValidAmount =
    !isNaN(parsedAmount) && parsedAmount >= 1 && (balance == null || parsedAmount <= balance);

  const parsedRampAmount = parseFloat(rampAmount);
  const isValidRampAmount =
    !isNaN(parsedRampAmount) && parsedRampAmount >= 5 && (balance == null || parsedRampAmount <= balance);

  const handleCopyAddress = async () => {
    if (!dest) return;
    await navigator.clipboard.writeText(dest);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyTxHash = async (hash: string) => {
    await navigator.clipboard.writeText(hash);
    setCopiedTx(true);
    setTimeout(() => setCopiedTx(false), 2000);
  };

  const handleClose = () => {
    if (isBusy) return;
    onClose();
    setStep("pick");
    setConfirmed(false);
    setTxResult(null);
    setRampAmount("");
  };

  const handleStartRamp = async () => {
    if (!isValidRampAmount) return;
    const ok = await startOfframp(parsedRampAmount);
    if (ok) {
      onSuccess();
      handleClose();
    }
  };

  const handleSend = async () => {
    if (!isValidAddress || !isValidAmount || !confirmed) return;
    setSending(true);
    try {
      // Step 1: Swap USDC.e → Native USDC
      setStatusMessage("Converting to native USDC…");
      const swapOk = await executeSwap(parsedAmount);
      if (!swapOk) {
        setSending(false);
        setStatusMessage("");
        return;
      }

      // Brief delay for swap to settle on-chain
      setStatusMessage("Sending to exchange…");
      await new Promise(r => setTimeout(r, 3000));

      // Step 2: Send Native USDC to destination
      const rawAmount = BigInt(Math.floor(parsedAmount * 10 ** USDC_DECIMALS));
      const data = encodeFunctionData({
        abi: parseAbi([
          "function transfer(address to, uint256 amount) returns (bool)",
        ]),
        functionName: "transfer",
        args: [dest as `0x${string}`, rawAmount],
      });

      let txReceipt: any;
      try {
        txReceipt = await sendTransaction(
          {
            to: USDC_NATIVE,
            chainId: 137,
            data,
          },
          {
            sponsor: true,
            uiOptions: {
              description: `Send $${parsedAmount.toFixed(2)} USDC to exchange`,
              buttonText: "Send",
            },
          },
        );
      } catch (sendErr: any) {
        console.error("Send failed after swap:", sendErr);
        if (
          sendErr?.message?.includes("User rejected") ||
          sendErr?.message?.includes("CLOSED_MODAL")
        ) {
          toast.info("Transaction cancelled. Your native USDC is still in your wallet.");
        } else {
          toast.error(
            "Transfer failed after conversion. Your native USDC is safe in your wallet — you can retry or send manually.",
            { duration: 8000 }
          );
        }
        setSending(false);
        setStatusMessage("");
        return;
      }

      const txHash =
        typeof txReceipt === "object" && txReceipt?.hash
          ? txReceipt.hash
          : String(txReceipt);

      // Show success screen
      setTxResult({
        amount: parsedAmount,
        dest,
        txHash: txHash || "",
      });
      setStep("success");
      onSuccess();
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
      setStatusMessage("");
    }
  };

  const title = (() => {
    if (step === "success") return "Transfer Complete";
    if (step === "ramp-amount") return "Cash Out";
    if (step === "form" || step === "confirm") return "Cash Out to Exchange";
    return "Cash Out";
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-card border border-border rounded-t-2xl sm:rounded-2xl p-5 space-y-4 animate-in slide-in-from-bottom-4 sm:slide-in-from-bottom-0 sm:fade-in duration-200">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-foreground">{title}</h2>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg hover:bg-muted/50 transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* ───── PICK METHOD ───── */}
        {step === "pick" && (
          <>
            {balance != null && (
              <div className="flex items-center justify-between bg-secondary/50 rounded-lg px-3 py-2">
                <span className="text-xs text-muted-foreground">Available balance</span>
                <span className="text-sm font-semibold text-foreground">${balance.toFixed(2)}</span>
              </div>
            )}

            <p className="text-sm text-muted-foreground">
              Choose how you'd like to cash out your balance.
            </p>

            <div className="space-y-3">
              {/* Fiat cash-out option */}
              <button
                onClick={() => {
                  if (rampAvailable) {
                    setRampAmount("");
                    setStep("ramp-amount");
                  }
                }}
                disabled={!rampAvailable}
                className={`w-full text-left border rounded-xl p-4 transition-colors ${
                  rampAvailable
                    ? "border-primary/40 bg-primary/5 hover:bg-primary/10 cursor-pointer"
                    : "border-border/50 bg-muted/20 opacity-60 cursor-not-allowed"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Banknote className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">Cash Out</p>
                      {!rampAvailable && (
                        <span className="text-[10px] font-medium bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                          Coming Soon
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {rampAvailable
                        ? "Sell USDC and receive cash to your bank account or card"
                        : "Direct-to-bank payouts — available soon"}
                    </p>
                  </div>
                </div>
              </button>

              {/* Exchange cash-out option */}
              <button
                onClick={() => {
                  setDest("");
                  setAmount("");
                  setConfirmed(false);
                  setStep("form");
                }}
                className="w-full text-left border border-border/50 rounded-xl p-4 hover:bg-muted/30 transition-colors cursor-pointer"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-secondary/50 flex items-center justify-center shrink-0">
                    <Building2 className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">Send to Exchange</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Send USDC to Coinbase, Binance, or any exchange wallet on Polygon
                    </p>
                  </div>
                </div>
              </button>
            </div>
          </>
        )}

        {/* ───── RAMP AMOUNT ───── */}
        {step === "ramp-amount" && (
          <>
            <p className="text-sm text-muted-foreground">
              Enter the amount you'd like to cash out. We'll convert your balance and open the payout flow.
            </p>

            {balance != null && (
              <div className="flex items-center justify-between bg-secondary/50 rounded-lg px-3 py-2">
                <span className="text-xs text-muted-foreground">Available balance</span>
                <span className="text-sm font-semibold text-foreground">${balance.toFixed(2)}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Amount (USD)
              </label>
              <Input
                type="number"
                value={rampAmount}
                onChange={(e) => setRampAmount(e.target.value)}
                placeholder="25.00"
                min="5"
                step="0.01"
                className="text-sm"
              />
              {rampAmount && parsedRampAmount < 5 && (
                <p className="text-xs text-destructive">Minimum $5.00</p>
              )}
              {rampAmount && balance != null && parsedRampAmount > balance && (
                <p className="text-xs text-destructive">Exceeds available balance</p>
              )}
              {balance != null && (
                <button
                  onClick={() => setRampAmount(balance.toFixed(2))}
                  className="text-xs text-primary hover:underline"
                >
                  Cash out max (${balance.toFixed(2)})
                </button>
              )}
            </div>

            <div className="bg-muted/30 border border-border/50 rounded-lg p-3 flex items-start gap-2">
              <RefreshCw className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">
                We'll automatically convert your balance before opening the payout provider. You'll choose your bank or card there.
              </p>
            </div>

            <div className="flex gap-3 pt-1">
              <Button variant="outline" onClick={() => setStep("pick")} className="flex-1">
                Back
              </Button>
              <Button
                onClick={handleStartRamp}
                disabled={!isValidRampAmount || isBusy}
                className="flex-1"
              >
                {isBusy ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    {swapping ? "Converting…" : "Opening…"}
                  </>
                ) : (
                  <>
                    <Banknote className="w-4 h-4 mr-1" />
                    Continue
                  </>
                )}
              </Button>
            </div>
          </>
        )}

        {/* ───── EXCHANGE FORM STEP ───── */}
        {step === "form" && (
          <>
            <p className="text-sm text-muted-foreground">
              To cash out right now, send your funds to your own exchange account using a deposit address you control.
            </p>

            {/* How it works */}
            <div className="bg-secondary/40 border border-border/40 rounded-xl p-3 space-y-2.5">
              <p className="text-xs font-semibold text-foreground">How it works</p>
              <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Copy your deposit address from your own exchange</li>
                <li>Paste it here</li>
                <li>We send your funds there</li>
                <li>You cash out from your exchange account</li>
              </ol>
            </div>

            {/* What is an exchange? */}
            <details className="group">
              <summary className="text-xs text-primary cursor-pointer hover:underline list-none flex items-center gap-1">
                <span className="group-open:rotate-90 transition-transform text-[10px]">▶</span>
                What is an exchange?
              </summary>
              <div className="mt-1.5 bg-muted/30 border border-border/40 rounded-lg p-2.5 space-y-1.5">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  An exchange is a crypto app or website where you can receive crypto and later convert it to cash in your bank account or other supported payout methods.
                </p>
                <p className="text-xs text-muted-foreground">
                  Examples include Coinbase, Binance, Kraken, Shakepay, and other exchanges available in your country.
                </p>
                <p className="text-[10px] text-muted-foreground/70">
                  Available exchanges and payout options depend on your country.
                </p>
              </div>
            </details>

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
                Exchange deposit address (Polygon)
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

            {/* Auto-convert info */}
            <div className="bg-muted/30 border border-border/50 rounded-lg p-3 flex items-start gap-2">
              <RefreshCw className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">
                We will convert your balance to <strong>native USDC</strong> on Polygon before sending — compatible with all major exchanges.
              </p>
            </div>

            {/* Network info */}
            <div className="bg-muted/30 border border-border/50 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">
                Make sure your exchange supports receiving <strong>USDC on Polygon</strong>. This transaction cannot be reversed.
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <Button
                variant="outline"
                onClick={() => setStep("pick")}
                className="flex-1"
              >
                Back
              </Button>
              <Button
                onClick={() => {
                  setConfirmed(false);
                  setStep("confirm");
                }}
                disabled={!isValidAddress || !isValidAmount}
                className="flex-1"
              >
                <ArrowUpRight className="w-4 h-4 mr-1" />
                Continue
              </Button>
            </div>
          </>
        )}

        {/* ───── CONFIRM STEP ───── */}
        {step === "confirm" && (
          <>
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                <p className="text-sm font-semibold text-foreground">
                  Confirm your transfer
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Make sure this is your exchange deposit address. This transaction{" "}
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
                  <span className="text-muted-foreground">Token</span>
                  <span className="font-medium text-foreground">Native USDC (auto-converted)</span>
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

            {/* Confirmation checkbox */}
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <Checkbox
                checked={confirmed}
                onCheckedChange={(v) => setConfirmed(v === true)}
                className="mt-0.5"
              />
              <span className="text-xs text-muted-foreground leading-relaxed">
                I confirm this is a <strong>Polygon USDC</strong> deposit address on my exchange. I understand this transaction cannot be reversed.
              </span>
            </label>

            {statusMessage && (
              <div className="flex items-center gap-2 text-sm text-primary">
                <Loader2 className="w-4 h-4 animate-spin" />
                {statusMessage}
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <Button
                variant="outline"
                onClick={() => setStep("form")}
                disabled={isBusy}
                className="flex-1"
              >
                Back
              </Button>
              <Button
                onClick={handleSend}
                disabled={isBusy || !confirmed}
                variant="gold"
                className="flex-1"
              >
                {isBusy ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    {swapping ? "Converting…" : "Sending…"}
                  </>
                ) : (
                  <>
                    <ArrowUpRight className="w-4 h-4 mr-1" />
                    Send to Exchange
                  </>
                )}
              </Button>
            </div>
          </>
        )}

        {/* ───── SUCCESS STEP ───── */}
        {step === "success" && txResult && (
          <>
            <div className="flex flex-col items-center gap-3 py-2">
              <div className="w-14 h-14 rounded-full bg-green-500/15 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-green-500" />
              </div>
              <p className="text-2xl font-bold text-foreground">
                ${txResult.amount.toFixed(2)} sent
              </p>
            </div>

            <div className="bg-secondary/50 rounded-lg p-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Token</span>
                <span className="font-medium text-foreground">Native USDC</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Network</span>
                <span className="font-medium text-foreground">Polygon</span>
              </div>
              <div>
                <span className="text-muted-foreground block mb-1">To</span>
                <span className="font-mono text-xs text-foreground break-all">
                  {txResult.dest}
                </span>
              </div>
              {txResult.txHash && (
                <div>
                  <span className="text-muted-foreground block mb-1">Transaction</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs text-foreground">
                      {txResult.txHash.slice(0, 10)}…{txResult.txHash.slice(-6)}
                    </span>
                    <button
                      onClick={() => handleCopyTxHash(txResult.txHash)}
                      className="p-0.5"
                    >
                      {copiedTx ? (
                        <Check className="w-3.5 h-3.5 text-green-500" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                      )}
                    </button>
                    <a
                      href={`https://polygonscan.com/tx/${txResult.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-0.5"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                    </a>
                  </div>
                </div>
              )}
            </div>

            <p className="text-xs text-center text-muted-foreground">
              Your exchange may take a few minutes to credit this deposit.
            </p>

            <Button onClick={handleClose} className="w-full">
              Done
            </Button>
          </>
        )}

        {step !== "success" && (
          <p className="text-[10px] text-center text-muted-foreground">
            Network fee: ~$0.001 (sponsored) · Swap fee: ~$0.01
          </p>
        )}
      </div>
    </div>
  );
}
