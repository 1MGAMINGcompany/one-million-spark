import { Wallet } from "lucide-react";

export function WalletRequired() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-6">
          <Wallet className="text-muted-foreground" size={32} />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">
          Wallet Required
        </h2>
        <p className="text-muted-foreground mb-4">
          Please connect your wallet to use this feature.
        </p>
        <p className="text-sm text-muted-foreground">
          Click "Connect Wallet" in the top-right.
        </p>
      </div>
    </div>
  );
}
