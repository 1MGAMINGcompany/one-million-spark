// src/components/WalletBar.tsx
import { useAccount, useConnect, useDisconnect, useChainId } from "wagmi";
import { polygon } from "wagmi/chains";
import { Button } from "@/components/ui/button";
import { Wallet, LogOut } from "lucide-react";

export default function WalletBar() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  const wrongNetwork = isConnected && chainId !== polygon.id;

  if (!isConnected) {
    return (
      <div className="flex gap-2 flex-wrap">
        {connectors.map((c) => (
          <Button
            key={c.uid}
            onClick={() => connect({ connector: c })}
            disabled={isPending}
            variant="outline"
            size="sm"
            className="border-primary/30 hover:border-primary/60 hover:bg-primary/10"
          >
            <Wallet className="w-4 h-4 mr-2" />
            {c.name}
          </Button>
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <div className="text-sm font-mono text-primary">
        {address?.slice(0, 6)}...{address?.slice(-4)}
        {wrongNetwork && <span className="text-destructive ml-2">(Wrong network)</span>}
      </div>
      <Button
        onClick={() => disconnect()}
        variant="ghost"
        size="sm"
        className="text-muted-foreground hover:text-destructive"
      >
        <LogOut className="w-4 h-4" />
      </Button>
    </div>
  );
}
