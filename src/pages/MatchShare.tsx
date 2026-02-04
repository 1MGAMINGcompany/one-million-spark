import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, Copy, Check, ExternalLink, Swords, Clock, Flag, XCircle, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface MatchData {
  room_pda: string;
  created_at: string;
  mode: string;
  game_type: string;
  winner_wallet: string | null;
  loser_wallet: string | null;
  win_reason: string;
  stake_lamports: number;
  winner_rank_before: number | null;
  winner_rank_after: number | null;
  loser_rank_before: number | null;
  loser_rank_after: number | null;
  tx_signature: string | null;
}

const WIN_REASON_ICONS: Record<string, React.ReactNode> = {
  checkmate: <Trophy className="h-5 w-5" />,
  resign: <Flag className="h-5 w-5" />,
  forfeit: <XCircle className="h-5 w-5" />,
  timeout: <Clock className="h-5 w-5" />,
  void: <AlertTriangle className="h-5 w-5" />,
  default: <Swords className="h-5 w-5" />,
};

const WIN_REASON_LABELS: Record<string, string> = {
  checkmate: "Checkmate",
  resign: "Resignation",
  forfeit: "Forfeit",
  timeout: "Timeout",
  void: "Void (Failed Settlement)",
  bearoff: "Bear Off",
  blocked: "Blocked",
  unknown: "Match Complete",
};

function shortenWallet(wallet: string | null): string {
  if (!wallet) return "Unknown";
  return `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;
}

function formatStake(lamports: number): string {
  const sol = lamports / 1e9;
  if (sol === 0) return "Free";
  return `${sol.toFixed(4)} SOL`;
}

function formatGameType(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

export default function MatchShare() {
  const { roomPda } = useParams<{ roomPda: string }>();
  const { toast } = useToast();
  const [match, setMatch] = useState<MatchData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!roomPda) return;

    async function fetchMatch() {
      setLoading(true);
      setError(null);

      try {
        const { data, error: fnError } = await supabase.functions.invoke("match-get", {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          body: null,
        });

        // Workaround: functions.invoke doesn't support query params well, use fetch
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/match-get?roomPda=${encodeURIComponent(roomPda)}`,
          {
            method: "GET",
            headers: {
              "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              "Content-Type": "application/json",
            },
          }
        );

        const result = await response.json();

        if (!response.ok || !result.success) {
          setError(result.error || "Match not found");
          return;
        }

        setMatch(result.match);
      } catch (err) {
        console.error("[MatchShare] Fetch error:", err);
        setError("Failed to load match data");
      } finally {
        setLoading(false);
      }
    }

    fetchMatch();
  }, [roomPda]);

  const handleCopyLink = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast({ title: "Link copied!", description: "Share this match with friends" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="container max-w-lg mx-auto py-12 px-4">
        <Card className="bg-card/80 backdrop-blur-sm border-primary/20">
          <CardHeader>
            <Skeleton className="h-8 w-48 mx-auto" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-10 w-32 mx-auto" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !match) {
    return (
      <div className="container max-w-lg mx-auto py-12 px-4">
        <Card className="bg-card/80 backdrop-blur-sm border-destructive/30">
          <CardContent className="py-12 text-center">
            <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-destructive" />
            <h2 className="text-xl font-bold mb-2">Match Not Found</h2>
            <p className="text-muted-foreground mb-6">{error || "This match doesn't exist or hasn't been recorded yet."}</p>
            <Button asChild variant="outline">
              <Link to="/">Back to Home</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isVoid = match.win_reason === "void";
  const winReasonIcon = WIN_REASON_ICONS[match.win_reason] || WIN_REASON_ICONS.default;
  const winReasonLabel = WIN_REASON_LABELS[match.win_reason] || match.win_reason;

  return (
    <div className="container max-w-lg mx-auto py-12 px-4">
      <Card className="bg-card/80 backdrop-blur-sm border-primary/20 overflow-hidden">
        {/* Header with game type */}
        <div className="bg-gradient-to-r from-primary/20 to-accent/20 px-6 py-4 border-b border-primary/10">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">{formatGameType(match.game_type)}</h1>
            <Badge variant={match.mode === "ranked" ? "default" : "secondary"}>
              {match.mode === "ranked" ? "Ranked" : match.mode === "private" ? "Private" : "Casual"}
            </Badge>
          </div>
        </div>

        <CardContent className="pt-6 space-y-6">
          {/* Result */}
          <div className="text-center space-y-2">
            <div className="flex items-center justify-center gap-2 text-primary">
              {winReasonIcon}
              <span className="font-semibold">{winReasonLabel}</span>
            </div>

            {!isVoid && match.winner_wallet && (
              <div className="py-4">
                <div className="flex items-center justify-center gap-3">
                  <Trophy className="h-8 w-8 text-yellow-500" />
                  <div>
                    <p className="text-sm text-muted-foreground">Winner</p>
                    <p className="text-xl font-bold font-mono">{shortenWallet(match.winner_wallet)}</p>
                  </div>
                </div>
              </div>
            )}

            {isVoid && (
              <p className="text-muted-foreground text-sm">
                Settlement failed - no winner recorded
              </p>
            )}
          </div>

          {/* Players */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-muted/30 rounded-lg p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">
                {!isVoid && match.winner_wallet ? "Winner" : "Player 1"}
              </p>
              <p className="font-mono font-semibold">{shortenWallet(match.winner_wallet)}</p>
              {match.mode === "ranked" && match.winner_rank_after && (
                <p className="text-xs text-primary mt-1">
                  Rating: {match.winner_rank_after}
                  {match.winner_rank_before && match.winner_rank_before !== match.winner_rank_after && (
                    <span className="text-accent ml-1">
                      (+{match.winner_rank_after - match.winner_rank_before})
                    </span>
                  )}
                </p>
              )}
            </div>
            <div className="bg-muted/30 rounded-lg p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">
                {!isVoid && match.loser_wallet ? "Opponent" : "Player 2"}
              </p>
              <p className="font-mono font-semibold">{shortenWallet(match.loser_wallet)}</p>
              {match.mode === "ranked" && match.loser_rank_after && (
                <p className="text-xs text-destructive mt-1">
                  Rating: {match.loser_rank_after}
                  {match.loser_rank_before && match.loser_rank_before !== match.loser_rank_after && (
                    <span className="text-destructive ml-1">
                      ({match.loser_rank_after - match.loser_rank_before})
                    </span>
                  )}
                </p>
              )}
            </div>
          </div>

          {/* Stake */}
          <div className="text-center py-2">
            <p className="text-sm text-muted-foreground">Stake</p>
            <p className="text-2xl font-bold text-accent">{formatStake(match.stake_lamports)}</p>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <Button onClick={handleCopyLink} className="flex-1">
              {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
              {copied ? "Copied!" : "Share Link"}
            </Button>
            {match.tx_signature && (
              <Button variant="outline" asChild className="flex-1">
                <a
                  href={`https://solscan.io/tx/${match.tx_signature}?cluster=devnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  View on Solscan
                </a>
              </Button>
            )}
          </div>

          {/* Timestamp */}
          <p className="text-center text-xs text-muted-foreground">
            {new Date(match.created_at).toLocaleString()}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
