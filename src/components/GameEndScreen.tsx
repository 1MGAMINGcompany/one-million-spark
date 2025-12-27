import { useState, useEffect } from 'react';
import { Trophy, RefreshCw, BarChart2, Star, LogOut, Wallet, ChevronDown, ChevronUp, CheckCircle, ExternalLink, Loader2 } from 'lucide-react';
import GoldConfettiExplosion from '@/components/GoldConfettiExplosion';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useTranslation } from 'react-i18next';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { finalizeRoom } from '@/lib/finalize-room';
import { useSound } from '@/contexts/SoundContext';

// Shorten wallet address for display
function shortenAddress(address: string, chars = 4): string {
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

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

// Default pubkey (11111111111111111111111111111111) indicates no winner set yet
const DEFAULT_PUBKEY = '11111111111111111111111111111111';

/**
 * Check if error indicates room was already settled
 */
function isAlreadySettledError(rawError: string): boolean {
  const lowerError = rawError.toLowerCase();
  return lowerError.includes('roomalreadyfinished') || lowerError.includes('already finished');
}

/**
 * Map raw error strings to user-friendly messages
 */
function getFriendlyErrorMessage(rawError: string): { message: string; showDetails: boolean; autoRefresh: boolean } {
  const lowerError = rawError.toLowerCase();
  
  // Already finalized
  if (isAlreadySettledError(rawError)) {
    return {
      message: 'This game was already settled. Refreshing to show payout status…',
      showDetails: false,
      autoRefresh: true,
    };
  }
  
  // Winner invalid
  if (lowerError.includes('badwinner')) {
    return {
      message: 'Winner must be one of the players in this room.',
      showDetails: false,
      autoRefresh: false,
    };
  }
  
  // Not enough in vault
  if (lowerError.includes('insufficientvault')) {
    return {
      message: "Vault doesn't have enough SOL to pay. Double-check all players joined and deposited.",
      showDetails: false,
      autoRefresh: false,
    };
  }
  
  // Default fallback
  return {
    message: 'Finalize failed. Please try again.',
    showDetails: true,
    autoRefresh: false,
  };
}

/**
 * Parse room account data to check status and winner
 * Room account layout (simplified):
 * - status is at a known offset
 * - winner pubkey is at a known offset
 */
interface RoomPayoutInfo {
  isSettled: boolean;
  onChainWinner: string | null;
  stakeLamports: number;
  maxPlayers: number;
}

/**
 * Parse room account data to check status, winner, and stake info
 * Room account layout (simplified):
 * - 8 bytes discriminator
 * - 32 bytes host
 * - 32 bytes guest  
 * - 8 bytes entry_fee (stake per player in lamports)
 * - 1 byte status (enum: 0=Open, 1=InProgress, 2=Finished)
 * - 32 bytes winner
 */
function parseRoomData(data: Buffer): RoomPayoutInfo {
  try {
    const ENTRY_FEE_OFFSET = 8 + 32 + 32; // = 72
    const STATUS_OFFSET = ENTRY_FEE_OFFSET + 8; // = 80
    const WINNER_OFFSET = STATUS_OFFSET + 1; // = 81
    
    // Read entry_fee as 64-bit little-endian
    const stakeLamports = Number(data.readBigUInt64LE(ENTRY_FEE_OFFSET));
    
    const status = data[STATUS_OFFSET];
    const winnerBytes = data.slice(WINNER_OFFSET, WINNER_OFFSET + 32);
    const winnerPubkey = new PublicKey(winnerBytes).toBase58();
    
    // Status 2 = Finished, or winner is set (not default pubkey)
    const isFinished = status === 2;
    const winnerSet = winnerPubkey !== DEFAULT_PUBKEY;
    
    return {
      isSettled: isFinished || winnerSet,
      onChainWinner: winnerSet ? winnerPubkey : null,
      stakeLamports,
      maxPlayers: 2, // Currently 2-player games
    };
  } catch {
    return { isSettled: false, onChainWinner: null, stakeLamports: 0, maxPlayers: 2 };
  }
}

const FEE_BPS = 500; // 5% platform fee
const LAMPORTS_PER_SOL = 1_000_000_000;

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
  const { play } = useSound();
  
  const [finalizeState, setFinalizeState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  const [txSignature, setTxSignature] = useState<string | null>(null);
  
  // On-chain room status check
  const [roomAlreadySettled, setRoomAlreadySettled] = useState(false);
  const [checkingRoomStatus, setCheckingRoomStatus] = useState(true);
  const [payoutInfo, setPayoutInfo] = useState<{ pot: number; fee: number; winnerPayout: number } | null>(null);
  
  const isWinner = winner === myAddress;
  const isDraw = winner === 'draw';
  
  // Check on-chain room status on mount and compute payout info
  useEffect(() => {
    const checkRoomStatus = async () => {
      if (!roomPda || !isStaked) {
        setCheckingRoomStatus(false);
        return;
      }
      
      try {
        const accountInfo = await connection.getAccountInfo(new PublicKey(roomPda));
        if (accountInfo?.data) {
          const roomData = parseRoomData(Buffer.from(accountInfo.data));
          setRoomAlreadySettled(roomData.isSettled);
          
          // Compute payout math
          const pot = roomData.stakeLamports * roomData.maxPlayers;
          const fee = Math.floor(pot * FEE_BPS / 10_000);
          const winnerPayout = pot - fee;
          
          setPayoutInfo({
            pot: pot / LAMPORTS_PER_SOL,
            fee: fee / LAMPORTS_PER_SOL,
            winnerPayout: winnerPayout / LAMPORTS_PER_SOL,
          });
        }
      } catch (err) {
        console.warn('Failed to check room status:', err);
        // On error, allow button to show (user can still try)
      } finally {
        setCheckingRoomStatus(false);
      }
    };
    
    checkRoomStatus();
  }, [roomPda, isStaked, connection]);
  
  // Show finalize button only for staked games with a winner (not draw)
  const showFinalizeButton = isStaked && roomPda && winner && winner !== 'draw';
  const isAlreadySettled = roomAlreadySettled || finalizeState === 'success';
  
  const handleFinalize = async () => {
    if (!roomPda || !winner || !publicKey || !sendTransaction) return;
    
    setFinalizeState('loading');
    setFinalizeError(null);
    setShowErrorDetails(false);
    setTxSignature(null);
    
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
        setTxSignature(res.signature || null);
        play('chess_win'); // Play success sound
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
  
  // Auto-refresh when "already settled" error is detected
  useEffect(() => {
    if (errorInfo?.autoRefresh) {
      const timer = setTimeout(() => {
        window.location.reload();
      }, 2000); // 2 second delay to let user see the message
      return () => clearTimeout(timer);
    }
  }, [errorInfo?.autoRefresh]);
  
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
      {/* Confetti explosion on successful payout */}
      <GoldConfettiExplosion active={finalizeState === 'success'} originX={50} originY={30} />
      
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
            {showFinalizeButton && (
              <>
                {/* Payout Summary - Show before wallet interaction (only when idle) */}
                {payoutInfo && finalizeState === 'idle' && !isAlreadySettled && (
                  <div className="bg-muted/40 border border-border/50 rounded-lg p-4 space-y-2">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                      Payout Summary
                    </p>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total Pot:</span>
                        <span className="font-mono text-foreground">{payoutInfo.pot.toFixed(4)} SOL</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Platform Fee (5%):</span>
                        <span className="font-mono text-muted-foreground">{payoutInfo.fee.toFixed(4)} SOL</span>
                      </div>
                      <div className="flex justify-between border-t border-border/30 pt-1">
                        <span className="text-primary font-medium">Winner Receives:</span>
                        <span className="font-mono text-primary font-semibold">{payoutInfo.winnerPayout.toFixed(4)} SOL</span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground text-center pt-1">
                      Funds are paid directly on-chain when finalized.
                    </p>
                  </div>
                )}

                {/* Pre-transaction informational notice */}
                {finalizeState === 'idle' && !isAlreadySettled && !checkingRoomStatus && (
                  <p className="text-xs text-muted-foreground text-center">
                    You're about to settle this game on-chain.<br />
                    This will distribute the pot and cannot be undone.
                  </p>
                )}

                {/* Success State - Payout Complete */}
                {finalizeState === 'success' && (
                  <div className="bg-emerald-500/20 border border-emerald-500/50 rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-center gap-2">
                      <CheckCircle size={24} className="text-emerald-400" />
                      <p className="text-emerald-400 font-semibold text-lg">Payout Complete</p>
                    </div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Winner:</span>
                        <span className="font-mono text-foreground">{winner ? shortenAddress(winner) : '—'}</span>
                      </div>
                      {payoutInfo && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Amount Received:</span>
                          <span className="font-mono text-emerald-400 font-semibold">{payoutInfo.winnerPayout.toFixed(4)} SOL</span>
                        </div>
                      )}
                    </div>
                    {txSignature && (
                      <a
                        href={`https://explorer.solana.com/tx/${txSignature}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
                      >
                        <ExternalLink size={12} />
                        View transaction on Solana Explorer
                      </a>
                    )}
                  </div>
                )}

                {/* Already Settled State (detected on load) */}
                {isAlreadySettled && finalizeState !== 'success' && (
                  <div className="bg-emerald-500/20 border border-emerald-500/50 rounded-lg p-4 text-center flex items-center justify-center gap-2">
                    <CheckCircle size={20} className="text-emerald-400" />
                    <p className="text-emerald-400 font-semibold">Already Settled</p>
                  </div>
                )}

                {/* Loading State */}
                {finalizeState === 'loading' && (
                  <Button 
                    disabled
                    className="w-full gap-2 bg-amber-600/70 text-white font-semibold py-6"
                  >
                    <Loader2 size={20} className="animate-spin" />
                    Finalizing…
                  </Button>
                )}

                {/* Idle State - Active Finalize Button */}
                {finalizeState === 'idle' && !isAlreadySettled && (
                  <Button 
                    onClick={handleFinalize}
                    disabled={!publicKey || checkingRoomStatus}
                    className="w-full gap-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold py-6"
                  >
                    <Wallet size={20} />
                    {checkingRoomStatus ? 'Checking status…' : 'Settle Payout (Finalize)'}
                  </Button>
                )}

                {/* Error State - Show button again to retry */}
                {finalizeState === 'error' && (
                  <Button 
                    onClick={handleFinalize}
                    disabled={!publicKey}
                    className="w-full gap-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold py-6"
                  >
                    <Wallet size={20} />
                    Retry Settlement
                  </Button>
                )}
              </>
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
