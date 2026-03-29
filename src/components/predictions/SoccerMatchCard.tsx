import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronRight, ChevronDown, Trophy } from "lucide-react";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import type { Fight } from "./FightCard";
import PredictionInsightsPanel from "./PredictionInsightsPanel";
import SmartMoneyTracker from "./SmartMoneyTracker";

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  open: { label: "OPEN", className: "bg-green-500/20 text-green-400" },
  locked: { label: "LOCKED", className: "bg-yellow-500/20 text-yellow-400" },
  live: { label: "LIVE", className: "bg-red-500/20 text-red-400 animate-pulse" },
  settled: { label: "SETTLED", className: "bg-primary/20 text-primary" },
  draw: { label: "DRAW", className: "bg-muted text-muted-foreground" },
  cancelled: { label: "CANCELLED", className: "bg-muted text-muted-foreground" },
};

function formatPercent(price: number | null | undefined): string {
  if (!price || price <= 0) return "—";
  return `${Math.round(price * 100)}%`;
}

function formatVolume(usd: number): string {
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
  if (usd >= 1_000) return `$${(usd / 1_000).toFixed(1)}K`;
  if (usd > 0) return `$${usd.toFixed(0)}`;
  return "";
}

function extractTeamFromTitle(title: string): string {
  const willMatch = title.match(/^Will\s+(.+?)\s+win/i);
  if (willMatch) return willMatch[1].trim();
  const dash = title.split(" — ")[0];
  return dash || title;
}

/** Estimate potential winnings based on pool-share model */
function estimateWin(price: number | null | undefined, amount: number, feeRate: number): number {
  if (!price || price <= 0 || amount <= 0) return 0;
  const net = amount * (1 - feeRate);
  // Multiplier = 1 / price (e.g. price 0.4 → 2.5x)
  return net * (1 / price);
}

function getFeeRate(fight: Fight): number {
  if (fight.commission_bps != null) return fight.commission_bps / 10_000;
  return fight.source === "polymarket" ? 0.02 : 0.05;
}

interface SoccerMatchCardProps {
  homeFight: Fight;
  awayFight: Fight;
  drawFight?: Fight | null;
  wallet: string | null;
  onPredict: (fight: Fight, pick: "fighter_a" | "fighter_b") => void;
  userEntries: any[];
  onWalletRequired?: () => void;
  eventHasStarted?: boolean;
  readOnly?: boolean;
}

