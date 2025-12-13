import { memo } from "react";
import { Token, PlayerColor, BOARD_POSITIONS } from "./ludoTypes";

interface LudoBoardProps {
  players: { color: PlayerColor; tokens: Token[]; isAI: boolean }[];
  currentPlayerIndex: number;
  movableTokens: number[];
  onTokenClick: (playerIndex: number, tokenIndex: number) => void;
}

// Egyptian symbols for corners
const CORNER_SYMBOLS = {
  gold: "☥", // Ankh
  ruby: "𓂀", // Eye of Horus (using fallback)
  emerald: "𓆣", // Scarab (using fallback)
  sapphire: "△", // Pyramid
};

// Hieroglyph-style dice faces
const DICE_HIEROGLYPHS = ["𓏤", "𓏥", "𓏦", "𓏧", "𓏨", "𓏩"];

const PLAYER_STYLES: Record<PlayerColor, { 
  gradient: string; 
  glow: string; 
  border: string;
  homeGradient: string;
  pathColor: string;
}> = {
  gold: {
    gradient: "from-amber-300 via-yellow-400 to-amber-600",
    glow: "0 0 20px rgba(251, 191, 36, 0.6), 0 0 40px rgba(251, 191, 36, 0.3)",
    border: "border-amber-400",
    homeGradient: "from-amber-900/40 via-yellow-900/30 to-amber-800/40",
    pathColor: "from-amber-500/30 to-yellow-500/30",
  },
  ruby: {
    gradient: "from-red-400 via-rose-500 to-red-700",
    glow: "0 0 20px rgba(239, 68, 68, 0.6), 0 0 40px rgba(239, 68, 68, 0.3)",
    border: "border-red-400",
    homeGradient: "from-red-900/40 via-rose-900/30 to-red-800/40",
    pathColor: "from-red-500/30 to-rose-500/30",
  },
  emerald: {
    gradient: "from-emerald-400 via-green-500 to-emerald-700",
    glow: "0 0 20px rgba(16, 185, 129, 0.6), 0 0 40px rgba(16, 185, 129, 0.3)",
    border: "border-emerald-400",
    homeGradient: "from-emerald-900/40 via-green-900/30 to-emerald-800/40",
    pathColor: "from-emerald-500/30 to-green-500/30",
  },
  sapphire: {
    gradient: "from-blue-400 via-indigo-500 to-blue-700",
    glow: "0 0 20px rgba(59, 130, 246, 0.6), 0 0 40px rgba(59, 130, 246, 0.3)",
    border: "border-blue-400",
    homeGradient: "from-blue-900/40 via-indigo-900/30 to-blue-800/40",
    pathColor: "from-blue-500/30 to-indigo-500/30",
  },
};

// Statue component for player pieces
const EgyptianStatue = memo(({ 
  color, 
  isMovable, 
  isFinished,
  onClick,
  position,
}: { 
  color: PlayerColor; 
  isMovable: boolean; 
  isFinished: boolean;
  onClick: () => void;
  position: number;
}) => {
  const style = PLAYER_STYLES[color];
  
  const statueIcons: Record<PlayerColor, string> = {
    gold: "👑", // Pharaoh
    ruby: "🐺", // Anubis
    emerald: "🐱", // Bastet
    sapphire: "🦅", // Horus
  };

  return (
    <button
      onClick={onClick}
      disabled={!isMovable}
      className={`
        relative w-7 h-7 sm:w-8 sm:h-8 rounded-full
        bg-gradient-to-br ${style.gradient}
        ${style.border} border-2
        flex items-center justify-center
        text-xs sm:text-sm
        transition-all duration-300
        ${isMovable ? 'cursor-pointer animate-pulse ring-2 ring-primary ring-offset-1 ring-offset-background scale-110 z-10' : ''}
        ${isFinished ? 'opacity-60' : ''}
        hover:scale-105
      `}
      style={{
        boxShadow: isMovable ? style.glow : `0 4px 12px rgba(0,0,0,0.4), ${style.glow.split(',')[0]}`,
      }}
    >
      <span className="drop-shadow-lg">{statueIcons[color]}</span>
      {/* Sparkle effect */}
      <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-white/30 via-transparent to-transparent pointer-events-none" />
    </button>
  );
});

