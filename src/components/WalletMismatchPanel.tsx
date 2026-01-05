/**
 * WalletMismatchPanel - Blocking panel shown when connected wallet is not in roomPlayers
 * 
 * This prevents users from accidentally trying to play with the wrong wallet,
 * which would cause transaction failures or incorrect game state.
 */

import { AlertTriangle, Wallet, ArrowLeft, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "react-i18next";

interface WalletMismatchPanelProps {
  connectedWallet: string;
  roomPlayers: string[];
  onSwitchWallet?: () => void;
  onBackToRooms: () => void;
}

const formatWallet = (wallet: string): string => {
  if (!wallet || wallet.length <= 12) return wallet || "—";
  return `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;
};

export function WalletMismatchPanel({
  connectedWallet,
  roomPlayers,
  onSwitchWallet,
  onBackToRooms,
}: WalletMismatchPanelProps) {
  const { t } = useTranslation();

  // Filter out placeholder wallets (waiting-*, error-*)
  const validPlayers = roomPlayers.filter(
    p => !p.startsWith("waiting-") && !p.startsWith("error-") && !p.startsWith("ai-")
  );

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4">
      <Card className="max-w-md w-full border-amber-500/30 bg-card/95">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-amber-500/20 flex items-center justify-center">
            <AlertTriangle className="h-8 w-8 text-amber-500" />
          </div>
          <CardTitle className="text-xl">
            {t("wallet.wrongWalletConnected", "Wrong Wallet Connected")}
          </CardTitle>
        </CardHeader>
        
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground text-center">
            {t("wallet.joinedWithDifferentWallet", "You joined this room with a different wallet. Please connect the correct wallet to continue.")}
          </p>

          {/* Wallet comparison */}
          <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
            {/* Connected wallet */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground flex items-center gap-2">
                <Wallet className="h-4 w-4" />
                {t("wallet.connected", "Connected")}:
              </span>
              <code className="font-mono text-foreground bg-destructive/20 px-2 py-1 rounded">
                {formatWallet(connectedWallet)}
              </code>
            </div>

            {/* Expected wallets */}
            <div className="border-t border-border/50 pt-3">
              <span className="text-xs text-muted-foreground">
                {t("wallet.expectedWallets", "Expected wallets in room")}:
              </span>
              <div className="mt-2 space-y-1">
                {validPlayers.length > 0 ? (
                  validPlayers.map((player, idx) => (
                    <div key={player} className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">P{idx + 1}:</span>
                      <code className="font-mono text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded">
                        {formatWallet(player)}
                      </code>
                    </div>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground italic">
                    {t("wallet.loadingPlayers", "Loading room players...")}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              onClick={onBackToRooms}
              className="flex-1 gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              {t("leaveMatch.backToRooms", "Back to Rooms")}
            </Button>
            
            {onSwitchWallet && (
              <Button
                variant="default"
                onClick={onSwitchWallet}
                className="flex-1 gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                {t("wallet.switchWallet", "Switch Wallet")}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
