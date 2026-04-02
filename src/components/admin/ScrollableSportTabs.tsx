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
  /** Use themed inline styles instead of tailwind classes */
  theme?: {
    activeBg?: string;
    activeText?: string;
    inactiveBg?: string;
    inactiveText?: string;
    countBg?: string;
  };
}

export default function ScrollableSportTabs({ groups, activeTab, onTabChange, className, theme }: ScrollableSportTabsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={scrollRef}
      className={cn(
        "flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide",
        className
      )}
      style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
    >
      {groups.map((group, gi) => (
        <div key={group.label} className="flex items-center gap-1.5 shrink-0">
          {gi > 0 && (
            <div className="w-px h-5 bg-border mx-1 shrink-0" />
          )}
          {group.tabs.map(tab => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => onTabChange(tab.key)}
                className={cn(
                  "shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap",
                  !theme && (isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50")
                )}
                style={theme ? {
                  backgroundColor: isActive ? theme.activeBg : theme.inactiveBg || "transparent",
                  color: isActive ? theme.activeText : theme.inactiveText,
                  ...(isActive ? { boxShadow: `0 2px 8px ${theme.activeBg || 'transparent'}` } : {}),
                } : undefined}
              >
                <span className="text-sm">{tab.emoji}</span>
                <span>{tab.label}</span>
                {tab.count != null && tab.count > 0 && (
                  <span
                    className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded-full min-w-[18px] text-center font-semibold",
                      !theme && (isActive ? "bg-primary/20" : "bg-muted")
                    )}
                    style={theme ? { backgroundColor: theme.countBg || "rgba(255,255,255,0.1)" } : undefined}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
