import { useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toPng } from "html-to-image";
import { Download, Share2, Copy, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import GoldConfettiExplosion from "@/components/GoldConfettiExplosion";
import PyramidLogo from "@/components/PyramidLogo";
import {
  ChessIcon,
  CheckersIcon,
  BackgammonIcon,
  DominoIcon,
  LudoIcon,
} from "@/components/GameIcons";

export interface AIWinShareCardProps {
  open: boolean;
  onClose: () => void;
  game: "chess" | "checkers" | "backgammon" | "dominos" | "ludo";
  difficulty: "easy" | "medium" | "hard";
  durationSeconds: number;
}


const GameIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  chess: ChessIcon,
  checkers: CheckersIcon,
  backgammon: BackgammonIcon,
  dominos: DominoIcon,
  ludo: LudoIcon,
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const SITE_URL = "https://www.1mgaming.com";

export default function AIWinShareCard({
  open,
  onClose,
  game,
  difficulty,
  durationSeconds,
}: AIWinShareCardProps) {
  const { t } = useTranslation();
  const cardRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);

  const gameLabel = t(`aiWinCard.gameNames.${game}`, { defaultValue: game });
  const diffLabel =
    difficulty === "easy"
      ? t("playAi.easy")
      : difficulty === "medium"
      ? t("playAi.medium")
      : t("playAi.hard");

  const xText = t("aiWinCard.xText", {
    game: gameLabel,
    difficulty: diffLabel,
    link: SITE_URL,
  });
  const waText = t("aiWinCard.waText", { link: SITE_URL });

  const handleDownload = useCallback(async () => {
    if (!cardRef.current) return;
    setDownloading(true);
    try {
      const dataUrl = await toPng(cardRef.current, { cacheBust: true, pixelRatio: 2 });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `1m-gaming-win-${game}.png`;
      a.click();
    } catch (e) {
      console.error("Image export failed", e);
    }
    setDownloading(false);
  }, [game]);

  const handleShareX = useCallback(() => {
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(xText)}`,
      "_blank"
    );
  }, [xText]);

  const handleWhatsApp = useCallback(() => {
    window.open(`https://wa.me/?text=${encodeURIComponent(waText)}`, "_blank");
  }, [waText]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(xText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* silent */
    }
  }, [xText]);

  if (!open) return null;

  const GameIcon = GameIconMap[game] ?? ChessIcon;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.85)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* Confetti behind */}
      <GoldConfettiExplosion active={true} />

      {/* Scanline CSS injected locally */}
      <style>{`
        @keyframes aicard-scan {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
        @keyframes aicard-pulse-ring {
          0%   { box-shadow: 0 0 0 0 hsl(45 93% 54% / 0.7); }
          70%  { box-shadow: 0 0 0 18px hsl(45 93% 54% / 0); }
          100% { box-shadow: 0 0 0 0 hsl(45 93% 54% / 0); }
        }
        @keyframes aicard-float {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-6px); }
        }
        .aicard-scan-line {
          animation: aicard-scan 2.2s ease-in-out infinite;
        }
        .aicard-pulse-ring {
          animation: aicard-pulse-ring 1.8s ease-out infinite;
        }
        .aicard-float {
          animation: aicard-float 3s ease-in-out infinite;
        }
        .aicard-grid-bg {
          background-image:
            linear-gradient(hsl(45 93% 54% / 0.04) 1px, transparent 1px),
            linear-gradient(90deg, hsl(45 93% 54% / 0.04) 1px, transparent 1px);
          background-size: 28px 28px;
        }
      `}</style>

      <div className="w-full max-w-sm mx-auto flex flex-col items-center gap-4">
        {/* ──── THE CARD (exported as image) ──── */}
        <div
          ref={cardRef}
          className="relative w-full rounded-2xl overflow-hidden aicard-grid-bg"
          style={{
            background: "hsl(222 47% 6%)",
            border: "1px solid hsl(45 93% 54% / 0.35)",
            boxShadow:
              "0 0 40px hsl(45 93% 54% / 0.18), 0 0 0 1px hsl(45 93% 54% / 0.12) inset",
          }}
        >
          {/* Corner accents */}
          {[
            "top-0 left-0 border-t-2 border-l-2 rounded-tl-xl",
            "top-0 right-0 border-t-2 border-r-2 rounded-tr-xl",
            "bottom-0 left-0 border-b-2 border-l-2 rounded-bl-xl",
            "bottom-0 right-0 border-b-2 border-r-2 rounded-br-xl",
          ].map((cls, i) => (
            <div
              key={i}
              className={`absolute w-5 h-5 ${cls}`}
              style={{ borderColor: "hsl(45 93% 54% / 0.6)" }}
            />
          ))}

          {/* Animated scan line at top */}
          <div className="relative h-1 w-full overflow-hidden" style={{ background: "hsl(45 93% 54% / 0.12)" }}>
            <div
              className="aicard-scan-line absolute top-0 h-full w-1/4"
              style={{
                background:
                  "linear-gradient(90deg, transparent, hsl(45 93% 70% / 0.9), transparent)",
              }}
            />
          </div>

          {/* Body */}
          <div className="px-6 pb-6 pt-5 flex flex-col items-center gap-4">
            {/* Logo */}
            <div className="aicard-float">
              <div
                className="aicard-pulse-ring rounded-full"
                style={{ padding: 4 }}
              >
                <PyramidLogo size={52} />
              </div>
            </div>

            {/* Victory text */}
            <div className="text-center">
              <div
                className="text-3xl font-black tracking-[0.25em] uppercase"
                style={{
                  background:
                    "linear-gradient(135deg, hsl(45 93% 75%), hsl(45 93% 54%), hsl(35 80% 40%))",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                  textShadow: "none",
                  filter: "drop-shadow(0 0 12px hsl(45 93% 54% / 0.5))",
                }}
              >
                ✦ {t("aiWinCard.victory")} ✦
              </div>
              <div
                className="text-xs tracking-[0.2em] uppercase mt-0.5"
                style={{ color: "hsl(45 93% 54% / 0.6)" }}
              >
                {t("aiWinCard.skillConfirmed")}
              </div>
            </div>

            {/* Stat chips */}
            <div className="flex items-center gap-2 flex-wrap justify-center">
              {[
                { label: gameLabel },
                { label: diffLabel.toUpperCase() },
                { label: formatDuration(durationSeconds) },
              ].map(({ label }) => (
                <div
                  key={label}
                  className="px-3 py-1 rounded text-xs font-bold tracking-widest uppercase"
                  style={{
                    border: "1px solid hsl(45 93% 54% / 0.4)",
                    background: "hsl(45 93% 54% / 0.08)",
                    color: "hsl(45 93% 70%)",
                  }}
                >
                  {label}
                </div>
              ))}
            </div>

            {/* Game icon */}
            <div className="w-20 h-20">
              <GameIcon className="w-full h-full" />
            </div>

            {/* Ankh divider */}
            <div
              className="flex items-center gap-3 w-full"
              style={{ color: "hsl(45 93% 54% / 0.35)" }}
            >
              <div className="flex-1 h-px" style={{ background: "hsl(45 93% 54% / 0.25)" }} />
              <span className="text-base">☥</span>
              <div className="flex-1 h-px" style={{ background: "hsl(45 93% 54% / 0.25)" }} />
            </div>

            {/* Share copy */}
            <p
              className="text-center text-sm font-medium leading-relaxed"
              style={{ color: "hsl(45 93% 80%)" }}
            >
              {t("aiWinCard.youBeatAI")} —&nbsp;
              <span style={{ color: "hsl(45 93% 54%)" }}>1M GAMING</span>
            </p>

            {/* Tagline footer */}
            <div
              className="flex items-center gap-3 w-full"
              style={{ color: "hsl(45 93% 54% / 0.4)" }}
            >
              <div className="flex-1 h-px" style={{ background: "hsl(45 93% 54% / 0.18)" }} />
              <span
                className="text-[10px] tracking-[0.3em] uppercase font-bold"
                style={{ color: "hsl(45 93% 54% / 0.55)" }}
              >
                {t("aiWinCard.tagline")}
              </span>
              <div className="flex-1 h-px" style={{ background: "hsl(45 93% 54% / 0.18)" }} />
            </div>

            {/* Site URL watermark */}
            <p
              className="text-[10px] tracking-wider"
              style={{ color: "hsl(45 93% 54% / 0.3)" }}
            >
              www.1mgaming.com
            </p>
          </div>
        </div>

        {/* ──── SHARE BUTTONS (outside card, not in image) ──── */}
        <div className="w-full flex flex-col gap-3">
          <p
            className="text-center text-sm font-semibold tracking-wider uppercase"
            style={{ color: "hsl(45 93% 60%)" }}
          >
            {t("aiWinCard.shareTitle")}
          </p>

          <div className="grid grid-cols-2 gap-2">
            {/* Download */}
            <Button
              variant="outline"
              onClick={handleDownload}
              disabled={downloading}
              className="gap-2 text-xs"
              style={{
                border: "1px solid hsl(45 93% 54% / 0.5)",
                color: "hsl(45 93% 70%)",
                background: "hsl(45 93% 54% / 0.07)",
              }}
            >
              <Download className="w-3.5 h-3.5" />
              {downloading ? t("aiWinCard.generating") : t("aiWinCard.downloadImage")}
            </Button>

            {/* X / Twitter */}
            <Button
              variant="outline"
              onClick={handleShareX}
              className="gap-2 text-xs"
              style={{
                border: "1px solid hsl(0 0% 100% / 0.2)",
                color: "hsl(0 0% 95%)",
                background: "hsl(0 0% 5%)",
              }}
            >
              {/* X logo */}
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.912-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              {t("aiWinCard.shareOnX")}
            </Button>

            {/* WhatsApp */}
            <Button
              variant="outline"
              onClick={handleWhatsApp}
              className="gap-2 text-xs"
              style={{
                border: "1px solid hsl(142 70% 45% / 0.5)",
                color: "hsl(142 70% 55%)",
                background: "hsl(142 70% 45% / 0.07)",
              }}
            >
              {/* WhatsApp icon */}
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.890-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              {t("aiWinCard.whatsapp")}
            </Button>

            {/* Copy */}
            <Button
              variant="outline"
              onClick={handleCopy}
              className="gap-2 text-xs"
              style={{
                border: "1px solid hsl(var(--border))",
                color: copied ? "hsl(142 70% 55%)" : "hsl(var(--muted-foreground))",
                background: "hsl(var(--secondary))",
              }}
            >
              {copied ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              {copied ? t("aiWinCard.copied") : t("aiWinCard.copy")}
            </Button>
          </div>

          {/* Close */}
          <Button
            variant="ghost"
            onClick={onClose}
            className="w-full gap-2 text-xs opacity-60 hover:opacity-100"
          >
            <X className="w-3.5 h-3.5" />
            {t("aiWinCard.close")}
          </Button>
        </div>
      </div>
    </div>
  );
}
