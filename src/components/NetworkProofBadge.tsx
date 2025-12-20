import { useSolanaNetwork } from "@/hooks/useSolanaNetwork";
import { useWallet } from "@/hooks/useWallet";
import { cn } from "@/lib/utils";
import { RefreshCw, AlertTriangle, CheckCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface NetworkProofBadgeProps {
  showBalance?: boolean;
  compact?: boolean;
  className?: string;
}

export function NetworkProofBadge({ 
  showBalance = true, 
  compact = false,
  className 
}: NetworkProofBadgeProps) {
  const { isConnected, address } = useWallet();
  const { 
    networkInfo, 
    balanceInfo, 
    fetchBalance, 
    fetchNetworkInfo 
  } = useSolanaNetwork();
  
  const handleRefresh = async () => {
    await Promise.all([fetchNetworkInfo(), fetchBalance()]);
  };
  
  // Get status color based on cluster
  const getClusterColor = () => {
    if (networkInfo.loading) return "text-muted-foreground";
    if (networkInfo.isMainnet) return "text-green-400";
    if (networkInfo.cluster === "devnet") return "text-yellow-400";
    if (networkInfo.cluster === "testnet") return "text-orange-400";
    return "text-red-400";
  };
  
  const getClusterIcon = () => {
    if (networkInfo.loading) return <Loader2 className="w-3 h-3 animate-spin" />;
    if (networkInfo.isMainnet) return <CheckCircle className="w-3 h-3" />;
    return <AlertTriangle className="w-3 h-3" />;
  };
  
  if (compact) {
    return (
      <div className={cn(
        "flex items-center gap-2 px-2 py-1 rounded text-xs font-mono bg-muted/50",
        className
      )}>
        <span className={getClusterColor()}>
          {getClusterIcon()}
        </span>
        <span className={getClusterColor()}>
          {networkInfo.loading ? "..." : networkInfo.cluster.toUpperCase()}
        </span>
        {showBalance && isConnected && (
          <>
            <span className="text-muted-foreground">|</span>
            {balanceInfo.loading ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : balanceInfo.error ? (
              <span className="text-red-400" title={balanceInfo.error}>ERR</span>
            ) : balanceInfo.sol !== null ? (
              <span>{balanceInfo.sol.toFixed(4)} SOL</span>
            ) : (
              <span className="text-muted-foreground">--</span>
            )}
          </>
        )}
      </div>
    );
  }
  
  return (
    <div className={cn(
      "p-3 rounded-lg border bg-card/50 text-xs space-y-2",
      networkInfo.isMainnet ? "border-green-500/30" : "border-yellow-500/30",
      className
    )}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="font-semibold flex items-center gap-1.5">
          {getClusterIcon()}
          <span className={getClusterColor()}>
            Network: {networkInfo.loading ? "Loading..." : networkInfo.cluster.toUpperCase()}
          </span>
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={handleRefresh}
          disabled={networkInfo.loading || balanceInfo.loading}
        >
          <RefreshCw className={cn(
            "w-3 h-3",
            (networkInfo.loading || balanceInfo.loading) && "animate-spin"
          )} />
        </Button>
      </div>
      
      {/* RPC Endpoint */}
      <div className="space-y-1">
        <span className="text-muted-foreground">RPC Endpoint:</span>
        <div className="font-mono text-[10px] bg-muted/50 px-2 py-1 rounded break-all">
          {networkInfo.rpcEndpoint}
        </div>
      </div>
      
      {/* Genesis Hash */}
      <div className="space-y-1">
        <span className="text-muted-foreground">Genesis Hash:</span>
        <div className="font-mono text-[10px] bg-muted/50 px-2 py-1 rounded break-all">
          {networkInfo.loading ? (
            "Loading..."
          ) : networkInfo.error ? (
            <span className="text-red-400">{networkInfo.error}</span>
          ) : (
            networkInfo.genesisHash || "Unknown"
          )}
        </div>
      </div>
      
      {/* Balance Section */}
      {showBalance && isConnected && (
        <div className="pt-2 border-t border-border/50 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Connected Address:</span>
            <span className="font-mono">
              {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "--"}
            </span>
          </div>
          
          {balanceInfo.error ? (
            <div className="bg-red-500/10 border border-red-500/30 rounded p-2 text-red-400">
              <span className="font-semibold">Balance Error:</span>
              <div className="text-[10px] mt-1">{balanceInfo.error}</div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Raw Lamports:</span>
                <span className="font-mono">
                  {balanceInfo.loading ? (
                    <Loader2 className="w-3 h-3 animate-spin inline" />
                  ) : balanceInfo.lamports !== null ? (
                    balanceInfo.lamports.toLocaleString()
                  ) : (
                    "--"
                  )}
                </span>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">SOL Balance:</span>
                <span className={cn(
                  "font-semibold",
                  balanceInfo.sol !== null && balanceInfo.sol > 0 
                    ? "text-green-400" 
                    : "text-muted-foreground"
                )}>
                  {balanceInfo.loading ? (
                    <Loader2 className="w-3 h-3 animate-spin inline" />
                  ) : balanceInfo.sol !== null ? (
                    `${balanceInfo.sol.toFixed(6)} SOL`
                  ) : (
                    "--"
                  )}
                </span>
              </div>
            </>
          )}
          
          {balanceInfo.lastFetched && (
            <div className="text-[10px] text-muted-foreground text-right">
              Last updated: {balanceInfo.lastFetched.toLocaleTimeString()}
            </div>
          )}
        </div>
      )}
      
      {/* Network Warning */}
      {!networkInfo.loading && !networkInfo.isMainnet && networkInfo.cluster !== "unknown" && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded p-2 text-yellow-400">
          <AlertTriangle className="w-3 h-3 inline mr-1" />
          Wrong network! App is connected to {networkInfo.cluster} but your wallet funds are likely on Mainnet.
        </div>
      )}
    </div>
  );
}
