import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, Check, ExternalLink, Image, Share2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ShareWinModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomPda: string;
  gameType: string;
  isVoid?: boolean;
}

export function ShareWinModal({ open, onOpenChange, roomPda, gameType, isVoid = false }: ShareWinModalProps) {
  const { toast } = useToast();
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedImage, setCopiedImage] = useState(false);

  const shareUrl = `https://one-million-spark.lovable.app/match/${roomPda}`;
  const ogImageUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/match-og?roomPda=${encodeURIComponent(roomPda)}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      toast({ title: "Link copied!", description: "Share your victory!" });
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  const handleCopyImageLink = async () => {
    try {
      await navigator.clipboard.writeText(ogImageUrl);
      setCopiedImage(true);
      toast({ title: "Image link copied!", description: "Use this for embeds" });
      setTimeout(() => setCopiedImage(false), 2000);
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  const gameLabel = gameType.charAt(0).toUpperCase() + gameType.slice(1);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-primary/20">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Share2 className="h-5 w-5 text-primary" />
            {isVoid ? "Share Match" : "Share Your Win"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* OG Image Preview */}
          <div className="rounded-lg overflow-hidden border border-border/50 bg-muted/20">
            <img
              src={ogImageUrl}
              alt={`${gameLabel} match result`}
              className="w-full h-auto"
              loading="lazy"
            />
          </div>

          {/* Share Link */}
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
              Share Link
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={shareUrl}
                readOnly
                className="flex-1 bg-background/50 border border-border rounded-md px-3 py-2 text-sm font-mono text-muted-foreground truncate"
              />
              <Button
                size="sm"
                onClick={handleCopyLink}
                className="shrink-0"
              >
                {copiedLink ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <Button onClick={handleCopyLink} className="flex-1 gap-2">
              {copiedLink ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copiedLink ? "Copied!" : "Copy Share Link"}
            </Button>
            <Button onClick={handleCopyImageLink} variant="outline" className="flex-1 gap-2">
              {copiedImage ? <Check className="h-4 w-4" /> : <Image className="h-4 w-4" />}
              {copiedImage ? "Copied!" : "Copy Image Link"}
            </Button>
          </div>

          {/* View Match Page Link */}
          <div className="text-center pt-2">
            <a
              href={shareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              View Match Page
            </a>
          </div>

          {/* Sharing Tips */}
          <p className="text-xs text-center text-muted-foreground pt-2 border-t border-border/30">
            Share on X, Discord, or Telegram for a rich preview card!
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
