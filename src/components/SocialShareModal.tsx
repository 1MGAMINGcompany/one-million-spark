import { useRef, useState, useCallback } from "react";
import { X, Download, Copy, Check, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import whoWinsBanner from "@/assets/who-wins-banner.jpeg";
import pyramidLogo from "@/assets/1m-pyramid-logo-hd.png";
import { supabase } from "@/integrations/supabase/client";

function shortWallet(addr: string, chars = 4) {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, chars)}…${addr.slice(-chars)}`;
}

function fmtDate(d?: Date | string | null) {
  const dt = d ? new Date(d) : new Date();
  return dt.toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function sportEmoji(sport?: string): string {
  if (!sport) return "🎯";
  const s = sport.toUpperCase();
  if (s.includes("FUTBOL") || s.includes("SOCCER") || s.includes("FOOTBALL")) return "⚽";
  if (s.includes("MMA")) return "🥊";
  if (s.includes("BOXING")) return "🥊";
  if (s.includes("MUAY")) return "🥊";
  return "🎯";
}

export type ShareVariant = "prediction" | "claim_win" | "victory";

export interface ShareModalProps {
  open: boolean;
  onClose: () => void;
  variant: ShareVariant;
  eventTitle?: string;
  sport?: string;
  fighterPick?: string;
  amountUsd?: number;
  poolUsd?: number;
  gameTitle?: string;
  amountWon?: number;
  /** @deprecated — use amountWon for predictions, kept for skill-game backward compat */
  solWon?: number;
  wallet?: string;
  referralCode?: string;
  opponentType?: string;
  streak?: number;
  gameName?: string;
  operatorBrandName?: string;
  operatorLogoUrl?: string | null;
  operatorSubdomain?: string;
}

function logShareAction(variant: ShareVariant, method: string, wallet?: string) {
  const sessionId = typeof window !== "undefined"
    ? (sessionStorage.getItem("1mg_session_id") || "unknown")
    : "unknown";
  supabase.from("monkey_analytics").insert({
    session_id: sessionId,
    event: variant === "claim_win" ? "winnings_shared" : "prediction_shared",
    context: method,
    metadata: wallet ? JSON.stringify({ wallet: shortWallet(wallet) }) : null,
  }).then(() => {});
}

function buildShareUrl(referralCode?: string, operatorSubdomain?: string): string {
  const base = operatorSubdomain
    ? `https://${operatorSubdomain}.1mg.live`
    : "https://1mgaming.com/predictions";
  if (referralCode && referralCode.length >= 4 && referralCode.length <= 16) {
    return `${base}?ref=${referralCode}`;
  }
  return base;
}