export default function SoccerMatchCard({
  homeFight,
  awayFight,
  drawFight,
  wallet,
  onPredict,
  userEntries,
  onWalletRequired,
  eventHasStarted,
  readOnly,
}: SoccerMatchCardProps) {
  const navigate = useNavigate();
  const [selectedFight, setSelectedFight] = useState<Fight | null>(null);
  const [amount, setAmount] = useState("");

  const allFights = [homeFight, awayFight, drawFight].filter(Boolean) as Fight[];
  const groupStatus = allFights.some(f => f.status === "live") ? "live"
    : allFights.some(f => f.status === "open") ? "open"
    : allFights.some(f => f.status === "locked") ? "locked"
    : allFights[0]?.status || "open";

  const effectiveStatus = eventHasStarted && groupStatus === "open" ? "locked" : groupStatus;
  const isOpen = effectiveStatus === "open";
  const badge = STATUS_BADGE[effectiveStatus] || STATUS_BADGE.open;

  const homeTeam = extractTeamFromTitle(homeFight.title);
  const awayTeam = extractTeamFromTitle(awayFight.title);

  const homePrice = homeFight.price_a;
  const awayPrice = awayFight.price_a;
  const drawPrice = drawFight?.price_a;

  const eventName = homeFight.event_name || awayFight.event_name;
  const [eventHome] = eventName.split(/\s+vs\.?\s+/i);
  const homeIsEventHome = homeFight.title.toLowerCase().includes((eventHome || "").toLowerCase().trim());
  const anyFight = allFights[0];
  const homeLogo = homeIsEventHome ? anyFight.home_logo : anyFight.away_logo;
  const awayLogo = homeIsEventHome ? anyFight.away_logo : anyFight.home_logo;

  const totalVolume = allFights.reduce((sum, f) => sum + (f.polymarket_volume_usd ?? 0), 0);

  const allFightIds = new Set(allFights.map(f => f.id));
  const myEntries = userEntries.filter(e => allFightIds.has(e.fight_id));
  const hasBet = myEntries.length > 0;

  const matchTitle = homeFight.event_name || `${homeTeam} vs ${awayTeam}`;

  // Win calculation
  const amountNum = parseFloat(amount) || 0;
  const selectedPrice = selectedFight
    ? (selectedFight.id === homeFight.id ? homePrice
      : selectedFight.id === awayFight.id ? awayPrice
      : drawPrice)
    : null;
  const feeRate = selectedFight ? getFeeRate(selectedFight) : 0.02;
  const estimatedWin = estimateWin(selectedPrice, amountNum, feeRate);

  const handleSelect = (fight: Fight) => {
    if (readOnly || !isOpen) return;
    if (!wallet) {
      onWalletRequired?.();
      return;
    }
    setSelectedFight(prev => prev?.id === fight.id ? null : fight);
    setAmount("");
  };

  const handlePlacePrediction = () => {
    if (!selectedFight || amountNum < 1) return;
    onPredict(selectedFight, "fighter_a");
  };

  const isSelected = (fight: Fight) => selectedFight?.id === fight.id;

  return (
    <Card className="overflow-hidden border-border/50 hover:border-primary/30 transition-all">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <span className="text-base">⚽</span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Match Prediction
          </span>
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badge.className}`}>
          {badge.label}
        </span>
      </div>

      {/* Match title with flags */}
      <div className="px-4 pb-2 flex items-center gap-2">
        {homeLogo && <img src={homeLogo} alt="" className="w-5 h-5 object-contain" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
        <h3 className="text-sm font-bold text-foreground truncate flex-1">{matchTitle}</h3>
        {awayLogo && <img src={awayLogo} alt="" className="w-5 h-5 object-contain" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
      </div>

      {/* WHO WINS? */}
      <div className="px-4 pb-1">
        <p className="text-xs font-bold text-center text-muted-foreground uppercase tracking-wider">Who Wins?</p>
      </div>

      {/* 3-way outcome buttons – larger, mobile-friendly */}
      <div className="px-4 pb-3">
        <div className="grid grid-cols-3 gap-2">
          <OutcomeButton
            logo={homeLogo}
            teamName={homeTeam}
            price={homePrice}
            selected={isSelected(homeFight)}
            disabled={!isOpen || readOnly}
            hasBet={myEntries.some(e => e.fight_id === homeFight.id)}
            onClick={() => handleSelect(homeFight)}
          />
          {drawFight && (
            <OutcomeButton
              emoji="🤝"
              teamName="Draw"
              price={drawPrice}
              selected={isSelected(drawFight)}
              disabled={!isOpen || readOnly}
              hasBet={myEntries.some(e => e.fight_id === drawFight.id)}
              onClick={() => handleSelect(drawFight)}
            />
          )}
          <OutcomeButton
            logo={awayLogo}
            teamName={awayTeam}
            price={awayPrice}
            selected={isSelected(awayFight)}
            disabled={!isOpen || readOnly}
            hasBet={myEntries.some(e => e.fight_id === awayFight.id)}
            onClick={() => handleSelect(awayFight)}
          />
        </div>
      </div>

      {/* Inline bet input + win calculation (shown after selection) */}
      {selectedFight && isOpen && (
        <div className="px-4 pb-4 space-y-3">
          <div className="space-y-2">
            <Input
              type="number"
              inputMode="decimal"
              placeholder="Enter Amount (USD)"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="text-center text-lg font-bold h-12 bg-background border-border"
              min="1"
              step="1"
            />

            {/* Live win calculation */}
            {amountNum >= 1 && (
              <div className="text-center py-2 bg-green-500/10 border border-green-500/20 rounded-lg">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">You Win</p>
                <p className="text-2xl font-extrabold text-green-400">
                  ${estimatedWin.toFixed(2)}
                </p>
              </div>
            )}

            <p className="text-[10px] text-muted-foreground text-center">
              Winners share the pool.
            </p>
          </div>

          {/* Primary CTA */}
          <Button
            onClick={handlePlacePrediction}
            disabled={amountNum < 1}
            className="w-full h-12 text-base font-extrabold bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.97] transition-all uppercase tracking-wide"
          >
            Place Prediction
          </Button>
        </div>
      )}

      {/* Collapsible insights */}
      <div className="px-4 pb-3">
        <Collapsible>
          <CollapsibleTrigger className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors w-full justify-center py-1">
            <ChevronDown className="w-3.5 h-3.5" />
            <span className="font-semibold">Show Insights</span>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2 space-y-2">
            <PredictionInsightsPanel fight={homeFight} />
            <SmartMoneyTracker fight={homeFight} />
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Footer: volume + detail link */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-border/30 bg-background/30">
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          {totalVolume > 0 && (
            <span className="font-bold text-primary">{formatVolume(totalVolume)} Vol.</span>
          )}
          {hasBet && (
            <span className="text-green-400 font-bold">✓ You predicted</span>
          )}
        </div>
        <button
          onClick={() => navigate(`/predictions/${homeFight.id}`)}
          className="flex items-center gap-1 text-[10px] text-primary hover:underline font-medium"
        >
          View Odds & Details <ChevronRight className="w-3 h-3" />
        </button>
      </div>
    </Card>
  );
}

function OutcomeButton({
  logo,
  emoji,
  teamName,
  price,
  selected,
  disabled,
  hasBet,
  onClick,
}: {
  logo?: string | null;
  emoji?: string;
  teamName: string;
  price: number | null | undefined;
  selected?: boolean;
  disabled?: boolean;
  hasBet?: boolean;
  onClick: () => void;
}) {
  const baseClass = selected
    ? "border-primary bg-primary/15 ring-2 ring-primary/50"
    : hasBet
      ? "border-primary/30 ring-1 ring-primary/30"
      : "border-border/40 hover:border-primary/40 hover:bg-primary/5";

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center gap-2 rounded-xl border p-4 transition-all ${baseClass} ${
        disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer active:scale-[0.97]"
      }`}
    >
      {logo ? (
        <img src={logo} alt={teamName} className="w-10 h-10 object-contain rounded-sm" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
      ) : emoji ? (
        <span className="text-3xl">{emoji}</span>
      ) : (
        <span className="text-3xl">⚽</span>
      )}
      <span className="text-xs font-bold text-foreground text-center leading-tight line-clamp-2">
        {teamName}
      </span>
      <span className={`text-lg font-extrabold ${selected ? "text-primary" : "text-foreground"}`}>
        {formatPercent(price)}
      </span>
    </button>
  );
}
