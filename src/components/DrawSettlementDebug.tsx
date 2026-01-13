/**
 * DrawSettlementDebug - DEV-only component for testing draw settlement
 * 
 * Provides a "Force Draw Settlement" button that manually calls settle-draw
 * for debugging and testing purposes.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, AlertTriangle, CheckCircle, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface DrawSettlementDebugProps {
  roomPda: string | undefined;
  /** Only show in development mode */
  showInProd?: boolean;
}

export function DrawSettlementDebug({ roomPda, showInProd = false }: DrawSettlementDebugProps) {
  const [isSettling, setIsSettling] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    signature?: string;
    error?: string;
    message?: string;
  } | null>(null);

  // Only show in development unless explicitly allowed
  const isDev = import.meta.env.DEV || import.meta.env.MODE === "development";
  if (!isDev && !showInProd) {
    return null;
  }

  if (!roomPda) {
    return null;
  }

  const handleForceDrawSettlement = async () => {
    setIsSettling(true);
    setResult(null);

    console.log("[DrawSettlementDebug] Force settling draw for room:", roomPda);

    try {
      const { data, error } = await supabase.functions.invoke("settle-draw", {
        body: {
          roomPda,
          reason: "draw",
        },
      });

      console.log("[DrawSettlementDebug] Response:", data, error);

      if (error) {
        setResult({
          success: false,
          error: error.message || "Edge function error",
        });
        return;
      }

      if (data?.ok || data?.alreadySettled) {
        setResult({
          success: true,
          signature: data.signature,
          message: data.alreadySettled 
            ? "Already settled" 
            : `Refunded ${data.playersRefunded?.length || 0} players`,
        });
      } else if (data?.code === "INSTRUCTION_NOT_FOUND") {
        setResult({
          success: false,
          error: data.error,
          message: data.message || "Draw refund not enabled yet",
        });
      } else {
        setResult({
          success: false,
          error: data?.error || "Unknown error",
          message: data?.message,
        });
      }
    } catch (err: any) {
      console.error("[DrawSettlementDebug] Exception:", err);
      setResult({
        success: false,
        error: err.message || "Exception during settlement",
      });
    } finally {
      setIsSettling(false);
    }
  };

  return (
    <Card className="p-4 bg-amber-950/30 border-amber-500/30 space-y-3">
      <div className="flex items-center gap-2 text-amber-400">
        <AlertTriangle size={16} />
        <span className="text-xs font-semibold uppercase tracking-wider">
          DEV: Draw Settlement Test
        </span>
      </div>

      <p className="text-xs text-muted-foreground">
        Room: <code className="text-amber-300">{roomPda.slice(0, 8)}...{roomPda.slice(-4)}</code>
      </p>

      <Button
        onClick={handleForceDrawSettlement}
        disabled={isSettling}
        variant="outline"
        size="sm"
        className="w-full gap-2 border-amber-500/50 text-amber-400 hover:bg-amber-500/20"
      >
        {isSettling ? (
          <>
            <Loader2 size={14} className="animate-spin" />
            Settling Draw...
          </>
        ) : (
          <>
            <RefreshCw size={14} />
            Force Draw Settlement
          </>
        )}
      </Button>

      {result && (
        <div
          className={`p-3 rounded text-xs space-y-1 ${
            result.success
              ? "bg-emerald-500/20 border border-emerald-500/50"
              : "bg-destructive/20 border border-destructive/50"
          }`}
        >
          <div className="flex items-center gap-2">
            {result.success ? (
              <CheckCircle size={14} className="text-emerald-400" />
            ) : (
              <AlertTriangle size={14} className="text-destructive" />
            )}
            <span className={result.success ? "text-emerald-400" : "text-destructive"}>
              {result.success ? "Success" : "Failed"}
            </span>
          </div>

          {result.message && (
            <p className="text-muted-foreground">{result.message}</p>
          )}

          {result.error && (
            <p className="text-destructive/80">{result.error}</p>
          )}

          {result.signature && (
            <a
              href={`https://explorer.solana.com/tx/${result.signature}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline block truncate"
            >
              TX: {result.signature.slice(0, 20)}...
            </a>
          )}
        </div>
      )}
    </Card>
  );
}
