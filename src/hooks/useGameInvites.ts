import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useSound } from "@/contexts/SoundContext";
import { RoomInviteInfo } from "@/lib/invite";

export interface GameInvite {
  id: string;
  room_pda: string;
  sender_wallet: string;
  recipient_wallet: string;
  game_type: string;
  game_name: string | null;
  stake_sol: number;
  winner_payout: number;
  turn_time_seconds: number;
  max_players: number;
  mode: string;
  status: string;
  created_at: string;
  expires_at: string;
}

interface UseGameInvitesOptions {
  walletAddress?: string;
  enabled?: boolean;
}

export function useGameInvites({ walletAddress, enabled = true }: UseGameInvitesOptions) {
  const [invites, setInvites] = useState<GameInvite[]>([]);
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const { toast } = useToast();
  const { play } = useSound();

  // Fetch pending invites for the wallet
  const fetchInvites = useCallback(async () => {
    if (!walletAddress || !enabled) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("game_invites")
        .select("*")
        .eq("recipient_wallet", walletAddress)
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });

      if (error) throw error;

      const typedData = (data || []) as GameInvite[];
      setInvites(typedData);
      setUnreadCount(typedData.length);
    } catch (err) {
      console.error("[GameInvites] Failed to fetch invites:", err);
    } finally {
      setLoading(false);
    }
  }, [walletAddress, enabled]);

  // Send an invite to a wallet address
  const sendInvite = useCallback(async (
    recipientWallet: string,
    roomInfo: RoomInviteInfo
  ): Promise<boolean> => {
    if (!walletAddress) {
      toast({ title: "Connect wallet", description: "Please connect your wallet first", variant: "destructive" });
      return false;
    }

    // Validate recipient wallet format (basic Solana address check)
    const trimmedRecipient = recipientWallet.trim();
    if (trimmedRecipient.length < 32 || trimmedRecipient.length > 44) {
      toast({ title: "Invalid wallet", description: "Please enter a valid Solana wallet address", variant: "destructive" });
      return false;
    }

    if (trimmedRecipient === walletAddress) {
      toast({ title: "Can't invite yourself", description: "Enter a different wallet address", variant: "destructive" });
      return false;
    }

    try {
      const { error } = await supabase
        .from("game_invites")
        .insert({
          room_pda: roomInfo.roomPda,
          sender_wallet: walletAddress,
          recipient_wallet: trimmedRecipient,
          game_type: roomInfo.gameName || "unknown",
          game_name: roomInfo.gameName,
          stake_sol: roomInfo.stakeSol || 0,
          winner_payout: roomInfo.winnerPayout || 0,
          turn_time_seconds: roomInfo.turnTimeSeconds || 60,
          max_players: roomInfo.maxPlayers || 2,
          mode: roomInfo.mode || "private",
          status: "pending",
        });

      if (error) throw error;

      play("ui/notify");
      toast({ 
        title: "Invite sent! 🎉", 
        description: `${trimmedRecipient.slice(0, 6)}...${trimmedRecipient.slice(-4)} will see it when they connect.`
      });
      return true;
    } catch (err: any) {
      console.error("[GameInvites] Failed to send invite:", err);
      toast({ title: "Failed to send", description: err.message || "Please try again", variant: "destructive" });
      return false;
    }
  }, [walletAddress, toast, play]);

  // Mark invite as viewed
  const markAsViewed = useCallback(async (inviteId: string) => {
    try {
      await supabase
        .from("game_invites")
        .update({ status: "viewed" })
        .eq("id", inviteId);
    } catch (err) {
      console.error("[GameInvites] Failed to mark as viewed:", err);
    }
  }, []);

  // Mark invite as accepted
  const acceptInvite = useCallback(async (inviteId: string) => {
    try {
      await supabase
        .from("game_invites")
        .update({ status: "accepted" })
        .eq("id", inviteId);
      
      // Remove from local list
      setInvites(prev => prev.filter(i => i.id !== inviteId));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error("[GameInvites] Failed to accept invite:", err);
    }
  }, []);

  // Dismiss/delete invite
  const dismissInvite = useCallback(async (inviteId: string) => {
    try {
      await supabase
        .from("game_invites")
        .delete()
        .eq("id", inviteId);
      
      setInvites(prev => prev.filter(i => i.id !== inviteId));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error("[GameInvites] Failed to dismiss invite:", err);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchInvites();
  }, [fetchInvites]);

  // Subscribe to new invites in real-time
  useEffect(() => {
    if (!walletAddress || !enabled) return;

    const channel = supabase
      .channel(`invites-${walletAddress}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "game_invites",
          filter: `recipient_wallet=eq.${walletAddress}`,
        },
        (payload) => {
          console.log("[GameInvites] New invite received:", payload);
          const newInvite = payload.new as GameInvite;
          setInvites(prev => [newInvite, ...prev]);
          setUnreadCount(prev => prev + 1);
          
          play("ui/notify");
          toast({
            title: "🎮 New Game Invite!",
            description: `${newInvite.sender_wallet.slice(0, 6)}... invited you to play ${newInvite.game_name || newInvite.game_type}`,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [walletAddress, enabled, toast, play]);

  return {
    invites,
    loading,
    unreadCount,
    sendInvite,
    markAsViewed,
    acceptInvite,
    dismissInvite,
    refetch: fetchInvites,
  };
}
