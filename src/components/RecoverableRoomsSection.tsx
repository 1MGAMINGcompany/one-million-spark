/**
 * Recoverable Rooms Section
 * Shows rooms where the connected wallet has potentially stuck funds
 */

import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw, Gamepad2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RecoverFundsButton } from '@/components/RecoverFundsButton';
import { supabase } from '@/integrations/supabase/client';

interface RecoverableRoom {
  room_pda: string;
  game_type: string;
  player1_wallet: string;
  player2_wallet: string | null;
  created_at: string;
  updated_at: string;
}

interface RecoverableRoomsSectionProps {
  wallet: string;
}

function shortenPda(pda: string): string {
  if (!pda || pda.length < 12) return pda;
  return `${pda.slice(0, 6)}…${pda.slice(-4)}`;
}

/**
 * Validate that a string looks like a valid Solana PDA (base58, 32-44 chars)
 * Base58 alphabet excludes: 0, O, I, l
 */
function isValidSolanaPda(pda: string): boolean {
  if (!pda || pda.length < 32 || pda.length > 44) return false;
  // Base58 character set (no 0, O, I, l)
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
  return base58Regex.test(pda);
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffDays > 0) return `${diffDays}d ago`;
  if (diffHours > 0) return `${diffHours}h ago`;
  return 'Just now';
}

export function RecoverableRoomsSection({ wallet }: RecoverableRoomsSectionProps) {
  const [rooms, setRooms] = useState<RecoverableRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchRooms = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      // Use Edge Function instead of direct table access (RLS locked)
      const { data: resp, error } = await supabase.functions.invoke("game-sessions-list", {
        body: { type: "recoverable_for_wallet", wallet },
      });

      if (error) {
        console.error('[RecoverableRooms] Failed to fetch:', error);
        return;
      }

      const rows = resp?.rows ?? [];
      setRooms(rows);
    } catch (err) {
      console.error('[RecoverableRooms] Error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchRooms();
  }, [wallet]);

  const handleRecovered = () => {
    // Refresh the list after successful recovery
    fetchRooms(true);
  };

  if (loading) {
    return (
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="py-8">
          <div className="flex items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Checking for stuck rooms…</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (rooms.length === 0) {
    return null; // Don't show section if no stuck rooms
  }

  return (
    <Card className="border-amber-500/30 bg-amber-500/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-amber-400">
            <AlertTriangle className="h-5 w-5" />
            Stuck Rooms
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fetchRooms(true)}
            disabled={refreshing}
            className="h-8 text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          These rooms may have stuck funds. You can attempt recovery below.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {rooms.map((room) => {
          const isCreator = room.player1_wallet === wallet;
          const hasOpponent = !!room.player2_wallet;
          const validPda = isValidSolanaPda(room.room_pda);
          
          return (
            <div
              key={room.room_pda || crypto.randomUUID()}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-muted/30 rounded-lg border border-border/50"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Gamepad2 className="h-4 w-4 text-primary" />
                  <span className="font-medium capitalize">{room.game_type}</span>
                  <span className="text-xs text-muted-foreground">
                    • {formatTimeAgo(room.created_at)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground font-mono truncate">
                  {shortenPda(room.room_pda)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Role: <span className="text-foreground">{isCreator ? 'Creator' : 'Joiner'}</span>
                  {!hasOpponent && isCreator && (
                    <span className="text-amber-400 ml-2">(awaiting opponent)</span>
                  )}
                </p>
                {!validPda && (
                  <p className="text-xs text-destructive mt-1">
                    ⚠️ Invalid room data — cannot recover
                  </p>
                )}
              </div>
              {validPda && (
                <RecoverFundsButton
                  roomPda={room.room_pda}
                  onRecovered={handleRecovered}
                />
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
