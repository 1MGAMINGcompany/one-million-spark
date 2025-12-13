import { memo } from "react";

interface EgyptianDiceProps {
  value: number | null;
  isRolling: boolean;
  onRoll: () => void;
  disabled: boolean;
  showRollButton: boolean;
}

// Hieroglyph-style number symbols
const DICE_SYMBOLS: Record<number, string[]> = {
  1: ["𓏤"],
  2: ["𓏤", "𓏤"],
  3: ["𓏤", "𓏤", "𓏤"],
  4: ["𓏤", "𓏤", "𓏤", "𓏤"],
  5: ["𓏤", "𓏤", "𓏤", "𓏤", "𓏤"],
  6: ["𓏤", "𓏤", "𓏤", "𓏤", "𓏤", "𓏤"],
};

const DiceFace = memo(({ value }: { value: number }) => {
  // Classic dice pip positions
  const pipPositions: Record<number, string[]> = {
    1: ['center'],
    2: ['top-right', 'bottom-left'],
    3: ['top-right', 'center', 'bottom-left'],
    4: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
    5: ['top-left', 'top-right', 'center', 'bottom-left', 'bottom-right'],
    6: ['top-left', 'top-right', 'middle-left', 'middle-right', 'bottom-left', 'bottom-right'],
  };

  const getPositionClasses = (pos: string) => {
    const positions: Record<string, string> = {
      'top-left': 'top-1 left-1',
      'top-right': 'top-1 right-1',
      'middle-left': 'top-1/2 -translate-y-1/2 left-1',
      'middle-right': 'top-1/2 -translate-y-1/2 right-1',
      'center': 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
      'bottom-left': 'bottom-1 left-1',
      'bottom-right': 'bottom-1 right-1',
    };
    return positions[pos] || '';
  };

  return (
    <div className="relative w-full h-full">
      {pipPositions[value]?.map((pos, i) => (
        <div
          key={i}
          className={`absolute ${getPositionClasses(pos)} w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-gradient-to-br from-amber-300 via-primary to-amber-600 shadow-lg`}
          style={{
            boxShadow: '0 0 8px rgba(251, 191, 36, 0.6), inset 0 1px 2px rgba(255, 255, 255, 0.4)',
          }}
        />
      ))}
    </div>
  );
});

DiceFace.displayName = 'DiceFace';

const EgyptianDice = memo(({ 
  value, 
  isRolling, 
  onRoll, 
  disabled,
  showRollButton,
}: EgyptianDiceProps) => {
  const displayValue = value || 1;

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Dice container */}
      <div 
        className={`
          relative w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24
          rounded-xl
          bg-gradient-to-br from-amber-100 via-amber-50 to-yellow-100
          border-2 border-primary/50
          shadow-2xl
          flex items-center justify-center
          transition-transform duration-100
          ${isRolling ? 'animate-bounce' : ''}
        `}
        style={{
          boxShadow: `
            0 10px 30px rgba(0, 0, 0, 0.3),
            0 0 20px rgba(251, 191, 36, 0.2),
            inset 0 2px 4px rgba(255, 255, 255, 0.5),
            inset 0 -2px 4px rgba(0, 0, 0, 0.1)
          `,
          transform: isRolling 
            ? `rotate(${Math.random() * 20 - 10}deg)` 
            : 'rotate(0deg)',
        }}
      >
        {/* Hieroglyph decorations on corners */}
        <div className="absolute top-0.5 left-0.5 text-[6px] sm:text-[8px] text-primary/30">𓂀</div>
        <div className="absolute top-0.5 right-0.5 text-[6px] sm:text-[8px] text-primary/30">☥</div>
        <div className="absolute bottom-0.5 left-0.5 text-[6px] sm:text-[8px] text-primary/30">𓆣</div>
        <div className="absolute bottom-0.5 right-0.5 text-[6px] sm:text-[8px] text-primary/30">△</div>
        
        {/* Dice face with pips */}
        <div className="w-12 h-12 sm:w-14 sm:h-14 md:w-18 md:h-18 p-1">
          <DiceFace value={displayValue} />
        </div>
        
        {/* Glow overlay */}
        <div className="absolute inset-0 rounded-xl bg-gradient-to-tr from-white/20 via-transparent to-transparent pointer-events-none" />
      </div>

      {/* Roll button */}
      {showRollButton && (
        <button
          onClick={onRoll}
          disabled={disabled || isRolling}
          className={`
            px-8 py-3
            bg-gradient-to-br from-primary via-amber-500 to-accent
            text-primary-foreground font-display font-semibold
            rounded-lg
            border-2 border-amber-300/50
            shadow-lg
            transition-all duration-200
            ${disabled || isRolling 
              ? 'opacity-50 cursor-not-allowed' 
              : 'hover:scale-105 hover:shadow-xl active:scale-95'
            }
          `}
          style={{
            boxShadow: disabled 
              ? 'none' 
              : '0 4px 20px rgba(251, 191, 36, 0.4), 0 0 30px rgba(251, 191, 36, 0.2)',
          }}
        >
          {isRolling ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
              Rolling...
            </span>
          ) : (
            "Roll Dice"
          )}
        </button>
      )}
    </div>
  );
});

EgyptianDice.displayName = 'EgyptianDice';

export default EgyptianDice;
