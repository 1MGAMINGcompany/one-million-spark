import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  MessageCircle,
  Send,
  AtSign,
  Smile,
  Copy,
  Check,
  ChevronRight,
  ChevronLeft,
  X,
  Bell,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import {
  GameChatReturn,
  ChatMessage,
  ChatPlayer,
  generateAvatar,
  truncateWallet,
} from "@/hooks/useGameChat";
import { useIsMobile } from "@/hooks/use-mobile";

interface GameChatPanelProps {
  chat: GameChatReturn;
  className?: string;
}

// Emoji options for quick reactions
const QUICK_EMOJIS = ["👍", "👎", "🎉", "🔥", "💀", "😂", "🤔", "👀"];

// Format timestamp
const formatTime = (timestamp: number): string => {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
};

// Avatar component
const PlayerAvatar = ({ wallet, size = "sm" }: { wallet: string; size?: "sm" | "md" }) => {
  const gradient = generateAvatar(wallet);
  const sizeClasses = size === "sm" ? "w-6 h-6 text-[10px]" : "w-8 h-8 text-xs";
  
  return (
    <div
      className={cn(
        "rounded-full flex items-center justify-center font-bold text-white bg-gradient-to-br",
        gradient,
        sizeClasses
      )}
    >
      {wallet.slice(2, 4).toUpperCase()}
    </div>
  );
};

