import { usePrivySafe } from "@/hooks/usePrivySafe";
import { usePrivyWallet } from "@/hooks/usePrivyWallet";
import { usePrivyLogin } from "@/hooks/usePrivyLogin";
import { Button } from "@/components/ui/button";
import { LogOut, Wallet, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { isPrivyConfigured } from "@/lib/privyConfig";

export function PrivyLoginButton() {
  const { t } = useTranslation();

  if (!isPrivyConfigured) {
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
  const { ready, authenticated, logout } = usePrivySafe();
  const { login } = usePrivyLogin();
  const { isPrivyUser, shortAddress, hydratingWallet } = usePrivyWallet();

  if (!ready) {
    return null;
  }

  // Wallet is still hydrating after auth — show loading, not login
  if (authenticated && hydratingWallet) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground px-3 py-1.5">
        <Loader2 size={14} className="animate-spin" />
        <span className="text-xs">Setting up wallet…</span>
      </div>
    );
  }

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
      onClick={login}
      size="sm"
      className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2"
    >
      <Wallet size={16} />
      {t("wallet.continue")}
    </Button>
  );
}
