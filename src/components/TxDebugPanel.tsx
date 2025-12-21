import { Transaction } from "@solana/web3.js";
import { X } from "lucide-react";
import { Button } from "./ui/button";

interface TxDebugInfo {
  publicKey: string | null;
  feePayer: string | null;
  recentBlockhash: string | null;
  signatures: Array<{ pubkey: string; signature: string | null }>;
  errorMessage: string;
}

interface TxDebugPanelProps {
  debugInfo: TxDebugInfo | null;
  onClose: () => void;
}

export function TxDebugPanel({ debugInfo, onClose }: TxDebugPanelProps) {
  if (!debugInfo) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 bg-red-950/95 border border-red-500/50 rounded-lg p-4 z-50 shadow-xl">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-red-400 font-bold text-sm">🔧 Tx Debug</h3>
        <Button variant="ghost" size="sm" onClick={onClose} className="h-6 w-6 p-0">
          <X className="h-4 w-4" />
        </Button>
      </div>
      
      <div className="space-y-2 text-xs font-mono">
        <div className="flex justify-between">
          <span className="text-red-300">publicKey:</span>
          <span className="text-white truncate max-w-[200px]">
            {debugInfo.publicKey || "null"}
          </span>
        </div>
        
        <div className="flex justify-between">
          <span className="text-red-300">tx.feePayer:</span>
          <span className="text-white truncate max-w-[200px]">
            {debugInfo.feePayer || "null"}
          </span>
        </div>
        
        <div className="flex justify-between">
          <span className="text-red-300">blockhash:</span>
          <span className="text-white">
            {debugInfo.recentBlockhash?.slice(0, 12) || "null"}...
          </span>
        </div>
        
        <div className="border-t border-red-500/30 pt-2 mt-2">
          <span className="text-red-300">tx.signatures:</span>
          <div className="mt-1 space-y-1">
            {debugInfo.signatures.length === 0 ? (
              <span className="text-yellow-400">No signatures</span>
            ) : (
              debugInfo.signatures.map((sig, i) => (
                <div key={i} className="flex justify-between">
                  <span className="text-gray-400 truncate max-w-[120px]">
                    {sig.pubkey.slice(0, 8)}...
                  </span>
                  <span className={sig.signature ? "text-green-400" : "text-red-400"}>
                    {sig.signature ? "✓ signed" : "✗ NULL"}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
        
        <div className="border-t border-red-500/30 pt-2 mt-2">
          <span className="text-red-300">Error:</span>
          <div className="mt-1 text-red-200 break-words whitespace-pre-wrap max-h-24 overflow-y-auto">
            {debugInfo.errorMessage}
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper to build debug info from a transaction
export function buildTxDebugInfo(
  tx: Transaction | null,
  publicKey: string | null,
  error: Error | unknown
): TxDebugInfo {
  const signatures = tx?.signatures?.map(sig => ({
    pubkey: sig.publicKey.toBase58(),
    signature: sig.signature ? "present" : null,
  })) || [];

  return {
    publicKey,
    feePayer: tx?.feePayer?.toBase58() || null,
    recentBlockhash: tx?.recentBlockhash || null,
    signatures,
    errorMessage: error instanceof Error ? error.message : String(error),
  };
}
