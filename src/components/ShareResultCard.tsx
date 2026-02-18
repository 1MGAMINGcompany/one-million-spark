import { useState, useRef, useCallback } from "react";
import {
  Gamepad2,
  Download,
  Copy,
  Check,
  Mail,
  MessageCircle,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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
  const cardRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showWallet, setShowWallet] = useState(true);
  const [showFullAddress, setShowFullAddress] = useState(false);
  const [showSol, setShowSol] = useState(true);
  const [showTotalGames, setShowTotalGames] = useState(false);
  const [showTotalSol, setShowTotalSol] = useState(false);
  const [showOpponent, setShowOpponent] = useState(false);
  const [showTimestamp, setShowTimestamp] = useState(true);
  const [darkTheme, setDarkTheme] = useState(true);

  const gameLabel = (gameType || "").replace(/\b\w/g, (c: string) => c.toUpperCase());
  const solAmount = isWinner ? formatSol(solWonLamports) : formatSol(solLostLamports);
  const opponentWallet = isWinner ? loserWallet : winnerWallet;
  const matchLink = roomPda ? `${window.location.origin}/match/${roomPda}` : "https://1mgaming.com";

  const xText = isWinner
    ? `Just won ${solAmount} SOL playing ${gameLabel} on @1MGaming 🎯\nSkill > Luck.\n${matchLink}`
    : `Just played ${gameLabel} on @1MGaming 🎮\nGood game.\n${matchLink}`;
  const waText = isWinner
    ? `Just finished a match on 1MGaming. Won ${solAmount} SOL!\nJoin me: ${matchLink}`
    : `Just played ${gameLabel} on 1MGaming. Good game!\n${matchLink}`;
  const emailSubject = isWinner
    ? `I just won playing ${gameLabel} on 1MGaming!`
    : `I just played ${gameLabel} on 1MGaming`;
  const emailBody = isWinner
    ? `I won ${solAmount} SOL playing ${gameLabel}!\nCheck it out: ${matchLink}`
    : `Just played ${gameLabel} on 1MGaming.\nMatch link: ${matchLink}`;

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

  const bg = darkTheme ? "bg-[hsl(222,47%,6%)]" : "bg-white";
  const fg = darkTheme ? "text-[hsl(45,29%,97%)]" : "text-[hsl(222,47%,12%)]";
  const mutedFg = darkTheme ? "text-[hsl(45,15%,65%)]" : "text-[hsl(222,20%,50%)]";
  const cardBg = darkTheme
    ? "bg-[hsl(222,40%,10%)] border-[hsl(45,50%,25%)]"
    : "bg-[hsl(0,0%,96%)] border-[hsl(45,50%,60%)]";
  const statBg = darkTheme
    ? "bg-[hsl(222,30%,14%)] border-[hsl(45,50%,20%)]"
    : "bg-[hsl(0,0%,93%)] border-[hsl(45,40%,70%)]";

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

        {/* ═══ SHARE CARD (capturable) ═══ */}
        <div
          ref={cardRef}
          className={`rounded-2xl border overflow-hidden ${cardBg} transition-colors duration-300`}
          style={{
            boxShadow: isWinner
              ? "0 0 40px hsl(45 93% 54% / 0.2), 0 8px 30px -4px hsl(45 93% 54% / 0.35)"
              : "0 4px 20px -4px hsl(222 47% 0% / 0.5)",
          }}
        >
          {/* Gold accent bar */}
          <div
            className="h-1.5 w-full"
            style={{
              background: isWinner
                ? "linear-gradient(90deg, hsl(45 93% 54%), hsl(35 80% 50%), hsl(45 90% 65%))"
                : "linear-gradient(90deg, hsl(222 30% 30%), hsl(222 30% 20%))",
            }}
          />

          <div className="flex flex-col items-center px-6 py-8 space-y-5">
            <img src={pyramidLogo} alt="1M Gaming" className="w-16 h-16 object-contain" />

            <div className="text-center space-y-1">
              <h2
                className="text-3xl font-display font-bold tracking-wider"
                style={{
                  background: isWinner
                    ? "linear-gradient(135deg, #FCE68A 0%, #FACC15 50%, #AB8215 100%)"
                    : darkTheme ? "linear-gradient(135deg, #94a3b8, #64748b)" : "linear-gradient(135deg, #334155, #475569)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                {isWinner ? "VICTORY" : "GOOD GAME"}
              </h2>
              <p className={`text-xs tracking-widest uppercase ${mutedFg}`}>Match Complete</p>
            </div>

            <span className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1 text-xs font-bold tracking-widest ${
              darkTheme ? "bg-primary/20 border border-primary/40 text-primary" : "bg-[hsl(45,80%,90%)] border border-[hsl(45,60%,60%)] text-[hsl(35,80%,30%)]"
            }`}>
              <Gamepad2 className="h-3.5 w-3.5" />
              {gameLabel.toUpperCase()}
            </span>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3 w-full">
              <div className={`flex flex-col items-center rounded-xl border p-3 ${statBg}`}>
                <span className={`text-[10px] uppercase tracking-wider ${mutedFg}`}>Result</span>
                <span className={`text-lg font-bold mt-1 ${isWinner ? "text-primary" : "text-destructive"}`}>
                  {isWinner ? "WIN" : "LOSS"}
                </span>
              </div>
              {showSol && (
                <div className={`flex flex-col items-center rounded-xl border p-3 ${statBg}`}>
                  <span className={`text-[10px] uppercase tracking-wider ${mutedFg}`}>{isWinner ? "SOL Won" : "SOL Staked"}</span>
                  <span className={`text-lg font-bold mt-1 ${isWinner ? "text-primary" : mutedFg}`}>{solAmount}</span>
                </div>
              )}
              {showTotalGames && totalGamesWon != null && (
                <div className={`flex flex-col items-center rounded-xl border p-3 ${statBg}`}>
                  <span className={`text-[10px] uppercase tracking-wider ${mutedFg}`}>Games Won</span>
                  <span className={`text-lg font-bold mt-1 ${fg}`}>{totalGamesWon}</span>
                </div>
              )}
              {showTotalSol && totalSolWon != null && (
                <div className={`flex flex-col items-center rounded-xl border p-3 ${statBg}`}>
                  <span className={`text-[10px] uppercase tracking-wider ${mutedFg}`}>Total SOL Won</span>
                  <span className="text-lg font-bold mt-1 text-primary">{totalSolWon.toFixed(3)}</span>
                </div>
              )}
            </div>

            {showWallet && myWallet && (
              <p className={`font-mono text-sm ${mutedFg}`}>
                {showFullAddress ? myWallet : shortenWallet(myWallet)}
              </p>
            )}

            {showOpponent && opponentWallet && (
              <p className={`text-xs ${mutedFg}`}>vs {shortenWallet(opponentWallet)}</p>
            )}

            <div className="w-full pt-3 border-t border-border/30 flex items-center justify-between">
              {showTimestamp && finishedAt && (
                <span className={`text-[10px] ${mutedFg}`}>{formatTimestamp(finishedAt)}</span>
              )}
              <span
                className="text-[10px] font-bold tracking-widest ml-auto"
                style={{
                  background: "linear-gradient(135deg, #FCE68A, #FACC15)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                SKILL &gt; LUCK
              </span>
            </div>
          </div>
        </div>

        {/* ═══ CUSTOMIZATION ═══ */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Customize Your Share Card</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
            <ToggleRow label="Wallet address" checked={showWallet} onChange={setShowWallet} />
            {showWallet && <ToggleRow label="Full address" checked={showFullAddress} onChange={setShowFullAddress} />}
            <ToggleRow label="SOL amount" checked={showSol} onChange={setShowSol} />
            <ToggleRow label="Total games won" checked={showTotalGames} onChange={setShowTotalGames} />
            <ToggleRow label="Total SOL won" checked={showTotalSol} onChange={setShowTotalSol} />
            <ToggleRow label="Show opponent" checked={showOpponent} onChange={setShowOpponent} />
            <ToggleRow label="Timestamp" checked={showTimestamp} onChange={setShowTimestamp} />
            <ToggleRow label="Dark theme" checked={darkTheme} onChange={setDarkTheme} />
          </div>
          <p className="text-[10px] text-muted-foreground/60 text-center pt-1">Control what you share. Your privacy, your stats.</p>
        </div>

        {/* ═══ EXPORT BUTTONS ═══ */}
        <div className="space-y-2">
          <Button variant="gold" size="lg" className="w-full text-base gap-2" onClick={handleDownload} disabled={exporting}>
            <Download className="h-5 w-5" />
            {exporting ? "Generating…" : "Download Image"}
          </Button>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <a
              href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(xText)}`}
              target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-lg font-semibold text-sm min-h-[44px] px-3 bg-foreground text-background hover:opacity-90 transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
              Share on X
            </a>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(waText)}`}
              target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-lg font-semibold text-sm min-h-[44px] px-3 bg-green-600 hover:bg-green-700 text-white transition-colors"
            >
              <MessageCircle className="h-4 w-4" />
              WhatsApp
            </a>
            <a
              href={`mailto:?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`}
              className="inline-flex items-center justify-center gap-2 rounded-lg font-semibold text-sm min-h-[44px] px-3 border border-border bg-secondary hover:bg-secondary/80 text-secondary-foreground transition-colors"
            >
              <Mail className="h-4 w-4" />
              Email
            </a>
            <button
              onClick={handleCopy}
              className="inline-flex items-center justify-center gap-2 rounded-lg font-semibold text-sm min-h-[44px] px-3 border border-border bg-secondary hover:bg-secondary/80 text-secondary-foreground transition-colors"
            >
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      </div>
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
