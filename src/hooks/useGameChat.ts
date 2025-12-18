import { useState, useCallback, useEffect, useRef } from "react";
import { useSound } from "@/contexts/SoundContext";

export interface ChatMessage {
  id: string;
  roomId: string;
  wallet: string;
  displayName: string;
  text: string;
  timestamp: number;
  type: "user" | "system";
  mentions: string[];
  isMe: boolean;
}

export interface ChatPlayer {
  wallet: string;
  displayName: string;
  color: string;
  seatIndex: number;
}

interface UseGameChatOptions {
  roomId: string;
  myWallet?: string;
  players: ChatPlayer[];
  onSendMessage?: (message: ChatMessage) => void;
  enabled?: boolean;
}

// Rate limit: max 5 messages per 10 seconds
const RATE_LIMIT_COUNT = 5;
const RATE_LIMIT_WINDOW = 10000;
const MAX_MESSAGE_LENGTH = 280;

// Storage key for messages
const getStorageKey = (roomId: string) => `game_chat_${roomId}`;

// Generate avatar based on wallet
export const generateAvatar = (wallet: string): string => {
  const colors = [
    "from-amber-500 to-orange-600",
    "from-emerald-500 to-teal-600",
    "from-blue-500 to-indigo-600",
    "from-purple-500 to-pink-600",
    "from-red-500 to-rose-600",
    "from-cyan-500 to-sky-600",
  ];
  const hash = wallet.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[hash % colors.length];
};

