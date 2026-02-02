import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Loader2, RefreshCw, LogIn } from "lucide-react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import bs58 from "bs58";
import { useNavigate } from "react-router-dom";
import { getSessionToken, getAuthHeaders } from "@/lib/sessionToken";
import { useSolanaRooms } from "@/hooks/useSolanaRooms";
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

const RECOVERY_TIMEOUT_MS = 10_000;

export function RecoverFundsButton({ roomPda, onRecovered, className }: RecoverFundsButtonProps) {
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const navigate = useNavigate();
  const { clearRoomFromState, fetchUserActiveRoom } = useSolanaRooms();
  const [status, setStatus] = useState<RecoveryStatus>("idle");
  const [result, setResult] = useState<RecoveryResult | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingTx, setPendingTx] = useState<string | null>(null);
  const [showRejoinCTA, setShowRejoinCTA] = useState(false);

  const checkRecovery = async () => {
    if (!publicKey) {
      toast.error("Please connect your wallet");
      return;
    }

    // Defensive check: Solana PDAs are 32-44 base58 characters
    if (!roomPda || roomPda.length < 32) {
      console.error("[RecoverFunds] Invalid roomPda:", roomPda);
      toast.error("Invalid room ID — cannot recover. Please refresh and try again.");
      return;
    }

    setStatus("checking");
    setResult(null);
    setShowRejoinCTA(false);

    try {
      // Get session token for authorization - prefer room-specific token
      const sessionToken = getSessionToken(roomPda);
      if (!sessionToken) {
        toast.error("Missing session token for this room. Click Rejoin to restore session.");
        setShowRejoinCTA(true);
        setStatus("not_authorized");
        return;
      }

      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("TIMEOUT")), RECOVERY_TIMEOUT_MS);
      });

      // Race between API call and timeout
      const response = await Promise.race([
        supabase.functions.invoke("recover-funds", {
          body: { roomPda },
          headers: getAuthHeaders(sessionToken),
        }),
        timeoutPromise,
      ]);

      const { data, error } = response as { data: RecoveryResult | null; error: { message?: string; context?: { status?: number } } | null };

      // Handle non-2xx responses - extract actual error message from response
      if (error) {
        console.error("[RecoverFunds] Edge function error:", error);
        
        // Try to extract status code and message
        const statusCode = error.context?.status;
        const errorMessage = error.message || "Unknown error";
        
        // Check for auth-related errors
        if (statusCode === 401 || statusCode === 403 || errorMessage.includes("Unauthorized") || errorMessage.includes("Session")) {
          toast.error("Session expired or invalid. Click Rejoin to restore session.");
          setShowRejoinCTA(true);
          setStatus("not_authorized");
          return;
        }
        
        // Check for not found
        if (statusCode === 404) {
          toast.error("Room not found on-chain. It may have been closed already.");
          setStatus("error");
          return;
        }
        
        // Display specific error with status code
        const displayMsg = statusCode 
          ? `Error ${statusCode}: ${errorMessage}`
          : errorMessage;
        toast.error(displayMsg);
        setStatus("error");
        return;
      }
      
      if (!data) {
        toast.error("Empty response from server");
        setStatus("error");
        return;
      }

      setResult(data);

      switch (data.status) {
        case "can_cancel":
          setPendingTx(data.unsignedTx || null);
          setShowConfirmDialog(true);
          setStatus("can_cancel");
          break;
        case "force_settled":
          toast.success("Game force-settled! Funds returned to creator.");
          // Clear room from local state immediately (banners disappear)
          clearRoomFromState(roomPda);
          // Trigger refresh fetch for any remaining rooms
          fetchUserActiveRoom();
          setStatus("idle");
          onRecovered?.();
          // Navigate to room list after successful force settle
          navigate("/room-list");
          break;
        case "already_resolved":
          toast.info(data.message);
          setStatus("already_resolved");
          break;
        case "game_active":
          const hoursRemaining = data.hoursRemaining ?? 0;
          toast.info(`Game still active. ${hoursRemaining.toFixed(1)}h until recovery available.`);
          setStatus("game_active");
          break;
        case "not_authorized":
        case "no_action":
          toast.warning(data.message || "Not authorized to recover this room.");
          setShowRejoinCTA(true);
          setStatus("not_authorized");
          break;
        case "not_found":
          toast.error("Room not found on-chain");
          setStatus("error");
          break;
        case "error":
          // Server returned an error status in the JSON body
          toast.error(data.message || "Server error during recovery check.");
          setStatus("error");
          break;
        default:
          toast.error(data.message || "Unknown recovery status");
          setStatus("error");
      }
    } catch (e: any) {
      console.error("[RecoverFunds] Recovery check failed:", e);
      if (e.message === "TIMEOUT") {
        toast.error("Recover funds timed out — try again.");
      } else {
        // Fallback for unexpected errors
        toast.error(e.message || "Failed to check recovery status");
      }
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
      // Clear room from local state immediately (banners disappear)
      clearRoomFromState(roomPda);
      // Trigger refresh fetch for any remaining rooms
      fetchUserActiveRoom();
      setStatus("idle");
      setPendingTx(null);
      onRecovered?.();
      // Navigate to room list after successful cancel
      navigate("/room-list");
    } catch (e: any) {
      console.error("Cancel transaction failed:", e);
      toast.error(e.message || "Failed to cancel room");
      setStatus("error");
    }
  };

  const formatSol = (lamports: string) => {
    return (parseInt(lamports) / 1_000_000_000).toFixed(4);
  };

  const handleRejoinRoom = () => {
    navigate(`/room/${roomPda}`);
  };

  const isLoading = status === "checking" || status === "force_settling";

  return (
    <>
      <div className="flex items-center gap-2">
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
        
        {showRejoinCTA && (
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRejoinRoom}
          >
            <LogIn className="mr-2 h-4 w-4" />
            Rejoin Room
          </Button>
        )}
      </div>

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
