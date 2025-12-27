import { useState } from 'react';
import { Trophy, RefreshCw, BarChart2, Star, LogOut, Wallet, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useTranslation } from 'react-i18next';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { finalizeRoom } from '@/lib/finalize-room';

interface GameEndScreenProps {
  gameType: string;
  winner: string | null; // wallet address or 'draw'
  winnerName?: string;
  myAddress: string | null;
  players: { address: string; name: string; color?: string }[];
  onRematch: () => void;
  onViewStats?: () => void;
  onFavorite?: () => void;
  onExit: () => void;
  result?: string; // e.g., "Checkmate", "Stalemate", "Timeout"
  roomPda?: string; // Room PDA for finalization
  isStaked?: boolean; // Whether this is a staked game requiring finalization
}

/**
 * Map raw error strings to user-friendly messages
 */
function getFriendlyErrorMessage(rawError: string): { message: string; showDetails: boolean } {
  const lowerError = rawError.toLowerCase();
  
  // Already finalized
  if (lowerError.includes('roomalreadyfinished') || lowerError.includes('already finished')) {
    return {
      message: 'This game was already settled. Refresh to see the payout status.',
      showDetails: false,
    };
  }
  
  // Winner invalid
  if (lowerError.includes('badwinner')) {
    return {
      message: 'Winner must be one of the players in this room.',
      showDetails: false,
    };
  }
  
  // Not enough in vault
  if (lowerError.includes('insufficientvault')) {
    return {
      message: "Vault doesn't have enough SOL to pay. Double-check all players joined and deposited.",
      showDetails: false,
    };
  }
  
  // Default fallback
  return {
    message: 'Finalize failed. Please try again.',
    showDetails: true,
  };
}

