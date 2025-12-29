import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, Clock, Copy, CheckCheck, Users, Link2 } from "lucide-react";
import { toast } from "sonner";

interface WaitingForOpponentPanelProps {
  onLeave: () => void;
  roomPda?: string;
}

export function WaitingForOpponentPanel({ onLeave, roomPda }: WaitingForOpponentPanelProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyLink = async () => {
    const inviteUrl = roomPda 
      ? `${window.location.origin}/room/${roomPda}`
      : window.location.href;
    
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      toast.success("Link copied! Share it with your opponent.");
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error("Failed to copy link");
    }
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 flex items-center justify-center p-4">
      <div className="bg-card border rounded-xl p-6 text-center space-y-5 max-w-sm w-full shadow-lg">
        {/* Status Icon */}
        <div className="flex justify-center">
          <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Users className="h-8 w-8 text-primary" />
          </div>
        </div>

        {/* Status Items */}
        <div className="space-y-3">
          {/* You accepted */}
          <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
            <div className="h-8 w-8 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
              <Check className="h-4 w-4 text-emerald-500" />
            </div>
            <span className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">
              You accepted the rules
            </span>
          </div>

          {/* Waiting for opponent */}
          <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
            <div className="h-8 w-8 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0 animate-pulse">
              <Clock className="h-4 w-4 text-amber-500" />
            </div>
            <span className="text-sm text-amber-600 dark:text-amber-400 font-medium">
              Waiting for opponent to accept…
            </span>
          </div>
        </div>

        {/* Info Note */}
        <p className="text-xs text-muted-foreground">
          Game starts automatically when both players accept.
        </p>

        {/* Actions */}
        <div className="flex flex-col gap-2 pt-2">
          <Button
            variant="outline"
            onClick={handleCopyLink}
            className="w-full gap-2"
          >
            {copied ? (
              <>
                <CheckCheck className="h-4 w-4 text-emerald-500" />
                Link Copied!
              </>
            ) : (
              <>
                <Link2 className="h-4 w-4" />
                Copy Invite Link
              </>
            )}
          </Button>
          
          <Button 
            variant="ghost" 
            onClick={onLeave}
            className="w-full text-muted-foreground hover:text-foreground"
          >
            Leave Match
          </Button>
        </div>
      </div>
    </div>
  );
}
