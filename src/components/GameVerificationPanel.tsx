import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useGameVerification, SignedGameResult } from "@/hooks/useGameVerification";
import { Shield, Check, AlertTriangle, Copy, FileInput, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface GameVerificationPanelProps {
  roomId: bigint;
  gameType: "chess" | "dominos" | "backgammon";
  finalState: string;
  winner: `0x${string}` | null;
  playerAddress: string | undefined;
  onResultSubmitted?: () => void;
}

export function GameVerificationPanel({
  roomId,
  gameType,
  finalState,
  winner,
  playerAddress,
  onResultSubmitted,
}: GameVerificationPanelProps) {
  const { toast } = useToast();
  const [importValue, setImportValue] = useState("");
  const [showImport, setShowImport] = useState(false);

  const {
    mySignedResult,
    opponentSignedResult,
    isVerifying,
    isSigning,
    isSubmitting,
    hasConsensus,
    disputeStatus,
    signGameResult,
    importSignedResult,
    exportSignedResult,
    submitVerifiedResult,
    initiateDispute,
  } = useGameVerification({
    roomId,
    gameType,
    onResultVerified: onResultSubmitted,
  });

  const handleSignResult = async () => {
    if (!winner) {
      toast({
        title: "No Winner",
        description: "Cannot sign result without a winner.",
        variant: "destructive",
      });
      return;
    }
    await signGameResult(winner, finalState);
  };

  const handleCopyResult = () => {
    const exported = exportSignedResult();
    if (exported) {
      navigator.clipboard.writeText(exported);
      toast({
        title: "Copied!",
        description: "Signed result copied to clipboard. Share with opponent.",
      });
    }
  };

  const handleImportResult = async () => {
    if (!importValue.trim()) return;
    
    const success = await importSignedResult(importValue);
    if (success) {
      setImportValue("");
      setShowImport(false);
    }
  };

  const handleSubmitResult = () => {
    if (winner) {
      submitVerifiedResult(winner);
    }
  };

  const handleDispute = () => {
    if (mySignedResult) {
      initiateDispute(mySignedResult);
    }
  };

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Shield className="w-5 h-5 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Result Verification</h3>
      </div>

      {/* Status indicators */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Your signature:</span>
          <span className={cn(
            "flex items-center gap-1",
            mySignedResult ? "text-green-500" : "text-muted-foreground"
          )}>
            {mySignedResult ? (
              <>
                <Check className="w-4 h-4" />
                Signed
              </>
            ) : (
              "Not signed"
            )}
          </span>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Opponent signature:</span>
          <span className={cn(
            "flex items-center gap-1",
            opponentSignedResult ? "text-green-500" : "text-muted-foreground"
          )}>
            {opponentSignedResult ? (
              <>
                <Check className="w-4 h-4" />
                Verified
              </>
            ) : (
              "Pending"
            )}
          </span>
        </div>

        {hasConsensus && (
          <div className="flex items-center gap-2 p-2 bg-green-500/10 border border-green-500/20 rounded text-green-500 text-sm">
            <Check className="w-4 h-4" />
            Both players agree on the result
          </div>
        )}

        {disputeStatus === "pending" && (
          <div className="flex items-center gap-2 p-2 bg-yellow-500/10 border border-yellow-500/20 rounded text-yellow-500 text-sm">
            <AlertTriangle className="w-4 h-4" />
            Dispute in progress
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="space-y-2">
        {!mySignedResult && (
          <Button
            onClick={handleSignResult}
            disabled={isSigning || !winner}
            className="w-full gap-2"
          >
            <Shield className="w-4 h-4" />
            {isSigning ? "Signing..." : "Sign Game Result"}
          </Button>
        )}

        {mySignedResult && !opponentSignedResult && (
          <>
            <Button
              onClick={handleCopyResult}
              variant="outline"
              className="w-full gap-2"
            >
              <Copy className="w-4 h-4" />
              Copy Signed Result
            </Button>

            <Button
              onClick={() => setShowImport(!showImport)}
              variant="outline"
              className="w-full gap-2"
            >
              <FileInput className="w-4 h-4" />
              Import Opponent's Result
            </Button>
          </>
        )}

        {showImport && (
          <div className="space-y-2">
            <Textarea
              value={importValue}
              onChange={(e) => setImportValue(e.target.value)}
              placeholder="Paste opponent's signed result here..."
              className="min-h-[80px] text-xs"
            />
            <Button
              onClick={handleImportResult}
              disabled={isVerifying || !importValue.trim()}
              className="w-full gap-2"
            >
              {isVerifying ? "Verifying..." : "Verify & Import"}
            </Button>
          </div>
        )}

        {hasConsensus && (
          <Button
            onClick={handleSubmitResult}
            disabled={isSubmitting}
            className="w-full gap-2 bg-green-600 hover:bg-green-700"
          >
            <Send className="w-4 h-4" />
            {isSubmitting ? "Submitting..." : "Submit to Blockchain"}
          </Button>
        )}

        {mySignedResult && opponentSignedResult && !hasConsensus && (
          <Button
            onClick={handleDispute}
            variant="destructive"
            className="w-full gap-2"
          >
            <AlertTriangle className="w-4 h-4" />
            Open Dispute
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Both players must sign the result to verify it on-chain. 
        Share your signed result with your opponent for mutual verification.
      </p>
    </div>
  );
}
