import { useState, useEffect } from 'react';
import { X, Check, Loader2, Clock, Coins, Users, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useSolPrice } from '@/hooks/useSolPrice';
import { useWallet } from '@/hooks/useWallet';
import { useWallet as useSolanaWallet } from '@solana/wallet-adapter-react';

interface RematchData {
  roomId: string;
  settings: {
    gameType: string;
    stakeAmount: number;
    timePerTurn: number;
    players: string[];
  };
  signature: string;
  creator: string;
  createdAt: number;
  status: string;
  acceptedPlayers: string[];
}

interface RematchAcceptModalProps {
  isOpen: boolean;
  onClose: () => void;
  rematchData: RematchData | null;
  onAccept: (roomId: string) => Promise<void>;
  onDecline: (roomId: string) => void;
}

export function RematchAcceptModal({
  isOpen,
  onClose,
  rematchData,
  onAccept,
  onDecline,
}: RematchAcceptModalProps) {
  const { price: solPrice } = useSolPrice();
  const { address, publicKey } = useWallet();
  const { signMessage } = useSolanaWallet();
  const [rulesAccepted, setRulesAccepted] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [isExpired, setIsExpired] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);

  const EXPIRY_DURATION = 10 * 1000; // 10 seconds

  // Countdown timer
  useEffect(() => {
    if (!rematchData || !isOpen) return;

    const expiryTime = rematchData.createdAt + EXPIRY_DURATION;
    
    const updateTimer = () => {
      const remaining = Math.max(0, expiryTime - Date.now());
      setTimeRemaining(remaining);
      setIsExpired(remaining === 0);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 100);

    return () => clearInterval(interval);
  }, [rematchData, isOpen]);

  if (!rematchData) return null;

  const formatUsd = (sol: number) => {
    if (!solPrice) return '';
    return `~$${(sol * solPrice).toFixed(2)}`;
  };

  const formatTimeLabel = (seconds: number) => {
    if (seconds === 0) return 'Unlimited';
    if (seconds < 60) return `${seconds} seconds`;
    return `${seconds / 60} minutes`;
  };

  const formatAddress = (addr: string) => {
    if (!addr) return 'Unknown';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const formatCountdown = (ms: number) => {
    const seconds = Math.ceil(ms / 1000);
    return `${seconds}s`;
  };

  const countdownProgress = (timeRemaining / EXPIRY_DURATION) * 100;

  const creatorName = rematchData.creator === address 
    ? 'You' 
    : formatAddress(rematchData.creator);

  const isCreator = rematchData.creator === address;
  const alreadyAccepted = rematchData.acceptedPlayers.includes(address || '');

  const handleAccept = async () => {
    if (!rulesAccepted || !termsAccepted) {
      toast.error('Please accept all terms');
      return;
    }

    if (!publicKey || !address) {
      toast.error('Please connect your wallet');
      return;
    }

    if (!signMessage) {
      toast.error('Wallet does not support message signing');
      return;
    }

    setIsSigning(true);
    try {
      // Request signature for acceptance using standard wallet adapter
      const timestamp = Date.now();
      const message = `I accept the ${rematchData.settings.gameType} rematch with stake ${rematchData.settings.stakeAmount} SOL. Room: ${rematchData.roomId}. Timestamp: ${timestamp}`;

      const encodedMessage = new TextEncoder().encode(message);
      await signMessage(encodedMessage);

      await onAccept(rematchData.roomId);
      toast.success('Rematch accepted! Game starting...');
      onClose();
    } catch (error) {
      console.error('Failed to accept rematch:', error);
      toast.error('Failed to sign acceptance');
    } finally {
      setIsSigning(false);
    }
  };

  const handleDecline = () => {
    onDecline(rematchData.roomId);
    toast.info('Rematch declined');
    onClose();
  };

  const canAccept = rulesAccepted && termsAccepted && !isExpired && !alreadyAccepted && !isCreator;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md bg-card border-primary/30">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-foreground flex items-center gap-2">
            <span className="text-primary">Rematch Invitation</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Countdown Timer */}
          {!isExpired && !isCreator && !alreadyAccepted && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Clock size={14} className="text-primary animate-pulse" />
                  Time to accept:
                </span>
                <span className={`font-bold tabular-nums ${timeRemaining < 3000 ? 'text-destructive' : 'text-primary'}`}>
                  {formatCountdown(timeRemaining)}
                </span>
              </div>
              <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-100 rounded-full ${
                    timeRemaining < 3000 ? 'bg-destructive' : 'bg-primary'
                  }`}
                  style={{ width: `${countdownProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Expired Warning */}
          {isExpired && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 flex items-center gap-2">
              <AlertCircle size={18} className="text-destructive" />
              <span className="text-sm text-destructive">This rematch invitation has expired.</span>
            </div>
          )}

          {/* Already Accepted */}
          {alreadyAccepted && !isCreator && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 flex items-center gap-2">
              <Check size={18} className="text-green-500" />
              <span className="text-sm text-green-500">You have already accepted this rematch.</span>
            </div>
          )}

          {/* Creator View */}
          {isCreator && (
            <div className="bg-primary/10 border border-primary/30 rounded-lg p-3">
              <p className="text-sm text-muted-foreground">You created this rematch. Waiting for opponent to accept.</p>
            </div>
          )}

          {/* Rematch Details */}
          <Card className="p-4 bg-primary/5 border-primary/30">
            <h4 className="font-medium mb-3 text-primary flex items-center gap-2">
              <Users size={16} />
              Rematch Details
            </h4>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Game:</span>
                <span className="font-medium">{rematchData.settings.gameType}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Coins size={14} />
                  Stake:
                </span>
                <span className="font-medium text-primary">
                  {rematchData.settings.stakeAmount} SOL {formatUsd(rematchData.settings.stakeAmount)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Clock size={14} />
                  Turn Time:
                </span>
                <span className="font-medium">{formatTimeLabel(rematchData.settings.timePerTurn)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Created by:</span>
                <span className="font-mono text-xs">{creatorName}</span>
              </div>
            </div>

            {/* Players List */}
            <div className="mt-4 pt-3 border-t border-primary/20">
              <p className="text-xs text-muted-foreground mb-2">Players:</p>
              <div className="space-y-1">
                {rematchData.settings.players.map((player, idx) => (
                  <div key={player} className="flex items-center justify-between text-xs">
                    <span className="font-mono">
                      {player === address ? 'You' : formatAddress(player)}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      rematchData.acceptedPlayers.includes(player)
                        ? 'bg-green-500/20 text-green-500'
                        : 'bg-muted text-muted-foreground'
                    }`}>
                      {rematchData.acceptedPlayers.includes(player) ? 'Accepted' : 'Pending'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* Rules Summary */}
          {!isCreator && !alreadyAccepted && !isExpired && (
            <>
              <Card className="p-4 bg-muted/20 border-border/50">
                <h4 className="font-medium mb-2">Gameplay Rules</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Standard {rematchData.settings.gameType} rules apply</li>
                  <li>• Winner is determined by game logic</li>
                  <li>• Winnings are paid automatically to winner</li>
                  <li>• 5% platform fee on winnings</li>
                  <li>• No disputes — game decides outcome</li>
                </ul>
              </Card>

              {/* Acceptance Checkboxes */}
              <div className="space-y-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <Checkbox
                    checked={rulesAccepted}
                    onCheckedChange={(checked) => setRulesAccepted(!!checked)}
                    className="mt-0.5"
                  />
                  <span className="text-sm">
                    I accept the rules. The game decides the winner. No disputes. Auto payout.
                  </span>
                </label>

                <label className="flex items-start gap-3 cursor-pointer">
                  <Checkbox
                    checked={termsAccepted}
                    onCheckedChange={(checked) => setTermsAccepted(!!checked)}
                    className="mt-0.5"
                  />
                  <span className="text-sm">
                    I agree to stake {rematchData.settings.stakeAmount} SOL for this match.
                  </span>
                </label>
              </div>
            </>
          )}

          {/* Legal Text */}
          <p className="text-xs text-center text-muted-foreground">
            Both players must accept and sign with their wallet before the match starts.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-2 border-t border-border/30">
          {isCreator || alreadyAccepted || isExpired ? (
            <Button onClick={onClose} className="flex-1" variant="outline">
              Close
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={handleDecline}
                disabled={isSigning}
                className="flex-1"
              >
                Decline
              </Button>
              <Button
                onClick={handleAccept}
                disabled={!canAccept || isSigning}
                className="flex-1 gap-2 bg-primary hover:bg-primary/90"
              >
                {isSigning ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Signing...
                  </>
                ) : (
                  <>
                    <Check size={16} />
                    Accept & Sign
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
