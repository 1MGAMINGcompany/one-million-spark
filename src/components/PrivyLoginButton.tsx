import { usePrivy } from "@privy-io/react-auth";
import { Button } from "@/components/ui/button";
import { LogOut, Wallet } from "lucide-react";

const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID;

export function PrivyLoginButton() {
  // If Privy is not configured, show a small banner
  if (!PRIVY_APP_ID) {
    return (
      <div className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
        Wallet login not configured
      </div>
    );
  }

  return <PrivyLoginButtonInner />;
}

function PrivyLoginButtonInner() {
  const { ready, authenticated, login, logout, user } = usePrivy();

  if (!ready) {
    return null;
  }

  // Get the Solana embedded wallet address if available
  const solanaWallet = user?.linkedAccounts?.find(
    (a: any) => a.type === "wallet" && a.chainType === "solana"
  ) as any;

  const walletAddress = solanaWallet?.address;
  const shortAddress = walletAddress
    ? `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`
    : null;

  if (authenticated && shortAddress) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 text-sm text-foreground bg-secondary px-3 py-1.5 rounded-lg border border-border">
          <Wallet size={14} className="text-primary" />
          <span className="font-mono text-xs">{shortAddress}</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={logout}
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
          title="Disconnect"
        >
          <LogOut size={16} />
        </Button>
      </div>
    );
  }

  return (
    <Button
      onClick={login}
      size="sm"
      className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2"
    >
      <Wallet size={16} />
      Continue
    </Button>
  );
}
