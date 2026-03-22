import { useState, useEffect, useMemo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import muayThaiImg from "@/assets/muay-thai.png";

/** Next Friday at 11:30 UTC (7:30 AM ET / 7:30 PM Bangkok) */
function getNextFridayEvent(): Date {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(11, 30, 0, 0);
  const day = now.getUTCDay(); // 0=Sun
  let daysUntilFriday = (5 - day + 7) % 7;
  // If it's Friday but past the 4h live window, jump to next week
  if (daysUntilFriday === 0 && now.getTime() > next.getTime() + 4 * 3600_000) {
    daysUntilFriday = 7;
  }
  next.setUTCDate(now.getUTCDate() + daysUntilFriday);
  return next;
}

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

function useCountdown() {
  const [target] = useState(getNextFridayEvent);
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const diff = target.getTime() - now;
  const isLive = diff <= 0 && diff > -4 * 3600_000;
  const isPast = diff <= -4 * 3600_000;

  const timeLeft: TimeLeft = useMemo(() => {
    if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 };
    return {
      days: Math.floor(diff / 86_400_000),
      hours: Math.floor((diff % 86_400_000) / 3_600_000),
      minutes: Math.floor((diff % 3_600_000) / 60_000),
      seconds: Math.floor((diff % 60_000) / 1000),
    };
  }, [diff]);

  return { timeLeft, isLive, isPast, target };
}

function CountdownBox({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="bg-card border border-border rounded-lg w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center">
        <span className="text-2xl sm:text-3xl font-bold text-primary font-['Cinzel']">
          {String(value).padStart(2, "0")}
        </span>
      </div>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1.5">{label}</span>
    </div>
  );
}

function SkeletonFightCards() {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground text-center">Fight card coming soon...</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="bg-card border border-border rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton className="w-14 h-14 rounded-full" />
              <span className="text-xs font-bold text-muted-foreground">VS</span>
              <Skeleton className="w-14 h-14 rounded-full" />
            </div>
            <div className="flex justify-between">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-4 w-24 mx-auto" />
            <Skeleton className="h-9 w-full rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ONEFridayFightsHub({ hasFights }: { hasFights: boolean }) {
  const { timeLeft, isLive } = useCountdown();

  return (
    <div className="space-y-5 mb-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-3">
          <img src={muayThaiImg} alt="Muay Thai" className="w-8 h-8 object-contain" />
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground font-['Cinzel']">
            ONE Friday Fights
          </h2>
          <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">
            Weekly Event
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">Live Every Friday Night from Bangkok</p>
      </div>

      {/* Countdown / Live banner */}
      <div className="bg-card border border-border rounded-xl p-5 text-center">
        {isLive ? (
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 bg-destructive/15 border border-destructive/30 rounded-full px-5 py-2">
              <span className="w-2.5 h-2.5 rounded-full bg-destructive animate-pulse shadow-[0_0_8px_hsl(var(--destructive)/0.6)]" />
              <span className="text-lg font-bold text-destructive font-['Cinzel']">🔴 LIVE NOW</span>
            </div>
            <p className="text-xs text-muted-foreground">Fights are happening right now in Bangkok!</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              Next Event Starts In:
            </p>
            <div className="flex justify-center gap-3">
              <CountdownBox value={timeLeft.days} label="Days" />
              <CountdownBox value={timeLeft.hours} label="Hours" />
              <CountdownBox value={timeLeft.minutes} label="Mins" />
              <CountdownBox value={timeLeft.seconds} label="Secs" />
            </div>
            <p className="text-xs text-muted-foreground italic">
              Fast fights. Big moments. Every Friday.
            </p>
          </div>
        )}
      </div>

      {/* Info card */}
      <div className="bg-card border border-border rounded-xl p-4">
        <p className="text-sm text-foreground leading-relaxed">
          <span className="font-bold">🔥 Weekly Muay Thai Action</span>
          <br /><br />
          ONE Friday Fights takes place every Friday night in Bangkok.
          As soon as fight cards are confirmed, prediction markets open for each fight.
          <br /><br />
          Make your picks before the fights start and follow the action live.
        </p>
      </div>

      {/* Skeleton cards when no fights */}
      {!hasFights && <SkeletonFightCards />}
    </div>
  );
}
