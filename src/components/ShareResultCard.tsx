import { useState, useRef, useCallback } from "react";
import {
  Download,
  Copy,
  Check,
  Mail,
  MessageCircle,
  X,
  Trophy,
  Swords,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useTranslation } from "react-i18next";
import pyramidLogo from "@/assets/1m-pyramid-logo-hd.png";
import GoldConfettiExplosion from "@/components/GoldConfettiExplosion";

const LAMPORTS_PER_SOL = 1_000_000_000;

function shortenWallet(addr: string, chars = 4): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, chars)}…${addr.slice(-chars)}`;
}

function formatSol(lamports: number): string {
  if (!lamports) return "0";
  return (lamports / LAMPORTS_PER_SOL).toFixed(3);
}

function formatTimestamp(ts: string | null): string {
  if (!ts) return "";
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

/** Game-specific icon for the card */
function GameIcon({ gameType, size = 28 }: { gameType: string; size?: number }) {
  const gt = (gameType || "").toLowerCase();
  const style = { width: size, height: size };
  
  if (gt.includes("chess")) return <span style={style} className="text-2xl leading-none flex items-center justify-center">♚</span>;
  if (gt.includes("checker")) return <span style={style} className="text-2xl leading-none flex items-center justify-center">⛀</span>;
  if (gt.includes("backgammon")) return <span style={style} className="text-2xl leading-none flex items-center justify-center">🎲</span>;
  if (gt.includes("domino")) return <span style={style} className="text-2xl leading-none flex items-center justify-center">🁣</span>;
  if (gt.includes("ludo")) return <span style={style} className="text-2xl leading-none flex items-center justify-center">🎯</span>;
  return <Swords style={style} />;
}

/** Ankh-style divider */
function AnkhDivider({ dark }: { dark: boolean }) {
  return (
    <div className="flex items-center gap-3 w-full">
      <div className="flex-1 h-px" style={{ background: dark ? "hsl(45 50% 25%)" : "hsl(45 40% 70%)" }} />
      <span style={{ 
        color: dark ? "hsl(45 60% 45%)" : "hsl(35 70% 40%)", 
        fontSize: 14,
        lineHeight: 1,
      }}>☥</span>
      <div className="flex-1 h-px" style={{ background: dark ? "hsl(45 50% 25%)" : "hsl(45 40% 70%)" }} />
    </div>
  );
}

export interface ShareResultCardProps {
  open: boolean;
  onClose: () => void;
  isWinner: boolean;
  gameType: string;
  winnerWallet: string | null;
  loserWallet: string | null;
  myWallet: string | null;
  solWonLamports: number;
  solLostLamports: number;
  winReason?: string;
  finishedAt?: string | null;
  roomPda?: string;
  totalGamesWon?: number;
  totalSolWon?: number;
}

export function ShareResultCard({
  open, onClose, isWinner, gameType, winnerWallet, loserWallet, myWallet,
  solWonLamports, solLostLamports, finishedAt, roomPda, totalGamesWon, totalSolWon,
}: ShareResultCardProps) {
  const { t } = useTranslation();
  const cardRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showWallet, setShowWallet] = useState(true);
  const [showFullAddress, setShowFullAddress] = useState(false);
  const hasSolStake = (solWonLamports || 0) > 0 || (solLostLamports || 0) > 0;
  const [showSol, setShowSol] = useState(true);
  const [showTotalGames, setShowTotalGames] = useState(true);
  const [showTotalSol, setShowTotalSol] = useState(true);
  const [showOpponent, setShowOpponent] = useState(false);
  const [showTimestamp, setShowTimestamp] = useState(true);
  const [darkTheme, setDarkTheme] = useState(true);

  const gameLabel = (gameType || "").replace(/\b\w/g, (c: string) => c.toUpperCase());
  const solAmount = isWinner ? formatSol(solWonLamports) : formatSol(solLostLamports);
  const opponentWallet = isWinner ? loserWallet : winnerWallet;
  const matchLink = roomPda ? `${window.location.origin}/match/${roomPda}` : "https://1mgaming.com";

  const xText = isWinner
    ? t('shareCard.xWinText', { amount: solAmount, game: gameLabel, link: matchLink })
    : t('shareCard.xLoseText', { game: gameLabel, link: matchLink });
  const waText = isWinner
    ? t('shareCard.waWinText', { amount: solAmount, link: matchLink })
    : t('shareCard.waLoseText', { game: gameLabel, link: matchLink });
  const emailSubject = isWinner
    ? t('shareCard.emailWinSubject', { game: gameLabel })
    : t('shareCard.emailLoseSubject', { game: gameLabel });
  const emailBody = isWinner
    ? t('shareCard.emailWinBody', { amount: solAmount, game: gameLabel, link: matchLink })
    : t('shareCard.emailLoseBody', { game: gameLabel, link: matchLink });

  const handleDownload = useCallback(async () => {
    if (!cardRef.current || exporting) return;
    setExporting(true);
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(cardRef.current, {
        width: 1080, height: 1080, pixelRatio: 2,
        backgroundColor: darkTheme ? "#0a0e1a" : "#ffffff",
      });
      const a = document.createElement("a");
      a.download = `1mgaming-${gameLabel.toLowerCase()}-result.png`;
      a.href = dataUrl;
      a.click();
    } catch (e) {
      console.error("Export failed:", e);
    } finally {
      setExporting(false);
    }
  }, [exporting, darkTheme, gameLabel]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(xText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }, [xText]);

  if (!open) return null;

  // Theme colors
  const bgColor = darkTheme ? "hsl(222 47% 6%)" : "hsl(0 0% 100%)";
  const cardBgColor = darkTheme ? "hsl(222 40% 8%)" : "hsl(0 0% 97%)";
  const borderColor = darkTheme ? "hsl(45 50% 20%)" : "hsl(45 40% 65%)";
  const fgColor = darkTheme ? "hsl(45 29% 97%)" : "hsl(222 47% 12%)";
  const mutedColor = darkTheme ? "hsl(45 15% 55%)" : "hsl(222 20% 50%)";
  const statBgColor = darkTheme ? "hsl(222 30% 12%)" : "hsl(40 30% 94%)";
  const statBorderColor = darkTheme ? "hsl(45 40% 18%)" : "hsl(45 35% 72%)";
  const gridLineColor = darkTheme ? "hsl(45 30% 12%)" : "hsl(45 20% 88%)";
  const accentGold = isWinner
    ? "linear-gradient(135deg, #FCE68A 0%, #FACC15 50%, #AB8215 100%)"
    : darkTheme ? "linear-gradient(135deg, #94a3b8, #64748b)" : "linear-gradient(135deg, #334155, #475569)";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/95 backdrop-blur-sm p-4 overflow-auto">
      {isWinner && <GoldConfettiExplosion active originX={50} originY={20} />}

      <div className="w-full max-w-lg mx-auto space-y-5 my-auto relative">
        <button
          onClick={onClose}
          className="absolute -top-2 right-0 z-10 p-2 rounded-full bg-muted/60 hover:bg-muted text-muted-foreground transition-colors"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        {/* ═══ PREMIUM SHARE CARD (capturable at 1080x1080) ═══ */}
        <div
          ref={cardRef}
          className="rounded-2xl overflow-hidden relative"
          style={{
            background: cardBgColor,
            border: `1.5px solid ${borderColor}`,
            boxShadow: isWinner
              ? "0 0 60px hsl(45 93% 54% / 0.15), 0 0 120px hsl(45 93% 54% / 0.05), 0 8px 30px -4px hsl(45 93% 54% / 0.35)"
              : "0 4px 30px -4px hsl(222 47% 0% / 0.6)",
          }}
        >
          {/* Grid background pattern */}
          <div className="absolute inset-0 pointer-events-none" style={{
            backgroundImage: `linear-gradient(${gridLineColor} 1px, transparent 1px), linear-gradient(90deg, ${gridLineColor} 1px, transparent 1px)`,
            backgroundSize: "40px 40px",
            opacity: 0.4,
          }} />

          {/* Animated scan line */}
          <div className="absolute top-0 left-0 right-0 h-px overflow-hidden">
            <div 
              className="h-full animate-shimmer"
              style={{
                background: "linear-gradient(90deg, transparent, hsl(45 93% 54% / 0.6), transparent)",
                backgroundSize: "200% 100%",
              }}
            />
          </div>

          {/* Corner accent marks */}
          {[
            { top: 8, left: 8 },
            { top: 8, right: 8 },
            { bottom: 8, left: 8 },
            { bottom: 8, right: 8 },
          ].map((pos, i) => (
            <div key={i} className="absolute w-4 h-4 pointer-events-none" style={{
              ...pos as any,
              borderTop: (pos.top !== undefined) ? `1.5px solid hsl(45 60% 45%)` : undefined,
              borderBottom: (pos.bottom !== undefined) ? `1.5px solid hsl(45 60% 45%)` : undefined,
              borderLeft: (pos.left !== undefined) ? `1.5px solid hsl(45 60% 45%)` : undefined,
              borderRight: (pos.right !== undefined) ? `1.5px solid hsl(45 60% 45%)` : undefined,
            }} />
          ))}

          {/* Gold accent bar at top */}
          <div
            className="h-1 w-full relative z-10"
            style={{
              background: isWinner
                ? "linear-gradient(90deg, hsl(35 80% 35%), hsl(45 93% 54%), hsl(45 90% 65%), hsl(45 93% 54%), hsl(35 80% 35%))"
                : "linear-gradient(90deg, hsl(222 30% 20%), hsl(222 30% 35%), hsl(222 30% 20%))",
            }}
          />

          <div className="flex flex-col items-center px-8 py-8 space-y-5 relative z-10">
            {/* Pyramid logo with glow */}
            <div className="relative">
              <div className="absolute inset-0 rounded-full animate-pulse-gold" style={{
                background: "radial-gradient(circle, hsl(45 93% 54% / 0.3) 0%, transparent 70%)",
                filter: "blur(12px)",
                transform: "scale(1.8)",
              }} />
              <img src={pyramidLogo} alt="1M Gaming" className="w-16 h-16 object-contain relative z-10" />
            </div>

            {/* 1M GAMING branding */}
            <h3
              className="text-sm font-display font-bold tracking-[0.3em] uppercase"
              style={{
                background: "linear-gradient(135deg, #FCE68A 0%, #FACC15 50%, #AB8215 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              1M GAMING
            </h3>

            <AnkhDivider dark={darkTheme} />

            {/* Victory / Loss text */}
            <div className="text-center space-y-2">
              <div className="flex items-center justify-center gap-3">
                {isWinner && <Trophy className="h-7 w-7" style={{ color: "hsl(45 93% 54%)" }} />}
                <h2
                  className="text-4xl font-display font-bold tracking-wider"
                  style={{
                    background: accentGold,
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                    filter: isWinner ? "drop-shadow(0 0 8px hsl(45 93% 54% / 0.3))" : undefined,
                  }}
                >
                  {isWinner ? t('shareCard.victory') : t('shareCard.goodGame')}
                </h2>
                {isWinner && <Trophy className="h-7 w-7" style={{ color: "hsl(45 93% 54%)" }} />}
              </div>
              <p style={{ color: mutedColor, fontSize: 11, letterSpacing: "0.15em" }} className="uppercase">
                {t('shareCard.matchComplete')}
              </p>
            </div>

            {/* Game badge with icon */}
            <div className="inline-flex items-center gap-2 rounded-full px-5 py-1.5"
              style={{
                background: darkTheme ? "hsl(222 30% 14%)" : "hsl(45 40% 93%)",
                border: `1px solid ${statBorderColor}`,
              }}
            >
              <GameIcon gameType={gameType} size={18} />
              <span style={{ color: "hsl(45 93% 54%)", fontSize: 11, fontWeight: 700, letterSpacing: "0.2em" }}>
                {gameLabel.toUpperCase()}
              </span>
            </div>

            <AnkhDivider dark={darkTheme} />

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-3 w-full">
              {/* Result */}
              <StatChip
                label={t('shareCard.result')}
                value={isWinner ? t('shareCard.win') : t('shareCard.loss')}
                valueColor={isWinner ? "hsl(45 93% 54%)" : "hsl(0 70% 55%)"}
                bg={statBgColor} border={statBorderColor} muted={mutedColor}
                highlight={isWinner}
              />
              {/* SOL this game */}
              {showSol && hasSolStake && (
                <StatChip
                  label={isWinner ? t('shareCard.solWon') : t('shareCard.solStaked')}
                  value={`◎ ${solAmount}`}
                  valueColor={isWinner ? "hsl(45 93% 54%)" : mutedColor}
                  bg={statBgColor} border={statBorderColor} muted={mutedColor}
                  highlight={isWinner}
                />
              )}
              {/* Total games won */}
              {showTotalGames && totalGamesWon != null && (
                <StatChip
                  label={t('shareCard.gamesWon')}
                  value={String(totalGamesWon)}
                  valueColor={fgColor}
                  bg={statBgColor} border={statBorderColor} muted={mutedColor}
                />
              )}
              {/* Total SOL won lifetime */}
              {showTotalSol && totalSolWon != null && (
                <StatChip
                  label={t('shareCard.totalSolWon')}
                  value={`◎ ${totalSolWon.toFixed(3)}`}
                  valueColor="hsl(45 93% 54%)"
                  bg={statBgColor} border={statBorderColor} muted={mutedColor}
                  highlight
                />
              )}
            </div>

            {/* Wallet address */}
            {showWallet && myWallet && (
              <p style={{ color: mutedColor, fontFamily: "monospace", fontSize: 13 }}>
                {showFullAddress ? myWallet : shortenWallet(myWallet)}
              </p>
            )}

            {/* Opponent */}
            {showOpponent && opponentWallet && (
              <p style={{ color: mutedColor, fontSize: 11 }}>
                {t('shareCard.vs')} {shortenWallet(opponentWallet)}
              </p>
            )}

            <AnkhDivider dark={darkTheme} />

            {/* Footer */}
            <div className="w-full flex items-center justify-between">
              {showTimestamp && finishedAt && (
                <span style={{ color: mutedColor, fontSize: 10 }}>{formatTimestamp(finishedAt)}</span>
              )}
              <span
                className="ml-auto font-display font-bold"
                style={{
                  background: "linear-gradient(135deg, #FCE68A, #FACC15, #AB8215)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                  fontSize: 11,
                  letterSpacing: "0.15em",
                }}
              >
                SKILL &gt; LUCK
              </span>
            </div>

            {/* Website watermark */}
            <p style={{ color: darkTheme ? "hsl(45 20% 30%)" : "hsl(45 20% 75%)", fontSize: 9, letterSpacing: "0.2em" }}>
              www.1mgaming.com
            </p>
          </div>
        </div>

        {/* ═══ CUSTOMIZATION ═══ */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('shareCard.customize')}</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
            <ToggleRow label={t('shareCard.walletAddress')} checked={showWallet} onChange={setShowWallet} />
            {showWallet && <ToggleRow label={t('shareCard.fullAddress')} checked={showFullAddress} onChange={setShowFullAddress} />}
            {hasSolStake && <ToggleRow label={t('shareCard.solAmount')} checked={showSol} onChange={setShowSol} />}
            <ToggleRow label={t('shareCard.totalGamesWon')} checked={showTotalGames} onChange={setShowTotalGames} />
            <ToggleRow label={t('shareCard.totalSolWonToggle')} checked={showTotalSol} onChange={setShowTotalSol} />
            <ToggleRow label={t('shareCard.showOpponent')} checked={showOpponent} onChange={setShowOpponent} />
            <ToggleRow label={t('shareCard.timestamp')} checked={showTimestamp} onChange={setShowTimestamp} />
            <ToggleRow label={t('shareCard.darkTheme')} checked={darkTheme} onChange={setDarkTheme} />
          </div>
          <p className="text-[10px] text-muted-foreground/60 text-center pt-1">{t('shareCard.privacyNote')}</p>
        </div>

        {/* ═══ EXPORT BUTTONS ═══ */}
        <div className="space-y-2">
          <Button variant="gold" size="lg" className="w-full text-base gap-2" onClick={handleDownload} disabled={exporting}>
            <Download className="h-5 w-5" />
            {exporting ? t('shareCard.generating') : t('shareCard.downloadImage')}
          </Button>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <a
              href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(xText)}`}
              target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-lg font-semibold text-sm min-h-[44px] px-3 bg-foreground text-background hover:opacity-90 transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
              {t('shareCard.shareOnX')}
            </a>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(waText)}`}
              target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-lg font-semibold text-sm min-h-[44px] px-3 bg-green-600 hover:bg-green-700 text-white transition-colors"
            >
              <MessageCircle className="h-4 w-4" />
              {t('shareCard.whatsapp')}
            </a>
            <a
              href={`mailto:?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`}
              className="inline-flex items-center justify-center gap-2 rounded-lg font-semibold text-sm min-h-[44px] px-3 border border-border bg-secondary hover:bg-secondary/80 text-secondary-foreground transition-colors"
            >
              <Mail className="h-4 w-4" />
              {t('shareCard.email')}
            </a>
            <button
              onClick={handleCopy}
              className="inline-flex items-center justify-center gap-2 rounded-lg font-semibold text-sm min-h-[44px] px-3 border border-border bg-secondary hover:bg-secondary/80 text-secondary-foreground transition-colors"
            >
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              {copied ? t('shareCard.copied') : t('shareCard.copy')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Premium stat chip */
function StatChip({ label, value, valueColor, bg, border, muted, highlight }: {
  label: string; value: string; valueColor: string; bg: string; border: string; muted: string; highlight?: boolean;
}) {
  return (
    <div
      className="flex flex-col items-center rounded-xl p-3 relative overflow-hidden"
      style={{
        background: bg,
        border: `1px solid ${border}`,
        boxShadow: highlight ? "0 0 12px hsl(45 93% 54% / 0.08)" : undefined,
      }}
    >
      {highlight && (
        <div className="absolute inset-0 pointer-events-none" style={{
          background: "radial-gradient(ellipse at center, hsl(45 93% 54% / 0.04) 0%, transparent 70%)",
        }} />
      )}
      <span style={{ color: muted, fontSize: 9, letterSpacing: "0.15em", textTransform: "uppercase", fontWeight: 600 }}>
        {label}
      </span>
      <span style={{ color: valueColor, fontSize: 20, fontWeight: 700, marginTop: 4, fontFamily: "'Cinzel', serif" }}>
        {value}
      </span>
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between cursor-pointer py-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} className="scale-75" />
    </label>
  );
}
