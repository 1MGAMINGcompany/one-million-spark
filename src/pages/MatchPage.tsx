import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Loader2, ExternalLink, Gamepad2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MatchShareCard, MatchData, WinnerProfile } from "@/components/MatchShareCard";
import { ShareMatchButton } from "@/components/ShareMatchButton";
import GoldConfettiExplosion from "@/components/GoldConfettiExplosion";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useWallet } from "@solana/wallet-adapter-react";
import { copyMatchLink, buildMatchShareUrl, isNativeShareAvailable, buildWhatsAppShareUrl, getGameDisplayName } from "@/lib/shareMatch";
import { Copy, Check, MessageCircle, Share2 } from "lucide-react";
import { toast } from "sonner";

export default function MatchPage() {
  const { roomPda } = useParams<{ roomPda: string }>();
  const { t } = useTranslation();
  const { publicKey } = useWallet();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [matchData, setMatchData] = useState<MatchData | null>(null);
  const [winnerProfile, setWinnerProfile] = useState<WinnerProfile | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [copied, setCopied] = useState(false);

  // Check if current viewer is the winner
  const isWinner = publicKey && matchData?.winner_wallet === publicKey.toBase58();

  useEffect(() => {
    if (!roomPda) {
      setError("Missing room ID");
      setLoading(false);
      return;
    }

    const fetchMatch = async () => {
      try {
        const { data, error: fetchError } = await supabase.functions.invoke("match-get", {
          body: { roomPda },
        });

        if (fetchError) {
          console.error("[MatchPage] Error:", fetchError);
          setError(fetchError.message || "Failed to load match");
          return;
        }

        if (!data?.ok) {
          setError(data?.error || "Match not found");
          return;
        }

        setMatchData(data.match);
        setWinnerProfile(data.winner_profile || null);

        // Show confetti if the viewer is the winner
        if (publicKey && data.match.winner_wallet === publicKey.toBase58()) {
          setShowConfetti(true);
        }
      } catch (err) {
        console.error("[MatchPage] Exception:", err);
        setError("Failed to load match data");
      } finally {
        setLoading(false);
      }
    };

    fetchMatch();
  }, [roomPda, publicKey]);

  const handleCopy = async () => {
    if (!roomPda) return;
    const success = await copyMatchLink(roomPda);
    if (success) {
      setCopied(true);
      toast.success(t("shareMatch.linkCopied", "Link copied!"));
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleWhatsApp = () => {
    if (!roomPda || !matchData) return;
    const url = buildWhatsAppShareUrl(roomPda, !!isWinner, getGameDisplayName(matchData.game_type));
    window.open(url, "_blank", "noopener,noreferrer");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto" />
          <p className="text-muted-foreground">Loading match...</p>
        </div>
      </div>
    );
  }

  if (error || !matchData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center space-y-6 max-w-md">
          <div className="p-4 bg-destructive/20 rounded-full w-fit mx-auto">
            <ExternalLink className="w-8 h-8 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            {t("shareMatch.matchNotFound", "Match Not Found")}
          </h1>
          <p className="text-muted-foreground">
            {error || "This match doesn't exist or has been removed."}
          </p>
          <Link to="/room-list">
            <Button className="gap-2">
              <Gamepad2 className="w-4 h-4" />
              {t("shareMatch.playOn1M", "Play on 1M Gaming")}
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-amber-950/10 py-8 px-4">
      {/* Confetti for winner */}
      <GoldConfettiExplosion active={showConfetti} originX={50} originY={20} />
      
      <div className="max-w-lg mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-amber-400 to-amber-600 bg-clip-text text-transparent">
            1M GAMING
          </h1>
          <p className="text-sm text-muted-foreground">Match Result</p>
        </div>

        {/* Match Card */}
        <MatchShareCard 
          matchData={matchData} 
          winnerProfile={winnerProfile}
        />

        {/* Share Buttons */}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {/* Copy Link */}
            <Button
              onClick={handleCopy}
              variant="outline"
              className="gap-2 h-12"
            >
              {copied ? (
                <Check className="w-4 h-4 text-emerald-500" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
              {t("shareMatch.copyLink", "Copy Link")}
            </Button>

            {/* WhatsApp */}
            <Button
              onClick={handleWhatsApp}
              className="gap-2 h-12 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <MessageCircle className="w-4 h-4" />
              WhatsApp
            </Button>
          </div>

          {/* Native Share (mobile) */}
          {isNativeShareAvailable() && roomPda && matchData && (
            <ShareMatchButton
              roomPda={roomPda}
              isWinner={!!isWinner}
              gameName={matchData.game_type}
              className="w-full"
            />
          )}
        </div>

        {/* CTA: Play on 1M Gaming */}
        <div className="pt-4">
          <Link to="/room-list" className="block">
            <Button 
              size="lg" 
              className="w-full gap-2 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 font-semibold py-6"
            >
              <Gamepad2 className="w-5 h-5" />
              {t("shareMatch.playOn1M", "Play on 1M Gaming")}
            </Button>
          </Link>
        </div>

        {/* Transaction link if available */}
        {matchData.tx_signature && (
          <a
            href={`https://explorer.solana.com/tx/${matchData.tx_signature}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            View on-chain transaction
          </a>
        )}
      </div>
    </div>
  );
}
