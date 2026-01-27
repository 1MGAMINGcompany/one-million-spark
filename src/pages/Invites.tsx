import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import { useTranslation } from "react-i18next";
import { Bell, Wallet, Loader2, Gamepad2, Coins, Timer, ArrowRight, RefreshCw, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useGameInvites, type GameInvite } from "@/hooks/useGameInvites";
import { WalletButton } from "@/components/WalletButton";

/**
 * Dedicated invites page - mobile-friendly list view.
 * Implements polling fallback ONLY on this page (not globally).
 */
export default function Invites() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { connected, publicKey } = useWallet();
  
  const { 
    invites, 
    loading, 
    acceptInvite, 
    dismissInvite,
    refetch 
  } = useGameInvites({
    walletAddress: publicKey?.toBase58(),
    enabled: !!connected && !!publicKey,
  });
  
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Polling fallback ONLY on this page, ONLY when visible and connected
  // This is safer than global polling in the hook
  useEffect(() => {
    if (!connected || !publicKey) return;
    
    const interval = setInterval(() => {
      // Only poll when page is visible
      if (document.visibilityState === 'visible') {
        refetch();
      }
    }, 15000);
    
    return () => clearInterval(interval);
  }, [connected, publicKey, refetch]);
  
  // Manual refresh handler
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setTimeout(() => setIsRefreshing(false), 500);
  };
  
  // Handle join invite
  const handleJoin = async (invite: GameInvite) => {
    // Mark as accepted in DB
    await acceptInvite(invite.id);
    // Navigate to room
    navigate(`/room/${invite.room_pda}`);
  };
  
  // Handle dismiss
  const handleDismiss = async (invite: GameInvite) => {
    await dismissInvite(invite.id);
  };
  
  // Format turn time for display
  const formatTurnTime = (seconds: number): string => {
    if (seconds <= 0) return "∞";
    if (seconds >= 60) return `${Math.floor(seconds / 60)}m`;
    return `${seconds}s`;
  };
  
  // Not connected state
  if (!connected || !publicKey) {
    return (
      <div className="container max-w-md py-8 px-4 min-h-[60vh] flex flex-col items-center justify-center">
        <Card className="w-full border-primary/30 bg-card/80 backdrop-blur">
          <CardContent className="flex flex-col items-center py-12 px-6 text-center">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-6">
              <Wallet className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-xl font-semibold mb-2">
              {t("invites.connectToView", "Connect wallet to view invites")}
            </h2>
            <p className="text-muted-foreground text-sm mb-6">
              {t("invites.connectDesc", "Your game invites will appear here once you connect your Solana wallet.")}
            </p>
            <WalletButton />
          </CardContent>
        </Card>
      </div>
    );
  }
  
  // Loading state
  if (loading && invites.length === 0) {
    return (
      <div className="container max-w-md py-8 px-4 min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">{t("common.loading", "Loading...")}</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="container max-w-md py-6 px-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Bell className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">{t("invites.title", "Game Invites")}</h1>
            <p className="text-sm text-muted-foreground">
              {invites.length > 0 
                ? t("invites.pendingCount", "{{count}} pending", { count: invites.length })
                : t("invites.noPending", "No pending invites")
              }
            </p>
          </div>
        </div>
        
        <Button 
          variant="ghost" 
          size="icon"
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw className={`h-5 w-5 ${isRefreshing ? 'animate-spin' : ''}`} />
        </Button>
      </div>
      
      {/* Empty state */}
      {invites.length === 0 && (
        <Card className="border-border/50 bg-card/50">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center mb-4">
              <Inbox className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="font-medium mb-2">{t("invites.emptyTitle", "No invites yet")}</h3>
            <p className="text-sm text-muted-foreground max-w-xs">
              {t("invites.emptyDesc", "When someone sends you a game invite, it will appear here.")}
            </p>
          </CardContent>
        </Card>
      )}
      
      {/* Invites list */}
      <div className="space-y-3">
        {invites.map((invite) => (
          <Card 
            key={invite.id} 
            className="border-primary/20 bg-card/80 hover:border-primary/40 transition-colors"
          >
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                {/* Game icon */}
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Gamepad2 className="h-5 w-5 text-primary" />
                </div>
                
                <div className="flex-1 min-w-0">
                  {/* Game name and mode */}
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold truncate">
                      {invite.game_name || invite.game_type}
                    </span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      invite.mode === 'ranked' 
                        ? 'bg-red-500/20 text-red-400' 
                        : invite.mode === 'private'
                        ? 'bg-violet-500/20 text-violet-400'
                        : 'bg-emerald-500/20 text-emerald-400'
                    }`}>
                      {invite.mode === 'ranked' ? '🔴' : invite.mode === 'private' ? '🟣' : '🟢'}
                    </span>
                  </div>
                  
                  {/* Details row */}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
                    <span className="flex items-center gap-1">
                      <Coins className="h-3 w-3" />
                      {invite.stake_sol > 0 ? `${invite.stake_sol} SOL` : 'Free'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Timer className="h-3 w-3" />
                      {formatTurnTime(invite.turn_time_seconds)}
                    </span>
                  </div>
                  
                  {/* Sender */}
                  <p className="text-xs text-muted-foreground truncate">
                    From: {invite.sender_wallet.slice(0, 6)}...{invite.sender_wallet.slice(-4)}
                  </p>
                </div>
                
                {/* Actions */}
                <div className="flex flex-col gap-1.5 shrink-0">
                  <Button 
                    size="sm" 
                    onClick={() => handleJoin(invite)}
                    className="gap-1 h-8"
                  >
                    Join
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                  <Button 
                    size="sm" 
                    variant="ghost"
                    onClick={() => handleDismiss(invite)}
                    className="h-7 text-xs text-muted-foreground"
                  >
                    Dismiss
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
