import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Send, Loader2, Check, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RoomInviteInfo } from "@/lib/invite";
import { useGameInvites } from "@/hooks/useGameInvites";

interface SendToWalletInputProps {
  senderWallet: string;
  roomInfo: RoomInviteInfo;
}

export function SendToWalletInput({ senderWallet, roomInfo }: SendToWalletInputProps) {
  const { t } = useTranslation();
  const [recipientWallet, setRecipientWallet] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [justSent, setJustSent] = useState(false);
  
  const { sendInvite } = useGameInvites({ 
    walletAddress: senderWallet, 
    enabled: !!senderWallet 
  });

  const handleSend = async () => {
    if (!recipientWallet.trim() || isSending) return;
    
    setIsSending(true);
    try {
      const success = await sendInvite(recipientWallet, roomInfo);
      if (success) {
        setJustSent(true);
        setRecipientWallet("");
        setTimeout(() => setJustSent(false), 3000);
      }
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isSending && recipientWallet.trim()) {
      handleSend();
    }
  };

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium flex items-center gap-2">
        <User className="h-4 w-4" />
        {t("shareInvite.restrictToWallet", "Restrict to wallet (optional)")}
      </Label>
      
      <div className="flex gap-2">
        <Input
          placeholder={t("shareInvite.walletPlaceholder", "Enter friend's Solana wallet...")}
          value={recipientWallet}
          onChange={(e) => setRecipientWallet(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 bg-muted/50 border-primary/20 text-sm"
          disabled={isSending}
        />
        
        <Button
          size="icon"
          onClick={handleSend}
          disabled={isSending || !recipientWallet.trim()}
          className={`shrink-0 transition-colors ${
            justSent 
              ? "bg-green-500 hover:bg-green-500" 
              : "bg-primary hover:bg-primary/90"
          }`}
        >
          {isSending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : justSent ? (
            <Check className="h-4 w-4" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
      
      <p className="text-xs text-muted-foreground">
        {t("shareInvite.restrictHint", "Only this wallet can join. Share the link to deliver the invite.")}
      </p>
    </div>
  );
}
