import { useState } from "react";
import { Copy, Share2, Mail, MessageCircle, Facebook, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useSound } from "@/contexts/SoundContext";
import {
  buildInviteLink,
  shareInvite,
  whatsappInvite,
  facebookInvite,
  emailInvite,
  copyInviteLink,
} from "@/lib/invite";

interface ShareInviteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomId: string;
  gameName?: string;
}

export function ShareInviteDialog({
  open,
  onOpenChange,
  roomId,
  gameName,
}: ShareInviteDialogProps) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const { play } = useSound();

  const inviteLink = buildInviteLink({ roomId });

  const handleCopy = async () => {
    try {
      await copyInviteLink(inviteLink);
      setCopied(true);
      play("ui/click");
      toast({
        title: "Link copied!",
        description: "Share this link with friends to invite them.",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: "Failed to copy",
        description: "Please copy the link manually.",
        variant: "destructive",
      });
    }
  };

  const handleNativeShare = async () => {
    try {
      await shareInvite(inviteLink, gameName);
      play("ui/click");
    } catch {
      handleCopy();
    }
  };

  const handleWhatsApp = () => {
    play("ui/click");
    whatsappInvite(inviteLink, gameName);
  };

  const handleFacebook = () => {
    play("ui/click");
    facebookInvite(inviteLink);
  };

  const handleEmail = () => {
    play("ui/click");
    emailInvite(inviteLink, gameName);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md border-primary/30 bg-background">
        <DialogHeader>
          <DialogTitle className="text-primary font-cinzel">
            Invite Players
          </DialogTitle>
          <DialogDescription>
            Share this private room with friends and family.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Copy Link Input */}
          <div className="flex items-center gap-2">
            <Input
              readOnly
              value={inviteLink}
              className="bg-muted/50 border-primary/20 text-sm"
            />
            <Button
              size="icon"
              variant="outline"
              onClick={handleCopy}
              className="shrink-0 border-primary/30 hover:bg-primary/10"
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Share Buttons */}
          <div className="grid grid-cols-2 gap-3">
            {"share" in navigator && (
              <Button
                variant="outline"
                onClick={handleNativeShare}
                className="border-primary/30 hover:bg-primary/10 gap-2"
              >
                <Share2 className="h-4 w-4" />
                Share
              </Button>
            )}

            <Button
              variant="outline"
              onClick={handleWhatsApp}
              className="border-green-500/50 hover:bg-green-500/10 text-green-500 gap-2"
            >
              <MessageCircle className="h-4 w-4" />
              WhatsApp
            </Button>

            <Button
              variant="outline"
              onClick={handleFacebook}
              className="border-blue-500/50 hover:bg-blue-500/10 text-blue-500 gap-2"
            >
              <Facebook className="h-4 w-4" />
              Facebook
            </Button>

            <Button
              variant="outline"
              onClick={handleEmail}
              className="border-primary/30 hover:bg-primary/10 gap-2"
            >
              <Mail className="h-4 w-4" />
              Email
            </Button>
          </div>

          <p className="text-xs text-muted-foreground text-center">
            Room #{roomId} • Players will need to connect their wallet to join
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
