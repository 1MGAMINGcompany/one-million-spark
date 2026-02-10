import { useState } from 'react';
import { Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { nativeShareMatch } from '@/lib/shareMatch';
import { ShareMatchModal } from '@/components/ShareMatchModal';
import { useIsMobile } from '@/hooks/use-mobile';

interface ShareMatchButtonProps {
  roomPda: string;
  gameType: string;
  solWon?: number;
}

export function ShareMatchButton({ roomPda, gameType, solWon }: ShareMatchButtonProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const isMobile = useIsMobile();

  const handleShare = async () => {
    if (isMobile) {
      const shared = await nativeShareMatch(roomPda, gameType);
      if (!shared) {
        setModalOpen(true);
      }
    } else {
      setModalOpen(true);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={handleShare}
        className="gap-2 border-primary/30 text-primary hover:bg-primary/10"
      >
        <Share2 size={16} />
        Share Win
      </Button>
      <ShareMatchModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        roomPda={roomPda}
        gameType={gameType}
        solWon={solWon}
      />
    </>
  );
}
