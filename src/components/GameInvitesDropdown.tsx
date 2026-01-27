import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Bell, X, Play, Clock, Coins, Users, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useGameInvites, GameInvite } from "@/hooks/useGameInvites";
import { useSound } from "@/contexts/SoundContext";

interface GameInvitesDropdownProps {
  walletAddress?: string;
}

export function GameInvitesDropdown({ walletAddress }: GameInvitesDropdownProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { play } = useSound();
  const [open, setOpen] = useState(false);

  const { invites, unreadCount, acceptInvite, dismissInvite } = useGameInvites({
    walletAddress,
    enabled: !!walletAddress,
  });

  const handleJoin = async (invite: GameInvite) => {
    play("ui/click");
    await acceptInvite(invite.id);
    setOpen(false);
    navigate(`/room/${invite.room_pda}`);
  };

  const handleDismiss = async (e: React.MouseEvent, inviteId: string) => {
    e.stopPropagation();
    play("ui/click");
    await dismissInvite(inviteId);
  };

  const formatTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const formatTurnTime = (seconds: number) => {
    if (seconds <= 0) return "∞";
    if (seconds >= 60) return `${Math.floor(seconds / 60)}m`;
    return `${seconds}s`;
  };

  if (!walletAddress) return null;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge 
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs bg-red-500 border-0"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center gap-2">
          <Bell className="h-4 w-4" />
          {t("invites.gameInvites", "Game Invites")}
          {unreadCount > 0 && (
            <Badge variant="secondary" className="ml-auto">
              {unreadCount}
            </Badge>
          )}
        </DropdownMenuLabel>
        
        <DropdownMenuSeparator />
        
        {invites.length === 0 ? (
          <div className="py-6 text-center text-muted-foreground text-sm">
            <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>{t("invites.noInvites", "No pending invites")}</p>
          </div>
        ) : (
          <ScrollArea className="max-h-80">
            {invites.map((invite) => (
              <DropdownMenuItem
                key={invite.id}
                className="flex flex-col items-start gap-2 p-3 cursor-pointer focus:bg-accent"
                onClick={() => handleJoin(invite)}
              >
                <div className="flex w-full items-start justify-between">
                  <div className="flex flex-col gap-1">
                    <span className="font-semibold text-sm">
                      🎮 {invite.game_name || invite.game_type}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      From: {invite.sender_wallet.slice(0, 6)}...{invite.sender_wallet.slice(-4)}
                    </span>
                  </div>
                  
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={(e) => handleDismiss(e, invite.id)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                
                <div className="flex flex-wrap gap-2 text-xs">
                  {invite.stake_sol > 0 ? (
                    <>
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Coins className="h-3 w-3" />
                        {invite.stake_sol.toFixed(4)} SOL
                      </span>
                      {invite.winner_payout > 0 && (
                        <span className="flex items-center gap-1 text-emerald-400">
                          <Trophy className="h-3 w-3" />
                          {invite.winner_payout.toFixed(4)} SOL
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-emerald-400">🆓 Free</span>
                  )}
                  
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {formatTurnTime(invite.turn_time_seconds)}
                  </span>
                  
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Users className="h-3 w-3" />
                    {invite.max_players}p
                  </span>
                </div>
                
                <div className="flex w-full items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {formatTimeAgo(invite.created_at)}
                  </span>
                  
                  <Button size="sm" className="h-7 gap-1">
                    <Play className="h-3 w-3" />
                    Join
                  </Button>
                </div>
              </DropdownMenuItem>
            ))}
          </ScrollArea>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
