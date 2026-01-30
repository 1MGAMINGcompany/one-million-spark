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

// UUID format validator
function isUuidLike(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

// Extract token from stored value (handles raw string or JSON object)
function extractTokenFromStoredValue(value: string | null): string | null {
  if (!value) return null;

  // Case A: raw UUID stored directly
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && isUuidLike(trimmed)) {
    return trimmed;
  }

  // Case B: JSON stored session object
  try {
    const obj = JSON.parse(value);

    // Check all known patterns including nested structures
    const candidates: unknown[] = [
      obj?.session_token,
      obj?.sessionToken,
      obj?.token,
      obj?.access_token,
      obj?.session?.token,
      obj?.session?.session_token,
      obj?.data?.token,
      obj?.data?.session_token,
    ];

    for (const c of candidates) {
      if (typeof c === "string" && isUuidLike(c)) return c;
    }
  } catch {
    // not JSON
  }

  return null;
}

// Get session token from localStorage (global or room-scoped fallback)
function getSessionToken(): string | null {
  // 1) Prefer global latest
  const latest = extractTokenFromStoredValue(localStorage.getItem("session_token_latest"));
  if (latest) return latest;

  // 2) Scan all keys for known patterns
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;

    // Raw token patterns (session_token_<roomPda>)
    if (key.startsWith("session_token_") && key !== "session_token_latest") {
      const t = extractTokenFromStoredValue(localStorage.getItem(key));
      if (t) return t;
    }

    // JSON session patterns (1mg_session_<roomPda>)
    if (key.startsWith("1mg_session_")) {
      const t = extractTokenFromStoredValue(localStorage.getItem(key));
      if (t) return t;
    }
  }

  return null;
}

// Auth headers helper for edge function calls
function getAuthHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export function useGameInvites({ walletAddress, enabled = true }: UseGameInvitesOptions) {
  const [invites, setInvites] = useState<GameInvite[]>([]);
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasToken, setHasToken] = useState(true);
  const { toast } = useToast();
  const { play } = useSound();

  // Fetch pending invites via edge function
  const fetchInvites = useCallback(async () => {
    if (!walletAddress || !enabled) return;

    const token = getSessionToken();
    if (!token) {
      console.log("[GameInvites] No session token, skipping fetch");
      setHasToken(false);
      setInvites([]);
      setUnreadCount(0);
      return;
    }
    setHasToken(true);

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("list-invites", {
        body: { status: "pending", direction: "incoming" },
        headers: getAuthHeaders(token),
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Failed to fetch invites");

      const typedData = (data.invites || []) as GameInvite[];
      setInvites(typedData);
      setUnreadCount(typedData.length);
    } catch (err) {
      console.error("[GameInvites] Failed to fetch invites:", err);
    } finally {
      setLoading(false);
    }
  }, [walletAddress, enabled]);

  // Send an invite to a wallet address via edge function
  const sendInvite = useCallback(async (
    recipientWallet: string,
    roomInfo: RoomInviteInfo
  ): Promise<boolean> => {
    const token = getSessionToken();
    if (!token) {
      toast({ 
        title: "Session required", 
        description: "Create or join a game first to send invites", 
        variant: "destructive" 
      });
      return false;
    }

    // Validate recipient wallet format (basic Solana address check)
    const trimmedRecipient = recipientWallet.trim();
    if (trimmedRecipient.length < 32 || trimmedRecipient.length > 44) {
      toast({ title: "Invalid wallet", description: "Please enter a valid Solana wallet address", variant: "destructive" });
      return false;
    }

    if (walletAddress && trimmedRecipient === walletAddress) {
      toast({ title: "Can't invite yourself", description: "Enter a different wallet address", variant: "destructive" });
      return false;
    }

    try {
      const { data, error } = await supabase.functions.invoke("send-invite", {
        body: {
          recipientWallet: trimmedRecipient,
          roomPda: roomInfo.roomPda,
          gameType: roomInfo.gameName || "unknown",
          gameName: roomInfo.gameName,
          stakeSol: roomInfo.stakeSol || 0,
          winnerPayout: roomInfo.winnerPayout || 0,
          turnTimeSeconds: roomInfo.turnTimeSeconds || 60,
          maxPlayers: roomInfo.maxPlayers || 2,
          mode: roomInfo.mode || "private",
        },
        headers: getAuthHeaders(token),
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Failed to send invite");

      play("ui/notify");
      toast({ 
        title: "Invite sent! 🎉", 
        description: `${trimmedRecipient.slice(0, 6)}...${trimmedRecipient.slice(-4)} will see it when they connect.`
      });
      return true;
    } catch (err: unknown) {
      console.error("[GameInvites] Failed to send invite:", err);
      const message = err instanceof Error ? err.message : "Please try again";
      toast({ title: "Failed to send", description: message, variant: "destructive" });
      return false;
    }
  }, [walletAddress, toast, play]);

  // Mark invite as viewed (update local state only - no DB call needed)
  const markAsViewed = useCallback(async (inviteId: string) => {
    // Local state update only - the invite is already fetched
    console.log("[GameInvites] Marking invite as viewed:", inviteId);
  }, []);

  // Accept invite via edge function
  const acceptInvite = useCallback(async (inviteId: string) => {
    const token = getSessionToken();
    if (!token) {
      toast({ title: "Session required", variant: "destructive" });
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke("respond-invite", {
        body: { inviteId, action: "accept" },
        headers: getAuthHeaders(token),
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Failed to accept invite");

      // Remove from local list
      setInvites(prev => prev.filter(i => i.id !== inviteId));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error("[GameInvites] Failed to accept invite:", err);
    }
  }, [toast]);

  // Dismiss/delete invite via edge function
  const dismissInvite = useCallback(async (inviteId: string) => {
    const token = getSessionToken();
    if (!token) {
      toast({ title: "Session required", variant: "destructive" });
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke("respond-invite", {
        body: { inviteId, action: "dismiss" },
        headers: getAuthHeaders(token),
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Failed to dismiss invite");

      setInvites(prev => prev.filter(i => i.id !== inviteId));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error("[GameInvites] Failed to dismiss invite:", err);
    }
  }, [toast]);

  // Initial fetch
  useEffect(() => {
    fetchInvites();
  }, [fetchInvites]);

  // Polling fallback (30s when visible) - replaces realtime subscription
  useEffect(() => {
    if (!walletAddress || !enabled) return;

    const interval = setInterval(() => {
      // Only poll when page is visible
      if (document.visibilityState === 'visible') {
        fetchInvites();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [walletAddress, enabled, fetchInvites]);

  return {
    invites,
    loading,
    unreadCount,
    hasToken,
    sendInvite,
    markAsViewed,
    acceptInvite,
    dismissInvite,
    refetch: fetchInvites,
  };
}
