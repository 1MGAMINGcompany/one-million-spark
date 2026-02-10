import { useState } from 'react';
import { Copy, Check, Share2, MessageCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  copyMatchLink,
  nativeShareMatch,
  whatsappShareMatch,
  twitterShareMatch,
} from '@/lib/shareMatch';
import { isWalletInAppBrowser } from '@/lib/walletBrowserDetection';

interface ShareMatchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomPda: string;
  gameType: string;
  solWon?: number;
}

export function ShareMatchModal({
  open,
  onOpenChange,
  roomPda,
  gameType,
  solWon,
}: ShareMatchModalProps) {
  const [copied, setCopied] = useState(false);
  const inWalletBrowser = isWalletInAppBrowser();

  const handleCopy = async () => {
    const ok = await copyMatchLink(roomPda);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleNativeShare = async () => {
    await nativeShareMatch(roomPda, gameType);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-primary/30">
        <DialogHeader>
          <DialogTitle className="text-foreground">Share Your Win 🏆</DialogTitle>
          <DialogDescription>Let everyone know about your victory!</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-2">
          {/* Copy Link */}
          <Button
            variant="outline"
            className="w-full justify-start gap-3 border-border/50"
            onClick={handleCopy}
          >
            {copied ? <Check size={18} className="text-emerald-400" /> : <Copy size={18} />}
            {copied ? 'Copied!' : 'Copy Link'}
          </Button>

          {/* WhatsApp - hidden in wallet in-app browsers */}
          {!inWalletBrowser && (
            <Button
              variant="outline"
              className="w-full justify-start gap-3 border-border/50"
              asChild
            >
              <a
                href={whatsappShareMatch(roomPda, gameType)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageCircle size={18} />
                WhatsApp
              </a>
            </Button>
          )}

          {/* Twitter/X */}
          <Button
            variant="outline"
            className="w-full justify-start gap-3 border-border/50"
            asChild
          >
            <a
              href={twitterShareMatch(roomPda, gameType, solWon)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <svg viewBox="0 0 24 24" className="w-[18px] h-[18px] fill-current">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              Twitter / X
            </a>
          </Button>

          {/* Native Share */}
          {typeof navigator !== 'undefined' && 'share' in navigator && (
            <Button
              variant="outline"
              className="w-full justify-start gap-3 border-border/50"
              onClick={handleNativeShare}
            >
              <Share2 size={18} />
              More Options…
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
