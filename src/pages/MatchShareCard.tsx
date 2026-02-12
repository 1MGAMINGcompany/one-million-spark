import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Trophy, Gamepad2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const LAMPORTS_PER_SOL = 1_000_000_000;

function shortenWallet(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

function formatSol(lamports: number | null): string {
  if (!lamports) return "0";
  return (lamports / LAMPORTS_PER_SOL).toFixed(3);
}

function formatWinReason(reason: string): string {
  return reason
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function MatchShareCard() {
  const { roomPda } = useParams<{ roomPda: string }>();
  const [match, setMatch] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!roomPda) return;
    document.title = "Match Result — 1M Gaming";

    supabase
      .from("match_share_cards")
      .select("*")
      .eq("room_pda", roomPda)
      .single()
      .then(({ data, error: err }) => {
        if (err || !data) setError(true);
        else setMatch(data);
        setLoading(false);
      });
  }, [roomPda]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading match…</div>
      </div>
    );
  }

  if (error || !match) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
        <p className="text-muted-foreground">Match not found</p>
        <Link to="/">
          <Button variant="gold">Go Home</Button>
        </Link>
      </div>
    );
  }

  const gameType = (match.game_type || "").toUpperCase();
  const solWon = formatSol(match.winner_payout_lamports);
  const winReason = formatWinReason(match.win_reason || "unknown");

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-2xl overflow-hidden border border-border bg-card shadow-gold">
        {/* Banner */}
        <img
          src="/images/1m-banner-backgmmn.jpeg"
          alt="1M Gaming"
          className="w-full h-auto object-cover"
          loading="eager"
        />

        <div className="flex flex-col items-center px-6 pb-8 -mt-10 relative">
          {/* Logo */}
          <div className="w-20 h-20 rounded-full overflow-hidden border-4 border-card shadow-gold-lg z-10">
            <img
              src="/images/1m-logo.jpeg"
              alt="1M Gaming Logo"
              className="w-full h-full object-cover"
            />
          </div>

          {/* Brand text */}
          <h1
            className="mt-3 text-2xl font-display font-bold tracking-wider"
            style={{
              background:
                "linear-gradient(135deg, #FCE68A 0%, #FACC15 50%, #AB8215 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            1M GAMING
          </h1>

          {/* Game type badge */}
          <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary/20 border border-primary/40 px-4 py-1 text-xs font-bold tracking-widest text-primary">
            <Gamepad2 className="h-3.5 w-3.5" />
            {gameType}
          </span>

          {/* Victory heading */}
          <div className="mt-5 flex items-center gap-2">
            <Trophy className="h-6 w-6 text-primary" />
            <span className="text-xl font-display font-bold text-foreground tracking-wide">
              VICTORY
            </span>
          </div>

          {/* Winner wallet */}
          {match.winner_wallet && (
            <p className="mt-2 font-mono text-sm text-muted-foreground">
              {shortenWallet(match.winner_wallet)}
            </p>
          )}

          {/* Stats row */}
          <div className="mt-5 grid grid-cols-2 gap-4 w-full">
            <div className="flex flex-col items-center rounded-xl bg-secondary/50 border border-border p-3">
              <span className="text-xs text-muted-foreground uppercase tracking-wider">
                SOL Won
              </span>
              <span className="text-lg font-bold text-primary mt-1">
                {solWon}
              </span>
            </div>
            <div className="flex flex-col items-center rounded-xl bg-secondary/50 border border-border p-3">
              <span className="text-xs text-muted-foreground uppercase tracking-wider">
                Win Reason
              </span>
              <span className="text-lg font-bold text-foreground mt-1 text-center leading-tight">
                {winReason}
              </span>
            </div>
          </div>

          {/* CTA */}
          <Link to="/" className="w-full mt-6">
            <Button variant="gold" size="lg" className="w-full text-base">
              Play Now on 1MGaming.com
            </Button>
          </Link>

          {/* Footer */}
          <p className="mt-4 text-xs text-muted-foreground/60 tracking-wide">
            Skill-Based Games on Solana
          </p>
        </div>
      </div>
    </div>
  );
}
