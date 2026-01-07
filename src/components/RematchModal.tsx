import { useState } from 'react';
import { X, ChevronRight, ChevronLeft, Check, Loader2, Copy, Share2, Clock, Coins } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useRematch, RematchSettings, TIME_OPTIONS, STAKE_OPTIONS } from '@/hooks/useRematch';
import { toast } from 'sonner';
import { useSolPrice } from '@/hooks/useSolPrice';
import { useTranslation } from 'react-i18next';

interface RematchModalProps {
  isOpen: boolean;
  onClose: () => void;
  gameType: string;
  players: { address: string; name: string }[];
  rematchHook: ReturnType<typeof useRematch>;
}

export function RematchModal({
  isOpen,
  onClose,
  gameType,
  players,
  rematchHook,
}: RematchModalProps) {
  const {
    state,
    updateSettings,
    setStep,
    setRulesAccepted,
    setNewTermsAccepted,
    signRematchAgreement,
    createRematchRoom,
  } = rematchHook;

  const { t } = useTranslation();
  const { price: solPrice } = useSolPrice();
  const [customStake, setCustomStake] = useState('');
  const [isSigning, setIsSigning] = useState(false);
  const [copied, setCopied] = useState(false);

  const formatUsd = (sol: number) => {
    if (!solPrice) return '';
    return `~$${(sol * solPrice).toFixed(2)}`;
  };

  const formatTimeLabel = (seconds: number) => {
    if (seconds === 0) return t('rematch.unlimited');
    if (seconds < 60) return `${seconds}s`;
    return `${seconds / 60}m`;
  };

  const handleStakeSelect = (amount: number) => {
    updateSettings({ stakeAmount: amount });
    setCustomStake('');
  };

  const handleCustomStake = (value: string) => {
    setCustomStake(value);
    const parsed = parseFloat(value);
    if (!isNaN(parsed) && parsed > 0) {
      updateSettings({ stakeAmount: parsed });
    }
  };

  const handleNext = async () => {
    if (state.step === 1) {
      if (state.settings.stakeAmount <= 0) {
        toast.error(t('rematch.selectStake'));
        return;
      }
      setStep(2);
    } else if (state.step === 2) {
      if (!state.rulesAccepted || !state.newTermsAccepted) {
        toast.error(t('rematch.acceptAllTerms'));
        return;
      }
      setStep(3);
    } else if (state.step === 3) {
      setIsSigning(true);
      try {
        await signRematchAgreement();
        setStep(4);
        await createRematchRoom();
      } catch (error) {
        toast.error(t('rematch.failedToSign'));
      } finally {
        setIsSigning(false);
      }
    }
  };

  const handleBack = () => {
    if (state.step > 1) {
      setStep((state.step - 1) as 1 | 2 | 3 | 4);
    }
  };

  const handleCopyLink = async () => {
    if (state.inviteLink) {
      await navigator.clipboard.writeText(state.inviteLink);
      setCopied(true);
      toast.success(t('rematch.inviteCopied'));
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleShare = async () => {
    if (state.inviteLink && navigator.share) {
      try {
        await navigator.share({
          title: `${gameType} Rematch`,
          text: `Join my ${gameType} rematch! Stake: ${state.settings.stakeAmount} SOL`,
          url: state.inviteLink,
        });
      } catch (error) {
        handleCopyLink();
      }
    } else {
      handleCopyLink();
    }
  };

  const canProceed = () => {
    switch (state.step) {
      case 1:
        return state.settings.stakeAmount > 0;
      case 2:
        return state.rulesAccepted && state.newTermsAccepted;
      case 3:
        return true;
      default:
        return false;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg bg-card border-primary/30" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-foreground flex items-center gap-2">
            <span className="text-primary">{t('rematch.title')}</span> — {gameType}
          </DialogTitle>
        </DialogHeader>

        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-2 py-2">
          {[1, 2, 3, 4].map((step) => (
            <div key={step} className="flex items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                  state.step === step
                    ? 'bg-primary text-primary-foreground'
                    : state.step > step
                    ? 'bg-primary/30 text-primary'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {state.step > step ? <Check size={16} /> : step}
              </div>
              {step < 4 && (
                <div
                  className={`w-8 h-0.5 ${
                    state.step > step ? 'bg-primary/50' : 'bg-muted'
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        <div className="space-y-4 py-2">
          {/* Step 1: Settings */}
          {state.step === 1 && (
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                {t('rematch.chooseSettings')}
              </h3>

              {/* Stake Amount */}
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Coins size={16} className="text-primary" />
                  {t('rematch.stakeAmount')}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {STAKE_OPTIONS.map((amount) => (
                    <Button
                      key={amount}
                      variant={state.settings.stakeAmount === amount && !customStake ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handleStakeSelect(amount)}
                      className={state.settings.stakeAmount === amount && !customStake ? 'bg-primary' : ''}
                    >
                      {amount} SOL
                      {solPrice && (
                        <span className="text-xs opacity-70 ml-1">
                          {formatUsd(amount)}
                        </span>
                      )}
                    </Button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    placeholder={t('rematch.customAmount')}
                    value={customStake}
                    onChange={(e) => handleCustomStake(e.target.value)}
                    className="flex-1"
                    step="0.01"
                    min="0.001"
                  />
                  <span className="text-muted-foreground">SOL</span>
                </div>
              </div>

              {/* Time Per Turn */}
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Clock size={16} className="text-primary" />
                  {t('rematch.timePerTurn')}
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {TIME_OPTIONS.map((option) => (
                    <Button
                      key={option.value}
                      variant={state.settings.timePerTurn === option.value ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => updateSettings({ timePerTurn: option.value })}
                      className={state.settings.timePerTurn === option.value ? 'bg-primary' : ''}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Game Type (readonly) */}
              <div className="bg-muted/30 rounded-lg p-3">
                <p className="text-xs text-muted-foreground mb-1">{t('rematch.gameType')}</p>
                <p className="font-medium">{gameType}</p>
              </div>
            </div>
          )}

          {/* Step 2: Rules & Terms */}
          {state.step === 2 && (
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                {t('rematch.rulesAndTerms')}
              </h3>

              {/* Rules Summary */}
              <Card className="p-4 bg-muted/20 border-border/50">
                <h4 className="font-medium mb-2">{t('rematch.gameplayRules')}</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• {t('rematch.standardRules', { game: gameType })}</li>
                  <li>• {t('rematch.winnerDetermined')}</li>
                  <li>• {t('rematch.autoPayout')}</li>
                  <li>• {t('rematch.platformFee')}</li>
                  <li>• {t('rematch.noDisputes')}</li>
                </ul>
              </Card>

              {/* Checkboxes */}
              <div className="space-y-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <Checkbox
                    checked={state.rulesAccepted}
                    onCheckedChange={(checked) => setRulesAccepted(!!checked)}
                    className="mt-0.5"
                  />
                  <span className="text-sm">
                    {t('rematch.acceptRules')}
                  </span>
                </label>

                <label className="flex items-start gap-3 cursor-pointer">
                  <Checkbox
                    checked={state.newTermsAccepted}
                    onCheckedChange={(checked) => setNewTermsAccepted(!!checked)}
                    className="mt-0.5"
                  />
                  <span className="text-sm">
                    {t('rematch.newMatchTerms')}
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* Step 3: Wallet Sign */}
          {state.step === 3 && (
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                {t('rematch.walletSignature')}
              </h3>

              {/* Summary Box */}
              <Card className="p-4 bg-primary/5 border-primary/30">
                <h4 className="font-medium mb-3 text-primary">{t('rematch.summary')}</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('rematch.game')}:</span>
                    <span className="font-medium">{gameType}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('rematch.stake')}:</span>
                    <span className="font-medium">
                      {state.settings.stakeAmount} SOL {formatUsd(state.settings.stakeAmount)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('rematch.timePerTurn')}:</span>
                    <span className="font-medium">{formatTimeLabel(state.settings.timePerTurn)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('rematch.players')}:</span>
                    <span className="font-medium">{players.length}</span>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-primary/20">
                  <p className="text-xs text-muted-foreground">
                    {t('rematch.players')}: {players.map(p => p.name).join(' vs ')}
                  </p>
                </div>
              </Card>

              <p className="text-sm text-muted-foreground">
                {t('rematch.signToConfirm')}
              </p>

              {isSigning && (
                <div className="flex items-center justify-center gap-2 py-4">
                  <Loader2 className="animate-spin text-primary" />
                  <span className="text-muted-foreground">{t('rematch.waitingSignature')}</span>
                </div>
              )}
            </div>
          )}

          {/* Step 4: Create Room / Invite */}
          {state.step === 4 && (
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                {t('rematch.inviteOpponent')}
              </h3>

              {state.isCreating ? (
                <div className="flex items-center justify-center gap-2 py-8">
                  <Loader2 className="animate-spin text-primary" />
                  <span className="text-muted-foreground">{t('rematch.creatingRoom')}</span>
                </div>
              ) : (
                <>
                  <Card className="p-4 bg-primary/5 border-primary/30">
                    <p className="text-sm text-muted-foreground mb-2">{t('rematch.roomCreated')}</p>
                    <p className="font-mono text-sm break-all">{state.newRoomId}</p>
                  </Card>

                  {/* Opponent Status */}
                  <div className="space-y-2">
                    {players.slice(1).map((player) => (
                      <div
                        key={player.address}
                        className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
                      >
                        <span className="font-mono text-sm">{player.name}</span>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Loader2 size={12} className="animate-spin" />
                          {t('rematch.waitingToAccept')}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Share Buttons */}
                  <div className="flex gap-2">
                    <Button
                      onClick={handleShare}
                      className="flex-1 gap-2 bg-primary hover:bg-primary/90"
                    >
                      <Share2 size={16} />
                      {t('rematch.sendInvite')}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleCopyLink}
                      className="gap-2"
                    >
                      {copied ? <Check size={16} /> : <Copy size={16} />}
                      {copied ? t('rematch.copied') : t('rematch.copy')}
                    </Button>
                  </div>

                  <p className="text-xs text-center text-muted-foreground">
                    {t('rematch.bothMustAccept')}
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        {/* Navigation Buttons */}
        <div className="flex justify-between pt-2 border-t border-border/30">
          <Button
            variant="ghost"
            onClick={state.step === 1 ? onClose : handleBack}
            disabled={isSigning || state.isCreating}
          >
            {state.step === 1 ? (
              t('rematch.cancel')
            ) : (
              <>
                <ChevronLeft size={16} />
                {t('rematch.back')}
              </>
            )}
          </Button>

          {state.step < 4 && (
            <Button
              onClick={handleNext}
              disabled={!canProceed() || isSigning}
              className="gap-2 bg-primary hover:bg-primary/90"
            >
              {state.step === 3 ? (
                isSigning ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    {t('rematch.signing')}
                  </>
                ) : (
                  t('rematch.signAndCreate')
                )
              ) : (
                <>
                  {t('rematch.next')}
                  <ChevronRight size={16} />
                </>
              )}
            </Button>
          )}

          {state.step === 4 && (
            <Button onClick={onClose} variant="outline">
              {t('rematch.done')}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
