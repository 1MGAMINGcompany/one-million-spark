import { useState } from "react";
import { Share2, Trophy, BarChart2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { ShareMatchModal } from "@/components/ShareMatchModal";
import { nativeShare, isNativeShareAvailable, getGameDisplayName } from "@/lib/shareMatch";

interface ShareMatchButtonProps {
  roomPda: string;
  isWinner: boolean;
  gameName: string;
  className?: string;
}

export function ShareMatchButton({ roomPda, isWinner, gameName, className = "" }: ShareMatchButtonProps) {
  const { t } = useTranslation();
  const [modalOpen, setModalOpen] = useState(false);
  const [sharing, setSharing] = useState(false);

  const handleClick = async () => {
    // Try native share first on mobile
    if (isNativeShareAvailable()) {
      setSharing(true);
      const shared = await nativeShare(roomPda, isWinner, getGameDisplayName(gameName));
      setSharing(false);
      
      if (shared) {
        return; // Native share succeeded
      }
    }
    
    // Fallback to modal
    setModalOpen(true);
  };

  return (
    <>
      <Button
        onClick={handleClick}
        disabled={sharing}
        className={`gap-2 ${
          isWinner 
            ? "bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black font-semibold" 
            : "bg-muted hover:bg-muted/80 text-foreground"
        } ${className}`}
      >
        {isWinner ? (
          <>
            <Trophy className="w-4 h-4" />
            {t("shareMatch.shareWin", "Share Win")}
          </>
        ) : (
          <>
            <BarChart2 className="w-4 h-4" />
            {t("shareMatch.shareMatch", "Share Match")}
          </>
        )}
        <Share2 className="w-4 h-4" />
      </Button>

      <ShareMatchModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        roomPda={roomPda}
        isWinner={isWinner}
        gameName={gameName}
      />
    </>
  );
}