export default function SocialShareModal(props: ShareModalProps) {
  const {
    open, onClose, variant,
    eventTitle, sport, fighterPick, amountUsd, poolUsd,
    gameTitle, amountWon, solWon, wallet, referralCode, opponentType, streak, gameName,
    operatorBrandName, operatorLogoUrl, operatorSubdomain,
  } = props;

  const winAmount = amountWon ?? solWon;
  const isSolWin = amountWon == null && solWon != null;

  const brandName = operatorBrandName || "1MGAMING";
  const brandLogo = operatorLogoUrl || pyramidLogo;

  const cardRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  const shareUrl = buildShareUrl(referralCode, operatorSubdomain);
  const caption = buildCaption(props, shareUrl);

  const handleCopyLink = useCallback(() => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      logShareAction(variant, "copy_link", wallet);
    });
  }, [shareUrl, variant, wallet]);

  const handleDownload = useCallback(async () => {
    if (!cardRef.current) return;
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(cardRef.current, { pixelRatio: 2, cacheBust: true });
      const link = document.createElement("a");
      link.download = `${brandName.toLowerCase().replace(/\s+/g, "-")}-${variant}.png`;
      link.href = dataUrl;
      link.click();
      logShareAction(variant, "download", wallet);
    } catch (e) {
      console.error("Download failed", e);
    }
  }, [variant, wallet]);

  const handleShareX = useCallback(() => {
    const url = `https://x.com/intent/tweet?text=${encodeURIComponent(caption)}&url=${encodeURIComponent(shareUrl)}`;
    window.open(url, "_blank", "noopener");
    logShareAction(variant, "twitter", wallet);
  }, [caption, shareUrl, variant, wallet]);

  const handleShareTelegram = useCallback(() => {
    const url = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(caption)}`;
    window.open(url, "_blank", "noopener");
    logShareAction(variant, "telegram", wallet);
  }, [caption, shareUrl, variant, wallet]);

  const handleShareWhatsApp = useCallback(() => {
    const url = `https://wa.me/?text=${encodeURIComponent(`${caption}\n${shareUrl}`)}`;
    window.open(url, "_blank", "noopener");
    logShareAction(variant, "whatsapp", wallet);
  }, [caption, shareUrl, variant, wallet]);

  const handleNativeShare = useCallback(() => {
    if (navigator.share) {
      navigator.share({ title: brandName, text: caption, url: shareUrl });
      logShareAction(variant, "native_share", wallet);
    } else {
      handleCopyLink();
    }
  }, [caption, shareUrl, variant, wallet, handleCopyLink]);

  const resultLabel = variant === "prediction" ? "MY PICK" : variant === "claim_win" ? "WIN" : "VICTORY";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm p-0 bg-transparent border-none shadow-none [&>button]:hidden">
        <div className="space-y-3 p-4">
          {/* The card itself */}
          <div
            ref={cardRef}
            className="relative overflow-hidden rounded-2xl border border-primary/30 shadow-2xl"
            style={{ background: "hsl(var(--card))" }}
          >
            {/* Hero image — WHO WINS? banner */}
            <div className="relative w-full overflow-hidden">
              <img
                src={whoWinsBanner}
                alt="WHO WINS?"
                className="w-full h-auto object-cover"
                crossOrigin="anonymous"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[hsl(var(--card))]" />
              <div className="absolute top-3 left-3 flex items-center gap-2">
                <img src={pyramidLogo} alt="1MGAMING" className="w-7 h-7" crossOrigin="anonymous" />
                <span className="text-[11px] font-bold text-white/90 tracking-wider font-['Cinzel']">1MGAMING</span>
              </div>
              <div className="absolute top-3 right-3">
                <span className={`text-[10px] font-extrabold px-3 py-1 rounded-full tracking-wider ${
                  variant === "prediction"
                    ? "bg-primary/90 text-primary-foreground"
                    : "bg-green-500/90 text-white"
                }`}>
                  {resultLabel}
                </span>
              </div>
            </div>

            {/* Content body */}
            <div className="px-5 pb-5 pt-2 space-y-3">
              {variant === "prediction" && (
                <>
                  <h3 className="text-base font-bold text-foreground font-['Cinzel'] leading-tight">{eventTitle}</h3>
                  <div className="flex items-center justify-between bg-secondary/40 rounded-lg px-3 py-2">
                    <span className="text-xs text-muted-foreground">I Picked</span>
                    <span className="text-sm font-bold text-foreground">{fighterPick}</span>
                  </div>
                  {amountUsd != null && amountUsd > 0 && (
                    <div className="flex items-center justify-between bg-secondary/40 rounded-lg px-3 py-2">
                      <span className="text-xs text-muted-foreground">Amount</span>
                      <span className="text-sm font-bold text-primary">${amountUsd.toFixed(2)}</span>
                    </div>
                  )}
                  {poolUsd != null && poolUsd > 0 && (
                    <div className="flex items-center justify-between bg-secondary/40 rounded-lg px-3 py-2">
                      <span className="text-xs text-muted-foreground">Pool</span>
                      <span className="text-sm font-bold text-muted-foreground">${poolUsd.toFixed(2)}</span>
                    </div>
                  )}
                  {/* Hype tagline */}
                  <p className="text-[10px] text-center text-muted-foreground tracking-wide">
                    Fight Predictions (BKFC · Muay Thai · MMA · Futbol)<br />
                    Players vs Players • Winners take the pot
                  </p>
                </>
              )}

              {variant === "claim_win" && (
                <>
                  <h3 className="text-base font-bold text-foreground font-['Cinzel'] leading-tight">{gameTitle || eventTitle}</h3>
                  {winAmount != null && (
                    <div className="text-center py-2">
                      <p className="text-3xl font-extrabold text-primary font-['Cinzel']">
                        {isSolWin ? `${winAmount.toFixed(4)} SOL` : `$${winAmount.toFixed(2)}`}
                      </p>
                      <p className="text-[10px] uppercase tracking-widest text-green-400 font-bold mt-1">Reward Claimed</p>
                    </div>
                  )}
                </>
              )}

              {variant === "victory" && (
                <>
                  <h3 className="text-base font-bold text-foreground font-['Cinzel'] leading-tight">{gameName || gameTitle}</h3>
                  {winAmount != null && winAmount > 0 && (
                    <div className="text-center py-2">
                      <p className="text-3xl font-extrabold text-primary font-['Cinzel']">
                        {isSolWin ? `${winAmount.toFixed(4)} SOL` : `$${winAmount.toFixed(2)}`}
                      </p>
                      <p className="text-[10px] uppercase tracking-widest text-green-400 font-bold mt-1">Won</p>
                    </div>
                  )}
                  {opponentType && (
                    <div className="flex items-center justify-between bg-secondary/40 rounded-lg px-3 py-2">
                      <span className="text-xs text-muted-foreground">Opponent</span>
                      <span className="text-sm font-bold text-foreground">{opponentType}</span>
                    </div>
                  )}
                  {streak != null && streak > 1 && (
                    <div className="flex items-center justify-between bg-secondary/40 rounded-lg px-3 py-2">
                      <span className="text-xs text-muted-foreground">Streak</span>
                      <span className="text-sm font-bold text-primary">🔥 {streak}</span>
                    </div>
                  )}
                </>
              )}

              {/* Footer: wallet + date */}
              <div className="flex items-center justify-between pt-2 border-t border-border/30">
                {wallet && (
                  <span className="text-[10px] font-mono text-muted-foreground">Player: {shortWallet(wallet)}</span>
                )}
                <span className="text-[10px] text-muted-foreground">{fmtDate()}</span>
              </div>
            </div>
          </div>

          {/* Social share buttons */}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" size="sm" className="gap-1.5 text-xs" onClick={handleCopyLink}>
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copied!" : "Copy Link"}
            </Button>
            <Button variant="secondary" size="sm" className="gap-1.5 text-xs" onClick={handleDownload}>
              <Download className="w-3.5 h-3.5" />
              Save Image
            </Button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Button variant="secondary" size="sm" className="gap-1.5 text-xs" onClick={handleShareX}>
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
              X
            </Button>
            <Button variant="secondary" size="sm" className="gap-1.5 text-xs" onClick={handleShareTelegram}>
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
              Telegram
            </Button>
            <Button variant="secondary" size="sm" className="gap-1.5 text-xs" onClick={handleShareWhatsApp}>
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>
              WhatsApp
            </Button>
          </div>

          {"share" in navigator && (
            <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs" onClick={handleNativeShare}>
              <Link2 className="w-3.5 h-3.5" />
              More options...
            </Button>
          )}

          <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground" onClick={onClose}>
            <X className="w-3.5 h-3.5 mr-1" /> Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function buildCaption(p: ShareModalProps, url: string): string {
  const emoji = sportEmoji(p.sport);
  if (p.variant === "prediction") {
    return `WHO WINS? 👊\n${emoji} My pick: ${p.fighterPick}${p.amountUsd ? ` | $${p.amountUsd.toFixed(2)}` : ""}\nFight Predictions (BKFC · Muay Thai · MMA · Futbol)\nPlayers vs Players • Winners take the pot\n👇 Make your pick\n🌐 ${url}`;
  }
  if (p.variant === "claim_win") {
    const won = p.amountWon ?? p.solWon;
    const fmt = p.amountWon != null ? `$${won?.toFixed(2)}` : `${won?.toFixed(4) || ""} SOL`;
    return `💰 Won ${fmt} on @1MGaming!\n${p.gameTitle || p.eventTitle || ""}`;
  }
  const won = p.amountWon ?? p.solWon;
  const fmt = p.amountWon != null ? `$${won?.toFixed(2)}` : won ? `${won.toFixed(4)} SOL` : "";
  return `🏆 Victory on @1MGaming!${fmt ? ` Won ${fmt}` : ""}\n${p.gameName || p.gameTitle || ""}`;
}