export function GameEndScreen({
  gameType,
  winner,
  winnerName,
  myAddress,
  players,
  onRematch,
  onViewStats,
  onFavorite,
  onExit,
  result,
  roomPda,
  isStaked,
}: GameEndScreenProps) {
  const { t } = useTranslation();
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  
  const [finalizeState, setFinalizeState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  
  const isWinner = winner === myAddress;
  const isDraw = winner === 'draw';
  
  // Show finalize button only for staked games with a winner (not draw)
  const showFinalizeButton = isStaked && roomPda && winner && winner !== 'draw';
  
  const handleFinalize = async () => {
    if (!roomPda || !winner || !publicKey || !sendTransaction) return;
    
    setFinalizeState('loading');
    setFinalizeError(null);
    setShowErrorDetails(false);
    
    try {
      const res = await finalizeRoom(
        connection,
        new PublicKey(roomPda),
        new PublicKey(winner),
        sendTransaction,
        publicKey
      );
      
      if (res.ok) {
        setFinalizeState('success');
      } else {
        setFinalizeState('error');
        setFinalizeError(res.error || 'Unknown error');
      }
    } catch (err: any) {
      setFinalizeState('error');
      setFinalizeError(err.message || 'Failed to finalize');
    }
  };
  
  // Get friendly error message
  const errorInfo = finalizeError ? getFriendlyErrorMessage(finalizeError) : null;
  
  const getResultText = () => {
    if (isDraw) return 'Draw';
    if (isWinner) return 'You Won!';
    return 'You Lost';
  };

  const getResultColor = () => {
    if (isDraw) return 'text-muted-foreground';
    if (isWinner) return 'text-primary';
    return 'text-destructive';
  };

  return (
    <div className="fixed inset-0 bg-background/95 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-card border-primary/30 shadow-2xl">
        <div className="p-6 space-y-6">
          {/* Trophy Icon */}
          <div className="flex justify-center">
            <div className={`p-4 rounded-full ${isWinner ? 'bg-primary/20' : isDraw ? 'bg-muted' : 'bg-destructive/20'}`}>
              <Trophy 
                size={48} 
                className={isWinner ? 'text-primary' : isDraw ? 'text-muted-foreground' : 'text-destructive'} 
              />
            </div>
          </div>

          {/* Result Text */}
          <div className="text-center space-y-2">
            <h2 className="text-sm uppercase tracking-wider text-muted-foreground">
              Match Complete
            </h2>
            <h1 className={`text-3xl font-bold ${getResultColor()}`}>
              {getResultText()}
            </h1>
            {result && (
              <p className="text-muted-foreground">
                {result}
              </p>
            )}
          </div>

          {/* Winner Info */}
          {!isDraw && winnerName && (
            <div className="bg-muted/30 rounded-lg p-4 text-center">
              <p className="text-sm text-muted-foreground mb-1">Winner</p>
              <p className="font-mono text-foreground">{winnerName}</p>
            </div>
          )}

          {/* Players List */}
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Players</p>
            <div className="space-y-1">
              {players.map((player) => (
                <div 
                  key={player.address}
                  className={`flex items-center justify-between p-2 rounded ${
                    player.address === winner ? 'bg-primary/10 border border-primary/30' : 'bg-muted/30'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {player.color && (
                      <div 
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: player.color }}
                      />
                    )}
                    <span className="font-mono text-sm">{player.name}</span>
                  </div>
                  {player.address === winner && (
                    <Trophy size={14} className="text-primary" />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            {/* Finalize Payout Button - Only for staked games */}
            {showFinalizeButton && finalizeState !== 'success' && (
              <Button 
                onClick={handleFinalize}
                disabled={finalizeState === 'loading' || !publicKey}
                className="w-full gap-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold py-6"
              >
                <Wallet size={20} />
                {finalizeState === 'loading' ? 'Finalizing…' : 'Settle Payout (Finalize)'}
              </Button>
            )}
            
            {/* Finalize Success Message */}
            {finalizeState === 'success' && (
              <div className="bg-emerald-500/20 border border-emerald-500/50 rounded-lg p-4 text-center">
                <p className="text-emerald-400 font-semibold">Payout Complete</p>
              </div>
            )}
            
            {/* Finalize Error Message */}
            {finalizeState === 'error' && errorInfo && (
              <div className="bg-destructive/20 border border-destructive/50 rounded-lg p-3 space-y-2">
                <p className="text-destructive text-sm text-center">{errorInfo.message}</p>
                
                {/* Details dropdown for unknown errors */}
                {errorInfo.showDetails && finalizeError && (
                  <div className="space-y-1">
                    <button
                      onClick={() => setShowErrorDetails(!showErrorDetails)}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mx-auto"
                    >
                      {showErrorDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      Details
                    </button>
                    {showErrorDetails && (
                      <pre className="text-xs text-muted-foreground bg-muted/50 rounded p-2 overflow-x-auto max-h-24 overflow-y-auto">
                        {finalizeError}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Primary: Rematch */}
            <Button 
              onClick={onRematch}
              className="w-full gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-6 relative overflow-hidden group"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-primary/0 via-primary-foreground/10 to-primary/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
              <RefreshCw size={20} className="group-hover:rotate-180 transition-transform duration-500" />
              Rematch
            </Button>

            {/* Secondary Actions */}
            <div className="flex gap-2">
              {onViewStats && (
                <Button 
                  variant="outline" 
                  onClick={onViewStats}
                  className="flex-1 gap-2 border-border/50"
                >
                  <BarChart2 size={16} />
                  Stats
                </Button>
              )}
              {onFavorite && (
                <Button 
                  variant="outline" 
                  onClick={onFavorite}
                  className="flex-1 gap-2 border-border/50"
                >
                  <Star size={16} />
                  Favorite
                </Button>
              )}
              <Button 
                variant="outline" 
                onClick={onExit}
                className="flex-1 gap-2 border-border/50"
              >
                <LogOut size={16} />
                Exit
              </Button>
            </div>
          </div>

          {/* Legal Text */}
          <p className="text-xs text-center text-muted-foreground">
            Rematch creates a new game with new terms. Both players must accept and sign again.
          </p>
        </div>
      </Card>
    </div>
  );
}
