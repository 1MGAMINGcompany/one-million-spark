import { useRef } from "react";
import { cn } from "@/lib/utils";

export interface SportTab {
  key: string;
  label: string;
  emoji: string;
  count?: number;
}

export interface SportTabGroup {
  label: string;
  tabs: SportTab[];
}

interface ScrollableSportTabsProps {
  groups: SportTabGroup[];
  activeTab: string;
  onTabChange: (key: string) => void;
  className?: string;
}

export default function ScrollableSportTabs({ groups, activeTab, onTabChange, className }: ScrollableSportTabsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={scrollRef}
      className={cn(
        "flex items-center gap-1 overflow-x-auto pb-1 scrollbar-hide",
        className
      )}
      style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
    >
      {groups.map((group, gi) => (
        <div key={group.label} className="flex items-center gap-1 shrink-0">
          {gi > 0 && (
            <div className="w-px h-5 bg-border mx-1 shrink-0" />
          )}
          <span className="text-[10px] text-muted-foreground font-medium px-1 shrink-0 hidden sm:inline">
            {group.label}
          </span>
          {group.tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => onTabChange(tab.key)}
              className={cn(
                "shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap",
                activeTab === tab.key
                  ? "bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              <span>{tab.emoji}</span>
              <span>{tab.label}</span>
              {tab.count != null && tab.count > 0 && (
                <span className={cn(
                  "text-[10px] px-1 py-0.5 rounded-full min-w-[18px] text-center",
                  activeTab === tab.key ? "bg-amber-500/30" : "bg-muted"
                )}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