// Truncate wallet address
export const truncateWallet = (wallet: string): string => {
  if (!wallet || wallet.length < 10) return wallet || "Unknown";
  return `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
};

// Parse mentions from text
const parseMentions = (text: string, players: ChatPlayer[]): string[] => {
  const mentions: string[] = [];
  
  // Match @Color patterns (e.g., @Gold, @Red, @Blue)
  const colorPattern = /@(Gold|Red|Blue|Green|Obsidian|White|Black)/gi;
  const colorMatches = text.match(colorPattern);
  if (colorMatches) {
    colorMatches.forEach((match) => {
      const color = match.slice(1).toLowerCase();
      const player = players.find((p) => p.color.toLowerCase() === color);
      if (player) mentions.push(player.wallet);
    });
  }
  
  // Match @0xABCD…1234 patterns
  const walletPattern = /@(0x[a-fA-F0-9]{4,6}[…\.]{1,3}[a-fA-F0-9]{4})/g;
  const walletMatches = text.match(walletPattern);
  if (walletMatches) {
    walletMatches.forEach((match) => {
      const shortWallet = match.slice(1);
      const player = players.find((p) => 
        truncateWallet(p.wallet).toLowerCase() === shortWallet.toLowerCase()
      );
      if (player) mentions.push(player.wallet);
    });
  }
  
  // Match @Seat1, @Seat2, etc.
  const seatPattern = /@Seat(\d+)/gi;
  const seatMatches = text.match(seatPattern);
  if (seatMatches) {
    seatMatches.forEach((match) => {
      const seatNum = parseInt(match.slice(5)) - 1;
      const player = players.find((p) => p.seatIndex === seatNum);
      if (player) mentions.push(player.wallet);
    });
  }
  
  return [...new Set(mentions)];
};

export function useGameChat({
  roomId,
  myWallet,
  players,
  onSendMessage,
  enabled = true,
}: UseGameChatOptions) {
  const { play } = useSound();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadMentions, setUnreadMentions] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const messageTimes = useRef<number[]>([]);

  // Load messages from localStorage on mount
  useEffect(() => {
    if (!roomId) return;
    
    try {
      const stored = localStorage.getItem(getStorageKey(roomId));
      if (stored) {
        const parsed = JSON.parse(stored) as ChatMessage[];
        // Re-calculate isMe for loaded messages
        const updated = parsed.map((msg) => ({
          ...msg,
          isMe: msg.wallet.toLowerCase() === myWallet?.toLowerCase(),
        }));
        setMessages(updated);
      }
    } catch (e) {
      console.error("[GameChat] Failed to load messages:", e);
    }
  }, [roomId, myWallet]);

  // Save messages to localStorage
  useEffect(() => {
    if (!roomId || messages.length === 0) return;
    
    try {
      // Keep only last 100 messages
      const toStore = messages.slice(-100);
      localStorage.setItem(getStorageKey(roomId), JSON.stringify(toStore));
    } catch (e) {
      console.error("[GameChat] Failed to save messages:", e);
    }
  }, [roomId, messages]);

  // Clear unread when opening chat
  useEffect(() => {
    if (isOpen) {
      setUnreadCount(0);
      setUnreadMentions(0);
    }
  }, [isOpen]);

  // Check rate limit
  const checkRateLimit = useCallback((): boolean => {
    const now = Date.now();
    // Remove old timestamps
    messageTimes.current = messageTimes.current.filter(
      (t) => now - t < RATE_LIMIT_WINDOW
    );
    
    if (messageTimes.current.length >= RATE_LIMIT_COUNT) {
      return false;
    }
    
    messageTimes.current.push(now);
    return true;
  }, []);

  // Get player by wallet
  const getPlayer = useCallback(
    (wallet: string): ChatPlayer | undefined => {
      return players.find((p) => p.wallet.toLowerCase() === wallet.toLowerCase());
    },
    [players]
  );

  // Check if wallet is a player in the room
  const isPlayerInRoom = useCallback(
    (wallet: string): boolean => {
      return players.some((p) => p.wallet.toLowerCase() === wallet.toLowerCase());
    },
    [players]
  );

  // Send a user message
  const sendMessage = useCallback(
    (text: string): { success: boolean; error?: string } => {
      if (!enabled || !myWallet) {
        return { success: false, error: "Chat not enabled" };
      }
      
      if (!isPlayerInRoom(myWallet)) {
        return { success: false, error: "You are not a player in this room" };
      }
      
      const trimmedText = text.trim();
      if (!trimmedText) {
        return { success: false, error: "Message cannot be empty" };
      }
      
      if (trimmedText.length > MAX_MESSAGE_LENGTH) {
        return { success: false, error: `Message too long (max ${MAX_MESSAGE_LENGTH} chars)` };
      }
      
      if (!checkRateLimit()) {
        return { success: false, error: "Slow down! Max 5 messages per 10 seconds" };
      }
      
      const player = getPlayer(myWallet);
      const mentions = parseMentions(trimmedText, players);
      
      const message: ChatMessage = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        roomId,
        wallet: myWallet,
        displayName: player?.displayName || truncateWallet(myWallet),
        text: trimmedText,
        timestamp: Date.now(),
        type: "user",
        mentions,
        isMe: true,
      };
      
      setMessages((prev) => [...prev, message]);
      onSendMessage?.(message);
      
      return { success: true };
    },
    [enabled, myWallet, roomId, players, isPlayerInRoom, checkRateLimit, getPlayer, onSendMessage]
  );

  // Receive a message from another player
  const receiveMessage = useCallback(
    (message: Omit<ChatMessage, "isMe">) => {
      // Validate sender is a player
      if (!isPlayerInRoom(message.wallet)) {
        console.warn("[GameChat] Rejected message from non-player:", message.wallet);
        return;
      }
      
      const isMe = message.wallet.toLowerCase() === myWallet?.toLowerCase();
      
      // Don't add duplicate messages
      setMessages((prev) => {
        if (prev.some((m) => m.id === message.id)) return prev;
        return [...prev, { ...message, isMe }];
      });
      
      // Update unread counts if chat is closed
      if (!isOpen && !isMe) {
        setUnreadCount((prev) => prev + 1);
        
        // Check if current user was mentioned
        if (myWallet && message.mentions.includes(myWallet)) {
          setUnreadMentions((prev) => prev + 1);
          play("ui/notify");
        } else if (message.type === "user") {
          play("ui/notify");
        }
      }
    },
    [myWallet, isOpen, isPlayerInRoom, play]
  );

  // Add a system message
  const addSystemMessage = useCallback(
    (text: string) => {
      const message: ChatMessage = {
        id: `sys-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        roomId,
        wallet: "system",
        displayName: "System",
        text,
        timestamp: Date.now(),
        type: "system",
        mentions: [],
        isMe: false,
      };
      
      setMessages((prev) => [...prev, message]);
    },
    [roomId]
  );

  // Generate mention tag for a player
  const getMentionTag = useCallback(
    (wallet: string): string => {
      const player = getPlayer(wallet);
      if (player?.color) {
        return `@${player.color}`;
      }
      return `@${truncateWallet(wallet)}`;
    },
    [getPlayer]
  );

  // Clear chat (for testing/admin)
  const clearChat = useCallback(() => {
    setMessages([]);
    localStorage.removeItem(getStorageKey(roomId));
  }, [roomId]);

  return {
    messages,
    sendMessage,
    receiveMessage,
    addSystemMessage,
    isOpen,
    setIsOpen,
    unreadCount,
    unreadMentions,
    getMentionTag,
    getPlayer,
    isPlayerInRoom,
    clearChat,
    players,
    myWallet,
  };
}

export type GameChatReturn = ReturnType<typeof useGameChat>;
