import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import bs58 from "bs58";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface RecoverFundsButtonProps {
  roomPda: string;
  onRecovered?: () => void;
  className?: string;
}

type RecoveryStatus = 
  | "idle" 
  | "checking" 
  | "can_cancel" 
  | "force_settling"
  | "already_resolved" 
  | "game_active" 
  | "not_authorized"
  | "error";

interface RecoveryResult {
  status: string;
  message: string;
  unsignedTx?: string;
  stakeAmount?: string;
  signature?: string;
  hoursSinceActivity?: number;
  hoursRemaining?: number;
}

export function RecoverFundsButton({ roomPda, onRecovered, className }: RecoverFundsButtonProps) {
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const [status, setStatus] = useState<RecoveryStatus>("idle");
  const [result, setResult] = useState<RecoveryResult | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingTx, setPendingTx] = useState<string | null>(null);

  const checkRecovery = async () => {
    if (!publicKey) {
      toast.error("Please connect your wallet");
      return;
    }

    setStatus("checking");
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke("recover-funds", {
        body: {
          roomPda,
          callerWallet: publicKey.toBase58(),
        },
      });

      if (error) throw error;

      setResult(data);

      switch (data.status) {
        case "can_cancel":
          setPendingTx(data.unsignedTx);
          setShowConfirmDialog(true);
          setStatus("can_cancel");
          break;
        case "force_settled":
          toast.success("Game force-settled! Funds returned to creator.");
          setStatus("idle");
          onRecovered?.();
          break;
        case "already_resolved":
          toast.info(data.message);
          setStatus("already_resolved");
          break;
        case "game_active":
          toast.info(`Game still active. ${data.hoursRemaining?.toFixed(1)}h until recovery available.`);
          setStatus("game_active");
          break;
        case "not_authorized":
        case "no_action":
          toast.warning(data.message);
          setStatus("not_authorized");
          break;
        case "not_found":
          toast.error("Room not found on-chain");
          setStatus("error");
          break;
        default:
          toast.error(data.message || "Unknown recovery status");
          setStatus("error");
      }
    } catch (e: any) {
      console.error("Recovery check failed:", e);
      toast.error(e.message || "Failed to check recovery status");
      setStatus("error");
    }
  };

  const executeCancel = async () => {
    if (!pendingTx || !signTransaction || !publicKey) return;

    setStatus("force_settling");
    setShowConfirmDialog(false);

    try {
      // Deserialize and sign
      const txBuffer = bs58.decode(pendingTx);
      const transaction = Transaction.from(txBuffer);
      
      const signedTx = await signTransaction(transaction);
      
      const signature = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      }, "confirmed");

      toast.success("Room cancelled! Funds returned to your wallet.");
      setStatus("idle");
      setPendingTx(null);
      onRecovered?.();
    } catch (e: any) {
      console.error("Cancel transaction failed:", e);
      toast.error(e.message || "Failed to cancel room");
      setStatus("error");
    }
  };

  const formatSol = (lamports: string) => {
    return (parseInt(lamports) / 1_000_000_000).toFixed(4);
  };

  const isLoading = status === "checking" || status === "force_settling";

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={checkRecovery}
        disabled={isLoading || !publicKey}
        className={className}
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {status === "checking" ? "Checking..." : "Processing..."}
          </>
        ) : (
          <>
            <RefreshCw className="mr-2 h-4 w-4" />
            Recover Funds
          </>
        )}
      </Button>

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Cancel Room & Recover Funds
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  This will cancel the room and return your stake of{" "}
                  <span className="font-semibold text-foreground">
                    {result?.stakeAmount ? formatSol(result.stakeAmount) : "?"} SOL
                  </span>{" "}
                  to your wallet.
                </p>
                <p className="text-muted-foreground text-sm">
                  You will need to sign a transaction to complete this action.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingTx(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={executeCancel}>
              Confirm & Sign
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
