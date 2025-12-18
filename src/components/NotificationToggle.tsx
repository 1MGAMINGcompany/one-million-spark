import React, { memo, useCallback, useState } from "react";
import { cn } from "@/lib/utils";
import { Bell, BellOff, BellRing, Smartphone } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface NotificationToggleProps {
  enabled: boolean;
  hasPermission: boolean;
  onToggle: () => Promise<void>;
  variant?: "switch" | "button" | "compact";
  showLabel?: boolean;
  className?: string;
}

// Detect iOS
const isIOS = () => {
  if (typeof window === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
};

// Check if running as PWA
const isPWA = () => {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  );
};

export const NotificationToggle = memo(function NotificationToggle({
  enabled,
  hasPermission,
  onToggle,
  variant = "switch",
  showLabel = true,
  className,
}: NotificationToggleProps) {
  const [showIOSDialog, setShowIOSDialog] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleToggle = useCallback(async () => {
    // If on iOS and not PWA, show installation dialog
    if (isIOS() && !isPWA() && !enabled) {
      setShowIOSDialog(true);
      return;
    }

    setIsLoading(true);
    try {
      await onToggle();
    } finally {
      setIsLoading(false);
    }
  }, [enabled, onToggle]);

  const Icon = enabled ? BellRing : hasPermission ? Bell : BellOff;

  if (variant === "compact") {
    return (
      <>
        <button
          onClick={handleToggle}
          disabled={isLoading}
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-colors",
            enabled
              ? "bg-primary/20 text-primary"
              : "bg-muted text-muted-foreground hover:bg-muted/80",
            isLoading && "opacity-50 cursor-not-allowed",
            className
          )}
          title={enabled ? "Turn notifications enabled" : "Turn notifications disabled"}
        >
          <Icon className="w-3.5 h-3.5" />
          {showLabel && <span>{enabled ? "On" : "Off"}</span>}
        </button>
        <IOSInstallDialog open={showIOSDialog} onOpenChange={setShowIOSDialog} />
      </>
    );
  }

  if (variant === "button") {
    return (
      <>
        <Button
          variant={enabled ? "default" : "outline"}
          size="sm"
          onClick={handleToggle}
          disabled={isLoading}
          className={cn("gap-2", className)}
        >
          <Icon className="w-4 h-4" />
          {showLabel && (
            <span>{enabled ? "Notifications On" : "Enable Notifications"}</span>
          )}
        </Button>
        <IOSInstallDialog open={showIOSDialog} onOpenChange={setShowIOSDialog} />
      </>
    );
  }

  // Default: switch variant
  return (
    <>
      <div
        className={cn(
          "flex items-center justify-between gap-3 p-3 rounded-lg border border-border bg-card/50",
          className
        )}
      >
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center",
              enabled ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
            )}
          >
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <p className="font-medium text-sm">Turn Notifications</p>
            <p className="text-xs text-muted-foreground">
              {enabled
                ? "You'll be notified when it's your turn"
                : hasPermission
                ? "Get notified when it's your turn"
                : "Allow notifications to get turn alerts"}
            </p>
          </div>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={handleToggle}
          disabled={isLoading}
        />
      </div>
      <IOSInstallDialog open={showIOSDialog} onOpenChange={setShowIOSDialog} />
    </>
  );
});

// iOS PWA Installation Dialog
function IOSInstallDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-primary" />
            Install App for Notifications
          </DialogTitle>
          <DialogDescription className="pt-2 space-y-4">
            <p>
              To receive turn notifications on iOS, please add 1M Gaming to your Home Screen.
            </p>
            <div className="bg-muted/50 rounded-lg p-4 space-y-3 text-sm">
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center flex-shrink-0 text-xs font-bold">
                  1
                </span>
                <p>
                  Tap the <strong>Share</strong> button (square with arrow) at the bottom of Safari
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center flex-shrink-0 text-xs font-bold">
                  2
                </span>
                <p>
                  Scroll down and tap <strong>"Add to Home Screen"</strong>
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center flex-shrink-0 text-xs font-bold">
                  3
                </span>
                <p>
                  Tap <strong>"Add"</strong> in the top right corner
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Once installed, open 1M Gaming from your Home Screen and enable notifications.
            </p>
          </DialogDescription>
        </DialogHeader>
        <Button onClick={() => onOpenChange(false)} className="w-full mt-2">
          Got it
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export default NotificationToggle;