// Home base component with Egyptian styling
const HomeBase = memo(({ 
  color, 
  tokens, 
  playerIndex,
  isCurrentPlayer,
  movableTokens,
  onTokenClick,
  symbol,
}: { 
  color: PlayerColor; 
  tokens: Token[];
  playerIndex: number;
  isCurrentPlayer: boolean;
  movableTokens: number[];
  onTokenClick: (playerIndex: number, tokenIndex: number) => void;
  symbol: string;
}) => {
  const style = PLAYER_STYLES[color];
  const homeTokens = tokens.filter(t => t.position === -1);

  return (
    <div 
      className={`
        relative rounded-xl p-2 sm:p-3
        bg-gradient-to-br ${style.homeGradient}
        border-2 ${isCurrentPlayer ? 'border-primary' : 'border-border/50'}
        backdrop-blur-sm
        transition-all duration-300
        ${isCurrentPlayer ? 'ring-2 ring-primary/30' : ''}
      `}
      style={{
        boxShadow: isCurrentPlayer ? style.glow : 'none',
      }}
    >
      {/* Corner symbol */}
      <div className="absolute -top-2 -left-2 w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-xs sm:text-sm shadow-lg border border-amber-300">
        {symbol}
      </div>
      
      {/* Hieroglyph decoration */}
      <div className="absolute inset-0 overflow-hidden rounded-xl pointer-events-none opacity-10">
        <div className="absolute inset-0 text-primary text-[8px] leading-tight tracking-tight">
          𓀀𓀁𓀂𓀃𓀄𓀅𓀆𓀇𓀈𓀉𓀊𓀋𓀌𓀍𓀎𓀏
        </div>
      </div>
      
      {/* Token grid */}
      <div className="grid grid-cols-2 gap-1 sm:gap-2 mt-4 sm:mt-6">
        {tokens.map((token, tokenIndex) => {
          const isHome = token.position === -1;
          const isMovable = movableTokens.includes(tokenIndex);
          const isFinished = token.position === 57;
          
          if (!isHome) {
            // Empty slot for tokens on board
            return (
              <div 
                key={token.id}
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border border-dashed border-muted-foreground/30 flex items-center justify-center text-[8px] text-muted-foreground/50"
              >
                {isFinished ? "✓" : "⌂"}
              </div>
            );
          }
          
          return (
            <EgyptianStatue
              key={token.id}
              color={color}
              isMovable={isMovable}
              isFinished={isFinished}
              onClick={() => onTokenClick(playerIndex, tokenIndex)}
              position={token.position}
            />
          );
        })}
      </div>
    </div>
  );
});

// Center logo component
const CenterLogo = memo(() => (
  <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
    <div 
      className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-full bg-gradient-to-br from-amber-900/90 via-yellow-900/80 to-amber-800/90 border-4 border-primary flex flex-col items-center justify-center shadow-2xl"
      style={{
        boxShadow: '0 0 30px rgba(251, 191, 36, 0.4), inset 0 0 20px rgba(251, 191, 36, 0.2)',
      }}
    >
      {/* Pyramid logo */}
      <div className="relative">
        <div className="w-0 h-0 border-l-[12px] sm:border-l-[16px] border-r-[12px] sm:border-r-[16px] border-b-[20px] sm:border-b-[26px] border-l-transparent border-r-transparent border-b-primary drop-shadow-lg" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/4 w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-gradient-to-br from-amber-200 to-primary shadow-lg" 
          style={{ boxShadow: '0 0 10px rgba(251, 191, 36, 0.8)' }}
        />
      </div>
      <span className="text-[8px] sm:text-[10px] font-display font-bold text-primary mt-1 tracking-wide">1M GAMING</span>
    </div>
  </div>
));

// Path cell component
const PathCell = memo(({ 
  index, 
  color,
  hasToken,
  tokenColor,
  isStart,
}: { 
  index: number; 
  color?: PlayerColor;
  hasToken?: boolean;
  tokenColor?: PlayerColor;
  isStart?: boolean;
}) => {
  const style = color ? PLAYER_STYLES[color] : null;
  
  return (
    <div 
      className={`
        w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7
        border border-primary/30
        flex items-center justify-center
        text-[6px] sm:text-[8px] text-primary/40
        transition-all duration-200
        ${color ? `bg-gradient-to-br ${style?.pathColor}` : 'bg-card/50'}
        ${isStart ? 'ring-1 ring-primary/50' : ''}
      `}
    >
      {isStart ? '★' : hasToken ? '●' : ''}
    </div>
  );
});

