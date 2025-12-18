import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { Bell, X, Clock, User, Trophy, WifiOff, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { TurnEvent } from "@/hooks/useTurnNotifications";

interface TurnHistoryDrawerProps {
  events: TurnEvent[];
  onEventClick?: (event: TurnEvent) => void;
  unreadCount?: number;
  className?: string;
}

const EVENT_ICONS: Record<TurnEvent["type"], React.ReactNode> = {
  turn_change: <Clock className="w-4 h-4" />,
  player_moved: <User className="w-4 h-4" />,
  player_finished: <Trophy className="w-4 h-4 text-green-500" />,
  player_disconnected: <WifiOff className="w-4 h-4 text-red-500" />,
};

const PLAYER_COLORS: Record<string, string> = {
  gold: "text-yellow-400",
  ruby: "text-red-400",
  emerald: "text-emerald-400",
  sapphire: "text-blue-400",
  red: "text-red-400",
  green: "text-emerald-400",
  blue: "text-blue-400",
  yellow: "text-yellow-400",
};

function formatTimestamp(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  
  if (diff < 60000) {
    return "Just now";
  } else if (diff < 3600000) {
    const mins = Math.floor(diff / 60000);
    return `${mins}m ago`;
  } else {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
}

export function TurnHistoryDrawer({
  events,
  onEventClick,
  unreadCount = 0,
  className,
}: TurnHistoryDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Trigger Button */}
      <Button
        variant="ghost"
        size="icon"
        className={cn("relative", className)}
        onClick={() => setIsOpen(true)}
        aria-label="Turn history"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary text-primary-foreground text-xs font-bold rounded-full flex items-center justify-center animate-pulse">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </Button>

      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Drawer */}
      <div
        className={cn(
          "fixed top-0 right-0 h-full w-80 max-w-[85vw] bg-card border-l border-border shadow-2xl z-50 transform transition-transform duration-300 ease-out",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-primary" />
            <h2 className="font-semibold text-lg">Turn History</h2>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsOpen(false)}
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Content */}
        <ScrollArea className="h-[calc(100%-4rem)]">
          {events.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
              <Bell className="w-8 h-8 mb-2 opacity-50" />
              <p className="text-sm">No events yet</p>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {events.map((event) => {
                const colorClass = event.playerColor
                  ? PLAYER_COLORS[event.playerColor.toLowerCase()]
                  : "text-foreground";

                return (
                  <button
                    key={event.id}
                    className={cn(
                      "w-full flex items-start gap-3 p-3 rounded-lg text-left transition-colors",
                      "hover:bg-muted/50 active:bg-muted",
                      onEventClick && "cursor-pointer"
                    )}
                    onClick={() => onEventClick?.(event)}
                    disabled={!onEventClick}
                  >
                    <div
                      className={cn(
                        "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
                        event.type === "turn_change" && "bg-primary/20 text-primary",
                        event.type === "player_moved" && "bg-muted text-muted-foreground",
                        event.type === "player_finished" && "bg-green-500/20",
                        event.type === "player_disconnected" && "bg-red-500/20"
                      )}
                    >
                      {EVENT_ICONS[event.type]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-sm font-medium truncate", colorClass)}>
                        {event.message}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatTimestamp(event.timestamp)}
                      </p>
                    </div>
                    {onEventClick && (
                      <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </div>
    </>
  );
}

export default TurnHistoryDrawer;
