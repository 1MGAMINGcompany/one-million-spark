import { usePrivy } from "@privy-io/react-auth";
import { usePrivyWallet } from "@/hooks/usePrivyWallet";
import { Button } from "@/components/ui/button";
import { LogOut, Wallet } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID || "cmlq6g2dn00760cl2djbh9dfy";

export function PrivyLoginButton() {
  const { t } = useTranslation();

  if (!PRIVY_APP_ID) {
    return (
      <div className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
        {t("wallet.walletLoginNotConfigured")}
      </div>
    );
  }

  return <PrivyLoginButtonInner />;
}

function PrivyLoginButtonInner() {
  const { t } = useTranslation();
  const { ready, authenticated, login, logout } = usePrivy();
  const { isPrivyUser, shortAddress } = usePrivyWallet();

  if (!ready) {
    return null;
  }

  const handleLogin = async () => {
    try {
      await login();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[Privy] Login error:", msg, err);
      if (msg.includes("origin") || msg.includes("domain") || msg.includes("cookie")) {
        toast.error("Login failed: this domain is not configured. Please contact support.");
      } else if (msg.includes("popup") || msg.includes("blocked")) {
        toast.error("Login popup was blocked. Please allow popups and try again.");
      } else {
        toast.error("Login failed. Please try again or use a different browser.");
      }
    }
  };

  // Show logged-in state using EVM wallet from usePrivyWallet
  if (authenticated && isPrivyUser && shortAddress) {
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
          title={t("wallet.disconnect")}
        >
          <LogOut size={16} />
        </Button>
      </div>
    );
  }

  return (
    <Button
      onClick={handleLogin}
      size="sm"
      className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2"
    >
      <Wallet size={16} />
      {t("wallet.continue")}
    </Button>
  );
}