// Single message component
const MessageItem = ({
  message,
  players,
  myWallet,
  onCopyAddress,
}: {
  message: ChatMessage;
  players: ChatPlayer[];
  myWallet?: string;
  onCopyAddress: (address: string) => void;
}) => {
  const isSystem = message.type === "system";
  const isMentioned = myWallet && message.mentions.includes(myWallet);
  
  if (isSystem) {
    return (
      <div className="flex items-center justify-center py-1">
        <span className="text-xs text-muted-foreground/70 bg-muted/30 px-3 py-1 rounded-full">
          {message.text}
        </span>
      </div>
    );
  }
  
  // Highlight mentions in text
  const highlightMentions = (text: string): React.ReactNode => {
    const mentionRegex = /@(\w+|0x[a-fA-F0-9]+[…\.]+[a-fA-F0-9]+)/g;
    const parts = text.split(mentionRegex);
    
    return parts.map((part, i) => {
      if (i % 2 === 1) {
        // This is a mention
        return (
          <span key={i} className="text-primary font-medium bg-primary/10 px-1 rounded">
            @{part}
          </span>
        );
      }
      return part;
    });
  };
  
  return (
    <div
      className={cn(
        "group flex gap-2 py-1.5 px-2 rounded-lg transition-colors",
        message.isMe ? "flex-row-reverse" : "",
        isMentioned && "bg-primary/10 border border-primary/20"
      )}
    >
      {/* Avatar */}
      <div className="flex-shrink-0 mt-0.5">
        <Popover>
          <PopoverTrigger asChild>
            <button className="hover:ring-2 hover:ring-primary/50 rounded-full transition-all">
              <PlayerAvatar wallet={message.wallet} />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-2" side="top">
            <div className="flex items-center gap-2 mb-2">
              <PlayerAvatar wallet={message.wallet} size="md" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{message.displayName}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {truncateWallet(message.wallet)}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs"
              onClick={() => onCopyAddress(message.wallet)}
            >
              <Copy className="w-3 h-3 mr-1" />
              {/* Copy Address is kept simple */}
              Copy
            </Button>
          </PopoverContent>
        </Popover>
      </div>
      
      {/* Message content */}
      <div className={cn("flex-1 min-w-0", message.isMe ? "text-right" : "")}>
        <div className="flex items-baseline gap-2 mb-0.5">
          {!message.isMe && (
            <span className="text-xs font-medium text-foreground">
              {message.displayName}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground">
            {formatTime(message.timestamp)}
          </span>
        </div>
        <div
          className={cn(
            "inline-block px-3 py-1.5 rounded-2xl text-sm break-words max-w-[85%]",
            message.isMe
              ? "bg-primary text-primary-foreground rounded-br-sm"
              : "bg-muted text-foreground rounded-bl-sm"
          )}
        >
          {highlightMentions(message.text)}
        </div>
      </div>
    </div>
  );
};

// Mention picker component
const MentionPicker = ({
  players,
  myWallet,
  onSelect,
}: {
  players: ChatPlayer[];
  myWallet?: string;
  onSelect: (tag: string) => void;
}) => {
  const { t } = useTranslation();
  const otherPlayers = players.filter(
    (p) => p.wallet.toLowerCase() !== myWallet?.toLowerCase()
  );
  
  if (otherPlayers.length === 0) return null;
  
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
          <AtSign className="w-4 h-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-2" side="top" align="start">
        <p className="text-xs text-muted-foreground mb-2 px-1">{t("chat.tagPlayer")}</p>
        <div className="space-y-1">
          {otherPlayers.map((player) => (
            <button
              key={player.wallet}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted transition-colors text-left"
              onClick={() => onSelect(`@${player.color || truncateWallet(player.wallet)}`)}
            >
              <PlayerAvatar wallet={player.wallet} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{player.displayName}</p>
                <p className="text-xs text-muted-foreground">
                  {player.color ? `@${player.color}` : ""}
                </p>
              </div>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};

// Emoji picker component
const EmojiPicker = ({ onSelect }: { onSelect: (emoji: string) => void }) => {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
          <Smile className="w-4 h-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" side="top" align="start">
        <div className="flex gap-1">
          {QUICK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              className="w-8 h-8 flex items-center justify-center hover:bg-muted rounded transition-colors text-lg"
              onClick={() => onSelect(emoji)}
            >
              {emoji}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};

// Chat input component
const ChatInput = ({
  chat,
  onSend,
}: {
  chat: GameChatReturn;
  onSend: () => void;
}) => {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  
  const handleSend = useCallback(() => {
    if (!input.trim()) return;
    
    const result = chat.sendMessage(input);
    if (result.success) {
      setInput("");
      onSend();
    } else if (result.error) {
      toast({
        title: "Error",
        description: result.error,
        variant: "destructive",
      });
    }
  }, [input, chat, onSend]);
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };
  
  const insertText = (text: string) => {
    const newValue = input + (input && !input.endsWith(" ") ? " " : "") + text + " ";
    setInput(newValue);
    inputRef.current?.focus();
  };
  
  return (
    <div className="p-2 border-t border-border bg-background/80">
      <div className="flex items-center gap-1">
        <MentionPicker
          players={chat.players}
          myWallet={chat.myWallet}
          onSelect={insertText}
        />
        <EmojiPicker onSelect={insertText} />
        <Input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message..."
          className="flex-1 h-9 text-sm bg-muted/30"
          maxLength={280}
        />
        <Button
          size="sm"
          onClick={handleSend}
          disabled={!input.trim()}
          className="h-9 px-3"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground text-right mt-1">
        {input.length}/280
      </p>
    </div>
  );
};

// Messages list component
const MessagesList = ({ chat }: { chat: GameChatReturn }) => {
  const { t } = useTranslation();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat.messages]);
  
  const handleCopyAddress = useCallback((address: string) => {
    navigator.clipboard.writeText(address);
    toast({
      title: "Copied!",
      description: "Address copied",
    });
  }, []);
  
  return (
    <ScrollArea className="flex-1 p-2">
      {chat.messages.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full py-8 text-muted-foreground">
          <MessageCircle className="w-8 h-8 mb-2 opacity-50" />
          <p className="text-sm">{t("chat.noMessages")}</p>
          <p className="text-xs">{t("chat.sayHello")}</p>
        </div>
      ) : (
        <div className="space-y-1">
          {chat.messages.map((msg) => (
            <MessageItem
              key={msg.id}
              message={msg}
              players={chat.players}
              myWallet={chat.myWallet}
              onCopyAddress={handleCopyAddress}
            />
          ))}
          <div ref={messagesEndRef} />
        </div>
      )}
    </ScrollArea>
  );
};

// Desktop panel component
const DesktopChatPanel = ({ chat }: { chat: GameChatReturn }) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState<string | null>(null);
  
  const handleSend = useCallback(() => {
    // Scroll handled by MessagesList
  }, []);
  
  return (
    <div
      className={cn(
        "fixed right-0 top-0 h-screen bg-card border-l border-border shadow-xl transition-all duration-300 z-40 flex flex-col",
        chat.isOpen ? "w-80" : "w-0"
      )}
    >
      {chat.isOpen && (
        <>
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-primary" />
              <span className="font-medium text-sm">{t("chat.chat")}</span>
              <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                {chat.players.length}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0 border-border hover:bg-destructive/20 hover:border-destructive hover:text-destructive"
              onClick={() => chat.setIsOpen(false)}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
          
          {/* Players list */}
          <div className="px-3 py-2 border-b border-border bg-muted/10">
            <p className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
              <Users className="w-3 h-3" />
            </p>
            <div className="flex gap-2">
              {chat.players.map((player) => (
                <div
                  key={player.wallet}
                  className="flex items-center gap-1.5 bg-muted/50 px-2 py-1 rounded-full"
                >
                  <PlayerAvatar wallet={player.wallet} />
                  <span className="text-xs font-medium">{player.displayName}</span>
                  {player.color && (
                    <span className="text-[10px] text-muted-foreground">
                      ({player.color})
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
          
          {/* Messages */}
          <MessagesList chat={chat} />
          
          {/* Input */}
          <ChatInput chat={chat} onSend={handleSend} />
        </>
      )}
    </div>
  );
};

// Toggle button component
const ChatToggleButton = ({ chat }: { chat: GameChatReturn }) => {
  const isMobile = useIsMobile();
  
  if (isMobile) return null;
  
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => chat.setIsOpen(!chat.isOpen)}
      className={cn(
        "fixed right-4 bottom-4 z-50 gap-2 shadow-lg border-primary/30 hover:border-primary/50",
        chat.isOpen && "opacity-0 pointer-events-none"
      )}
    >
      <MessageCircle className="w-4 h-4" />
      Chat
      {(chat.unreadCount > 0 || chat.unreadMentions > 0) && (
        <span
          className={cn(
            "px-1.5 py-0.5 rounded-full text-xs min-w-[18px] text-center",
            chat.unreadMentions > 0
              ? "bg-red-500 text-white animate-pulse"
              : "bg-primary text-primary-foreground"
          )}
        >
          {chat.unreadMentions > 0 ? `@${chat.unreadMentions}` : chat.unreadCount}
        </span>
      )}
    </Button>
  );
};

// Mobile drawer component - Uses pointer-events-none on trigger when open to not block board
const MobileChatDrawer = ({ chat }: { chat: GameChatReturn }) => {
  const handleSend = useCallback(() => {
    // Scroll handled by MessagesList
  }, []);
  
  return (
    <Sheet open={chat.isOpen} onOpenChange={chat.setIsOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "fixed bottom-4 right-4 z-50 gap-2 shadow-lg border-primary/30",
            chat.isOpen && "pointer-events-none opacity-0"
          )}
        >
          <MessageCircle className="w-4 h-4" />
          Chat
          {(chat.unreadCount > 0 || chat.unreadMentions > 0) && (
            <span
              className={cn(
                "px-1.5 py-0.5 rounded-full text-xs min-w-[18px] text-center",
                chat.unreadMentions > 0
                  ? "bg-red-500 text-white animate-pulse"
                  : "bg-primary text-primary-foreground"
              )}
            >
              {chat.unreadMentions > 0 ? `@${chat.unreadMentions}` : chat.unreadCount}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="h-[60vh] max-h-[60vh] p-0 flex flex-col pointer-events-auto">
        <SheetHeader className="px-4 py-3 border-b border-border flex-shrink-0">
          <SheetTitle className="flex items-center gap-2 text-base">
            <MessageCircle className="w-4 h-4 text-primary" />
            Chat
            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded ml-auto mr-2">
              {chat.players.length}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 hover:bg-destructive/10 hover:text-destructive ml-auto"
              onClick={() => chat.setIsOpen(false)}
            >
              <X className="w-4 h-4" />
            </Button>
          </SheetTitle>
        </SheetHeader>
        
        {/* Players */}
        <div className="px-4 py-2 border-b border-border bg-muted/10">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {chat.players.map((player) => (
              <div
                key={player.wallet}
                className="flex items-center gap-1.5 bg-muted/50 px-2 py-1 rounded-full flex-shrink-0"
              >
                <PlayerAvatar wallet={player.wallet} />
                <span className="text-xs font-medium">{player.displayName}</span>
              </div>
            ))}
          </div>
        </div>
        
        {/* Messages */}
        <MessagesList chat={chat} />
        
        {/* Input */}
        <ChatInput chat={chat} onSend={handleSend} />
      </SheetContent>
    </Sheet>
  );
};

// Main export component
export const GameChatPanel = ({ chat, className }: GameChatPanelProps) => {
  const isMobile = useIsMobile();
  
  if (isMobile) {
    return <MobileChatDrawer chat={chat} />;
  }
  
  return (
    <>
      <ChatToggleButton chat={chat} />
      <DesktopChatPanel chat={chat} />
    </>
  );
};

export default GameChatPanel;
