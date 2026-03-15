/**
 * ChessSkinPicker — modal for browsing and selecting chess piece skins.
 */

import { memo } from "react";
import { Lock, Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import type { ChessSkin } from "@/lib/chessSkins";
import type { UseChessSkinReturn } from "@/hooks/useChessSkin";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skinHook: UseChessSkinReturn;
}

function SkinCard({ skin, selected, unlocked, onSelect, progress }: {
  skin: ChessSkin;
  selected: boolean;
  unlocked: boolean;
  onSelect: () => void;
  progress: { games: number; shares: number };
}) {
  const gamesNeeded = Math.max(0, skin.unlockGames - progress.games);
  const sharesNeeded = Math.max(0, skin.unlockShares - progress.shares);
  const gamesPct = skin.unlockGames > 0 ? Math.min(100, (progress.games / skin.unlockGames) * 100) : 100;
  const sharesPct = skin.unlockShares > 0 ? Math.min(100, (progress.shares / skin.unlockShares) * 100) : 100;

  return (
    <button
      onClick={unlocked ? onSelect : undefined}
      disabled={!unlocked}
      className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border transition-all duration-200 text-left w-full ${
        selected
          ? "border-primary bg-primary/10 shadow-[0_0_16px_-4px_hsl(45_93%_54%_/_0.5)]"
          : unlocked
          ? "border-border/50 bg-card hover:border-primary/40 hover:bg-primary/5"
          : "border-border/20 bg-muted/20 opacity-70 cursor-not-allowed"
      }`}
    >
      {selected && (
        <div className="absolute top-2 right-2">
          <Check className="w-4 h-4 text-primary" />
        </div>
      )}
      {!unlocked && (
        <div className="absolute top-2 right-2">
          <Lock className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
      )}

      {/* Preview */}
      <div className="text-3xl select-none">{skin.preview}</div>

      {/* Skin name + description */}
      <div className="text-center">
        <p className="text-sm font-bold text-foreground">{skin.name}</p>
        <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">{skin.description}</p>
      </div>

      {/* Material preview swatches */}
      <div className="flex gap-1.5">
        <div className="w-5 h-5 rounded-full border border-border/40" style={{ background: skin.whiteMat.color }} />
        <div className="w-5 h-5 rounded-full border border-border/40" style={{ background: skin.blackMat.color }} />
        <div className="w-5 h-5 rounded-full border border-border/40" style={{ background: skin.boardTrim }} />
      </div>

      {/* Unlock progress if locked */}
      {!unlocked && (
        <div className="w-full space-y-1.5 mt-1">
          {skin.unlockGames > 0 && (
            <div>
              <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
                <span>Games</span>
                <span>{progress.games}/{skin.unlockGames}</span>
              </div>
              <Progress value={gamesPct} className="h-1.5" />
            </div>
          )}
          {skin.unlockShares > 0 && (
            <div>
              <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
                <span>Shares</span>
                <span>{progress.shares}/{skin.unlockShares}</span>
              </div>
              <Progress value={sharesPct} className="h-1.5" />
            </div>
          )}
          <p className="text-[10px] text-muted-foreground/70 text-center">
            {gamesNeeded > 0 && `${gamesNeeded} more game${gamesNeeded !== 1 ? "s" : ""}`}
            {gamesNeeded > 0 && sharesNeeded > 0 && " + "}
            {sharesNeeded > 0 && `${sharesNeeded} more share${sharesNeeded !== 1 ? "s" : ""}`}
          </p>
        </div>
      )}
    </button>
  );
}

function ChessSkinPicker({ open, onOpenChange, skinHook }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-center font-display text-lg">
            <span className="bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              Chess Skins
            </span>
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 mt-2">
          {skinHook.allSkins.map((skin) => (
            <SkinCard
              key={skin.id}
              skin={skin}
              selected={skin.id === skinHook.skinId}
              unlocked={skinHook.isUnlocked(skin)}
              onSelect={() => {
                skinHook.setSkin(skin.id);
                onOpenChange(false);
              }}
              progress={skinHook.progress}
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default memo(ChessSkinPicker);
