import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageCircle, X, Send, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  timestamp: number;
  isMe: boolean;
}

interface GameChatProps {
  roomId: string;
  playerAddress?: string;
  onSendMessage: (text: string) => void;
  messages: ChatMessage[];
  className?: string;
}

export const GameChat = ({
  roomId,
  playerAddress,
  onSendMessage,
  messages,
  className,
}: GameChatProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (isOpen && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  // Track unread when chat is closed
  useEffect(() => {
    if (!isOpen && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (!lastMessage.isMe) {
        setUnreadCount((prev) => prev + 1);
      }
    }
  }, [messages.length, isOpen]);

  // Clear unread when opening
  useEffect(() => {
    if (isOpen) {
      setUnreadCount(0);
    }
  }, [isOpen]);

  const handleSend = useCallback(() => {
    const text = inputValue.trim();
    if (!text) return;
    onSendMessage(text);
    setInputValue("");
    inputRef.current?.focus();
  }, [inputValue, onSendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const truncateAddress = (addr: string) => {
    if (!addr) return "Unknown";
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <div className={cn("relative", className)}>
      {/* Chat Toggle Button */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "gap-2 border-primary/30 hover:border-primary/50 transition-all",
          isOpen && "bg-primary/10"
        )}
      >
        {isOpen ? (
          <>
            <ChevronDown size={16} />
            <span className="hidden sm:inline">Hide Chat</span>
          </>
        ) : (
          <>
            <MessageCircle size={16} />
            <span className="hidden sm:inline">Chat</span>
            {unreadCount > 0 && (
              <span className="bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                {unreadCount}
              </span>
            )}
          </>
        )}
      </Button>

      {/* Chat Panel */}
      {isOpen && (
        <div className="mt-2 bg-card border border-border rounded-lg shadow-lg overflow-hidden animate-in slide-in-from-top-2 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b border-border">
            <span className="text-sm font-medium text-foreground">
              Game Chat
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => setIsOpen(false)}
            >
              <X size={14} />
            </Button>
          </div>

          {/* Messages */}
          <div className="h-48 sm:h-56 overflow-y-auto p-3 space-y-2 bg-background/50">
            {messages.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-4">
                No messages yet. Say hello!
              </p>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "flex flex-col max-w-[85%]",
                    msg.isMe ? "ml-auto items-end" : "mr-auto items-start"
                  )}
                >
                  <div
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-sm",
                      msg.isMe
                        ? "bg-primary text-primary-foreground rounded-br-sm"
                        : "bg-muted text-foreground rounded-bl-sm"
                    )}
                  >
                    {msg.text}
                  </div>
                  <span className="text-[10px] text-muted-foreground mt-0.5 px-1">
                    {msg.isMe ? "You" : truncateAddress(msg.sender)} •{" "}
                    {formatTime(msg.timestamp)}
                  </span>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-2 border-t border-border bg-muted/30">
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                className="flex-1 h-9 text-sm bg-background"
                maxLength={200}
              />
              <Button
                size="sm"
                onClick={handleSend}
                disabled={!inputValue.trim()}
                className="h-9 px-3"
              >
                <Send size={14} />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Hook to manage chat messages with WebRTC/BroadcastChannel sync
export const useChatMessages = (
  playerAddress?: string
) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const addMessage = useCallback(
    (text: string, sender: string, isMe: boolean) => {
      const newMessage: ChatMessage = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        sender,
        text,
        timestamp: Date.now(),
        isMe,
      };
      setMessages((prev) => [...prev, newMessage]);
    },
    []
  );

  const sendMessage = useCallback(
    (text: string) => {
      if (playerAddress) {
        addMessage(text, playerAddress, true);
      }
    },
    [playerAddress, addMessage]
  );

  const receiveMessage = useCallback(
    (text: string, sender: string) => {
      addMessage(text, sender, false);
    },
    [addMessage]
  );

  return {
    messages,
    sendMessage,
    receiveMessage,
  };
};
