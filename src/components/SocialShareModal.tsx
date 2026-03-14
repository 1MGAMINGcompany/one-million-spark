import { useRef, useState, useCallback } from "react";
import { X, Download, Copy, Check, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import predictionsHero from "@/assets/predictions-hero.jpeg";
import pyramidLogo from "@/assets/1m-pyramid-logo-hd.png";

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

export type ShareVariant = "prediction" | "claim_win" | "victory";

export interface ShareModalProps {
  open: boolean;
  onClose: () => void;
  variant: ShareVariant;
  /** Prediction-specific */
  eventTitle?: string;
  sport?: string;
  fighterPick?: string;
  amountSol?: number;
  /** Win / Victory */
  gameTitle?: string;
  solWon?: number;
  wallet?: string;
  opponentType?: string;
  streak?: number;
  gameName?: string;
}

export default function SocialShareModal(props: ShareModalProps) {
  const {
    open, onClose, variant,
    eventTitle, sport, fighterPick, amountSol,
    gameTitle, solWon, wallet, opponentType, streak, gameName,
  } = props;

  const cardRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  const caption = buildCaption(props);

  const handleCopyCaption = useCallback(() => {
    navigator.clipboard.writeText(caption).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [caption]);

  const handleDownload = useCallback(async () => {
    if (!cardRef.current) return;
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(cardRef.current, { pixelRatio: 2, cacheBust: true });
      const link = document.createElement("a");
      link.download = `1mgaming-${variant}.png`;
      link.href = dataUrl;
      link.click();
    } catch (e) {
      console.error("Download failed", e);
    }
  }, [variant]);

  const handleShareLink = useCallback(() => {
    const url = window.location.href;
    if (navigator.share) {
      navigator.share({ title: "1MGAMING", text: caption, url });
    } else {
      navigator.clipboard.writeText(`${caption}\n${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [caption]);

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
            {/* Hero image top strip */}
            <div className="relative h-28 w-full overflow-hidden">
              <img
                src={predictionsHero}
                alt=""
                className="w-full h-full object-cover object-[center_24%]"
                crossOrigin="anonymous"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/40 to-[hsl(var(--card))]" />
              {/* Logo badge */}
              <div className="absolute top-3 left-3 flex items-center gap-2">
                <img src={pyramidLogo} alt="1MGAMING" className="w-7 h-7" crossOrigin="anonymous" />
                <span className="text-[11px] font-bold text-white/90 tracking-wider font-['Cinzel']">1MGAMING</span>
              </div>
              {/* Result label */}
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
                  {sport && <p className="text-[10px] uppercase tracking-widest text-primary font-bold">{sport}</p>}
                  <h3 className="text-base font-bold text-foreground font-['Cinzel'] leading-tight">{eventTitle}</h3>
                  <div className="flex items-center justify-between bg-secondary/40 rounded-lg px-3 py-2">
                    <span className="text-xs text-muted-foreground">Pick</span>
                    <span className="text-sm font-bold text-foreground">{fighterPick}</span>
                  </div>
                  {amountSol != null && amountSol > 0 && (
                    <div className="flex items-center justify-between bg-secondary/40 rounded-lg px-3 py-2">
                      <span className="text-xs text-muted-foreground">Amount</span>
                      <span className="text-sm font-bold text-primary">{amountSol.toFixed(2)} SOL</span>
                    </div>
                  )}
                </>
              )}

              {variant === "claim_win" && (
                <>
                  <h3 className="text-base font-bold text-foreground font-['Cinzel'] leading-tight">{gameTitle || eventTitle}</h3>
                  {solWon != null && (
                    <div className="text-center py-2">
                      <p className="text-3xl font-extrabold text-primary font-['Cinzel']">{solWon.toFixed(4)} SOL</p>
                      <p className="text-[10px] uppercase tracking-widest text-green-400 font-bold mt-1">Reward Claimed</p>
                    </div>
                  )}
                </>
              )}

              {variant === "victory" && (
                <>
                  <h3 className="text-base font-bold text-foreground font-['Cinzel'] leading-tight">{gameName || gameTitle}</h3>
                  {solWon != null && solWon > 0 && (
                    <div className="text-center py-2">
                      <p className="text-3xl font-extrabold text-primary font-['Cinzel']">{solWon.toFixed(4)} SOL</p>
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
                  <span className="text-[10px] font-mono text-muted-foreground">{shortWallet(wallet)}</span>
                )}
                <span className="text-[10px] text-muted-foreground">{fmtDate()}</span>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="grid grid-cols-3 gap-2">
            <Button variant="secondary" size="sm" className="gap-1.5 text-xs" onClick={handleCopyCaption}>
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copied" : "Caption"}
            </Button>
            <Button variant="secondary" size="sm" className="gap-1.5 text-xs" onClick={handleDownload}>
              <Download className="w-3.5 h-3.5" />
              Image
            </Button>
            <Button variant="secondary" size="sm" className="gap-1.5 text-xs" onClick={handleShareLink}>
              <Link2 className="w-3.5 h-3.5" />
              Share
            </Button>
          </div>

          <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground" onClick={onClose}>
            <X className="w-3.5 h-3.5 mr-1" /> Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function buildCaption(p: ShareModalProps): string {
  if (p.variant === "prediction") {
    return `🥊 My pick: ${p.fighterPick}${p.amountSol ? ` | ${p.amountSol.toFixed(2)} SOL` : ""} on @1MGaming\n${p.eventTitle || ""}`;
  }
  if (p.variant === "claim_win") {
    return `💰 Won ${p.solWon?.toFixed(4) || ""} SOL on @1MGaming!\n${p.gameTitle || p.eventTitle || ""}`;
  }
  return `🏆 Victory on @1MGaming!${p.solWon ? ` Won ${p.solWon.toFixed(4)} SOL` : ""}\n${p.gameName || p.gameTitle || ""}`;
}