const LudoBoard = memo(({ 
  players, 
  currentPlayerIndex, 
  movableTokens, 
  onTokenClick 
}: LudoBoardProps) => {
  const cornerOrder: PlayerColor[] = ['gold', 'ruby', 'emerald', 'sapphire'];
  
  return (
    <div className="relative w-full max-w-[400px] sm:max-w-[450px] md:max-w-[500px] mx-auto">
      {/* Board container with Egyptian stone texture */}
      <div 
        className="relative aspect-square rounded-2xl p-3 sm:p-4"
        style={{
          background: `
            linear-gradient(135deg, hsl(35 30% 15%) 0%, hsl(25 25% 12%) 50%, hsl(35 35% 18%) 100%)
          `,
          boxShadow: `
            0 0 60px rgba(251, 191, 36, 0.15),
            inset 0 2px 4px rgba(255, 255, 255, 0.05),
            inset 0 -2px 4px rgba(0, 0, 0, 0.3)
          `,
        }}
      >
        {/* Hieroglyph border decoration */}
        <div className="absolute inset-0 rounded-2xl border-4 border-primary/40 pointer-events-none" />
        <div className="absolute inset-[6px] rounded-xl border-2 border-primary/20 pointer-events-none" />
        
        {/* Corner decorations */}
        <div className="absolute top-2 left-2 w-6 h-6 border-t-2 border-l-2 border-primary/50 rounded-tl-lg" />
        <div className="absolute top-2 right-2 w-6 h-6 border-t-2 border-r-2 border-primary/50 rounded-tr-lg" />
        <div className="absolute bottom-2 left-2 w-6 h-6 border-b-2 border-l-2 border-primary/50 rounded-bl-lg" />
        <div className="absolute bottom-2 right-2 w-6 h-6 border-b-2 border-r-2 border-primary/50 rounded-br-lg" />

        {/* Main grid layout */}
        <div className="relative w-full h-full grid grid-cols-[1fr_1fr_1fr] grid-rows-[1fr_1fr_1fr] gap-1">
          {/* Top-left: Gold home */}
          <HomeBase
            color="gold"
            tokens={players[0]?.tokens || []}
            playerIndex={0}
            isCurrentPlayer={currentPlayerIndex === 0}
            movableTokens={currentPlayerIndex === 0 ? movableTokens : []}
            onTokenClick={onTokenClick}
            symbol={CORNER_SYMBOLS.gold}
          />
          
          {/* Top-center: Path column */}
          <div className="flex flex-col items-center justify-between py-1">
            {[0,1,2,3,4,5].map(i => (
              <PathCell key={`top-${i}`} index={i} color={i < 5 ? "ruby" : undefined} isStart={i === 1} />
            ))}
          </div>
          
          {/* Top-right: Ruby home */}
          <HomeBase
            color="ruby"
            tokens={players[1]?.tokens || []}
            playerIndex={1}
            isCurrentPlayer={currentPlayerIndex === 1}
            movableTokens={currentPlayerIndex === 1 ? movableTokens : []}
            onTokenClick={onTokenClick}
            symbol={CORNER_SYMBOLS.ruby}
          />
          
          {/* Middle-left: Path row */}
          <div className="flex items-center justify-between px-1">
            {[0,1,2,3,4,5].map(i => (
              <PathCell key={`left-${i}`} index={i} color={i > 0 ? "gold" : undefined} isStart={i === 4} />
            ))}
          </div>
          
          {/* Center: Logo and cross paths */}
          <div className="relative bg-gradient-to-br from-amber-900/30 to-yellow-900/20 rounded-lg border border-primary/30">
            <CenterLogo />
            
            {/* Finish triangles for each player */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="relative w-full h-full">
                {/* Gold finish path (left) */}
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1/2 h-4 bg-gradient-to-r from-amber-500/40 to-transparent" />
                {/* Ruby finish path (top) */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-4 h-1/2 bg-gradient-to-b from-red-500/40 to-transparent" />
                {/* Emerald finish path (bottom) */}
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-1/2 bg-gradient-to-t from-emerald-500/40 to-transparent" />
                {/* Sapphire finish path (right) */}
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1/2 h-4 bg-gradient-to-l from-blue-500/40 to-transparent" />
              </div>
            </div>
          </div>
          
          {/* Middle-right: Path row */}
          <div className="flex items-center justify-between px-1">
            {[0,1,2,3,4,5].map(i => (
              <PathCell key={`right-${i}`} index={i} color={i < 5 ? "sapphire" : undefined} isStart={i === 1} />
            ))}
          </div>
          
          {/* Bottom-left: Emerald home */}
          <HomeBase
            color="emerald"
            tokens={players[2]?.tokens || []}
            playerIndex={2}
            isCurrentPlayer={currentPlayerIndex === 2}
            movableTokens={currentPlayerIndex === 2 ? movableTokens : []}
            onTokenClick={onTokenClick}
            symbol={CORNER_SYMBOLS.emerald}
          />
          
          {/* Bottom-center: Path column */}
          <div className="flex flex-col items-center justify-between py-1">
            {[0,1,2,3,4,5].map(i => (
              <PathCell key={`bottom-${i}`} index={i} color={i > 0 ? "emerald" : undefined} isStart={i === 4} />
            ))}
          </div>
          
          {/* Bottom-right: Sapphire home */}
          <HomeBase
            color="sapphire"
            tokens={players[3]?.tokens || []}
            playerIndex={3}
            isCurrentPlayer={currentPlayerIndex === 3}
            movableTokens={currentPlayerIndex === 3 ? movableTokens : []}
            onTokenClick={onTokenClick}
            symbol={CORNER_SYMBOLS.sapphire}
          />
        </div>
      </div>
      
      {/* Outer glow effect */}
      <div className="absolute -inset-2 rounded-3xl bg-gradient-to-br from-primary/5 via-transparent to-primary/5 pointer-events-none blur-xl" />
    </div>
  );
});

LudoBoard.displayName = 'LudoBoard';
HomeBase.displayName = 'HomeBase';
EgyptianStatue.displayName = 'EgyptianStatue';
CenterLogo.displayName = 'CenterLogo';
PathCell.displayName = 'PathCell';

export default LudoBoard;
