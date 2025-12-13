import { memo, useEffect, useState } from "react";
import { Token, PlayerColor } from "./ludoTypes";

interface LudoBoardProps {
  players: { color: PlayerColor; tokens: Token[]; isAI: boolean }[];
  currentPlayerIndex: number;
  movableTokens: number[];
  onTokenClick: (playerIndex: number, tokenIndex: number) => void;
}

// Egyptian symbols for corners
const CORNER_SYMBOLS = {
  gold: "☥", // Ankh
  ruby: "𓂀", // Eye of Horus
  emerald: "𓆣", // Scarab
  sapphire: "△", // Pyramid
};

// Hieroglyph patterns for carved effect
const HIEROGLYPH_ROWS = [
  "𓀀𓀁𓀂𓀃𓀄𓀅𓀆𓀇𓀈𓀉",
  "𓁀𓁁𓁂𓁃𓁄𓁅𓁆𓁇𓁈𓁉",
  "𓂀𓂁𓂂𓂃𓂄𓂅𓂆𓂇𓂈𓂉",
  "𓃀𓃁𓃂𓃃𓃄𓃅𓃆𓃇𓃈𓃉",
  "𓄀𓄁𓄂𓄃𓄄𓄅𓄆𓄇𓄈𓄉",
];

const PLAYER_STYLES: Record<PlayerColor, { 
  gradient: string; 
  glow: string; 
  border: string;
  homeGradient: string;
  pathColor: string;
  gemGradient: string;
  gemHighlight: string;
}> = {
  gold: {
    gradient: "from-amber-200 via-yellow-300 to-amber-500",
    glow: "0 0 20px rgba(251, 191, 36, 0.8), 0 0 40px rgba(251, 191, 36, 0.4)",
    border: "border-amber-300",
    homeGradient: "from-amber-900/40 via-yellow-900/30 to-amber-800/40",
    pathColor: "from-amber-500/30 to-yellow-500/30",
    gemGradient: "from-yellow-200 via-amber-300 to-yellow-500",
    gemHighlight: "rgba(255, 251, 235, 0.9)",
  },
  ruby: {
    gradient: "from-red-300 via-rose-400 to-red-600",
    glow: "0 0 20px rgba(239, 68, 68, 0.8), 0 0 40px rgba(239, 68, 68, 0.4)",
    border: "border-red-400",
    homeGradient: "from-red-900/40 via-rose-900/30 to-red-800/40",
    pathColor: "from-red-500/30 to-rose-500/30",
    gemGradient: "from-red-300 via-rose-400 to-red-700",
    gemHighlight: "rgba(254, 226, 226, 0.9)",
  },
  emerald: {
    gradient: "from-emerald-300 via-green-400 to-emerald-600",
    glow: "0 0 20px rgba(16, 185, 129, 0.8), 0 0 40px rgba(16, 185, 129, 0.4)",
    border: "border-emerald-400",
    homeGradient: "from-emerald-900/40 via-green-900/30 to-emerald-800/40",
    pathColor: "from-emerald-500/30 to-green-500/30",
    gemGradient: "from-emerald-300 via-green-400 to-emerald-700",
    gemHighlight: "rgba(209, 250, 229, 0.9)",
  },
  sapphire: {
    gradient: "from-blue-300 via-indigo-400 to-blue-700",
    glow: "0 0 20px rgba(59, 130, 246, 0.8), 0 0 40px rgba(59, 130, 246, 0.4)",
    border: "border-blue-400",
    homeGradient: "from-blue-900/40 via-indigo-900/30 to-blue-800/40",
    pathColor: "from-blue-500/30 to-indigo-500/30",
    gemGradient: "from-blue-300 via-indigo-400 to-blue-800",
    gemHighlight: "rgba(219, 234, 254, 0.9)",
  },
};

// Animated shimmer overlay component
const GoldShimmer = memo(() => {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl">
      {/* Animated shimmer sweep */}
      <div 
        className="absolute inset-0 opacity-20"
        style={{
          background: 'linear-gradient(105deg, transparent 40%, rgba(251, 191, 36, 0.4) 50%, transparent 60%)',
          animation: 'shimmerSweep 6s ease-in-out infinite',
        }}
      />
      {/* Specular highlights */}
      <div 
        className="absolute top-0 left-0 w-1/3 h-1/4 opacity-10"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.6) 0%, transparent 70%)',
          animation: 'highlightFloat 8s ease-in-out infinite',
        }}
      />
      <div 
        className="absolute bottom-1/4 right-1/4 w-1/4 h-1/4 opacity-10"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(251,191,36,0.5) 0%, transparent 70%)',
          animation: 'highlightFloat 10s ease-in-out infinite reverse',
        }}
      />
    </div>
  );
});

// Dust particles component
const DustParticles = memo(() => {
  const particles = Array.from({ length: 12 }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    top: `${Math.random() * 100}%`,
    delay: `${Math.random() * 5}s`,
    duration: `${4 + Math.random() * 4}s`,
    size: 1 + Math.random() * 2,
  }));

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl">
      {particles.map(p => (
        <div
          key={p.id}
          className="absolute rounded-full bg-primary/60"
          style={{
            left: p.left,
            top: p.top,
            width: p.size,
            height: p.size,
            animation: `dustFloat ${p.duration} ease-in-out ${p.delay} infinite`,
            boxShadow: '0 0 4px rgba(251, 191, 36, 0.8)',
          }}
        />
      ))}
    </div>
  );
});

// Carved hieroglyphs overlay
const CarvedHieroglyphs = memo(() => {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl opacity-15">
      {HIEROGLYPH_ROWS.map((row, i) => (
        <div 
          key={i}
          className="absolute whitespace-nowrap text-[10px] sm:text-xs"
          style={{
            top: `${15 + i * 18}%`,
            left: '-5%',
            width: '110%',
            color: 'transparent',
            textShadow: `
              1px 1px 1px rgba(0,0,0,0.5),
              -0.5px -0.5px 0px rgba(251,191,36,0.3),
              0 0 2px rgba(251,191,36,0.2)
            `,
            WebkitTextStroke: '0.5px rgba(251,191,36,0.2)',
            letterSpacing: '4px',
            transform: `rotate(${-2 + i * 0.5}deg)`,
          }}
        >
          {row.repeat(8)}
        </div>
      ))}
    </div>
  );
});

// Gem Pharaoh statue component for player pieces
const GemPharaoh = memo(({ 
  color, 
  isMovable, 
  isFinished,
  onClick,
  tokenId,
}: { 
  color: PlayerColor; 
  isMovable: boolean; 
  isFinished: boolean;
  onClick: () => void;
  tokenId: string;
}) => {
  const style = PLAYER_STYLES[color];
  const [sparkle, setSparkle] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setSparkle(prev => (prev + 1) % 4);
    }, 800);
    return () => clearInterval(interval);
  }, []);

  return (
    <button
      onClick={onClick}
      disabled={!isMovable}
      data-token-id={tokenId}
      className={`
        relative w-7 h-7 sm:w-8 sm:h-8
        flex items-center justify-center
        transition-all duration-300
        ${isMovable ? 'cursor-pointer scale-110 z-10' : ''}
        ${isFinished ? 'opacity-60' : ''}
        hover:scale-105
      `}
      style={{
        filter: isMovable ? 'drop-shadow(0 0 8px rgba(251, 191, 36, 0.8))' : 'none',
      }}
    >
      {/* Gem body with faceted look */}
      <div 
        className={`
          relative w-full h-full rounded-sm
          bg-gradient-to-br ${style.gemGradient}
          ${style.border} border
          overflow-hidden
        `}
        style={{
          boxShadow: isMovable 
            ? style.glow 
            : `0 2px 8px rgba(0,0,0,0.4), inset 0 1px 2px ${style.gemHighlight}`,
          clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
        }}
      >
        {/* Faceted refraction highlights */}
        <div 
          className="absolute inset-0"
          style={{
            background: `
              linear-gradient(135deg, ${style.gemHighlight} 0%, transparent 30%),
              linear-gradient(225deg, transparent 60%, rgba(0,0,0,0.2) 100%)
            `,
          }}
        />
        
        {/* Pharaoh silhouette */}
        <div className="absolute inset-0 flex items-center justify-center">
          <svg viewBox="0 0 24 24" className="w-4 h-4 sm:w-5 sm:h-5 drop-shadow-sm" fill="currentColor" style={{ color: 'rgba(0,0,0,0.4)' }}>
            <path d="M12 2L8 6v2l-2 2v3l2 2v5h8v-5l2-2v-3l-2-2V6l-4-4zm0 2l2 2v1h-4V6l2-2zm-2 5h4v2l1 1v1l-1 1v4h-4v-4l-1-1v-1l1-1v-2z"/>
          </svg>
        </div>

        {/* Sparkle glints */}
        <div 
          className="absolute w-1 h-1 rounded-full bg-white/90"
          style={{
            top: sparkle === 0 ? '15%' : sparkle === 1 ? '25%' : sparkle === 2 ? '20%' : '30%',
            left: sparkle === 0 ? '20%' : sparkle === 1 ? '70%' : sparkle === 2 ? '60%' : '25%',
            boxShadow: '0 0 4px 1px white',
            opacity: 0.8,
          }}
        />
        <div 
          className="absolute w-0.5 h-0.5 rounded-full bg-white/70"
          style={{
            top: sparkle === 0 ? '60%' : sparkle === 1 ? '40%' : sparkle === 2 ? '70%' : '50%',
            right: sparkle === 0 ? '25%' : sparkle === 1 ? '20%' : sparkle === 2 ? '30%' : '40%',
            boxShadow: '0 0 3px white',
          }}
        />
      </div>

      {/* Movable indicator ring */}
      {isMovable && (
        <div 
          className="absolute inset-[-4px] rounded-full border-2 border-primary animate-pulse"
          style={{ 
            boxShadow: '0 0 12px rgba(251, 191, 36, 0.6)',
          }}
        />
      )}
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
        boxShadow: isCurrentPlayer ? style.glow : 'inset 0 2px 4px rgba(0,0,0,0.3)',
      }}
    >
      {/* Corner symbol with carved effect */}
      <div 
        className="absolute -top-2 -left-2 w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm shadow-lg border border-amber-300"
        style={{
          background: 'linear-gradient(135deg, hsl(45 80% 55%) 0%, hsl(35 70% 40%) 100%)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.4), inset 0 1px 2px rgba(255,255,255,0.3)',
          textShadow: '0 1px 2px rgba(0,0,0,0.5)',
        }}
      >
        {symbol}
      </div>
      
      {/* Carved hieroglyph decoration in home */}
      <div className="absolute inset-0 overflow-hidden rounded-xl pointer-events-none opacity-10">
        <div 
          className="absolute inset-0 text-primary text-[8px] leading-tight"
          style={{
            textShadow: '1px 1px 1px rgba(0,0,0,0.5)',
          }}
        >
          𓀀𓀁𓀂𓀃𓀄𓀅𓀆𓀇
        </div>
      </div>
      
      {/* Token grid */}
      <div className="grid grid-cols-2 gap-1 sm:gap-2 mt-4 sm:mt-6">
        {tokens.map((token, tokenIndex) => {
          const isHome = token.position === -1;
          const isMovable = movableTokens.includes(tokenIndex);
          const isFinished = token.position === 57;
          const tokenId = `${color}-${token.id}`;
          
          if (!isHome) {
            // Empty slot for tokens on board
            return (
              <div 
                key={tokenId}
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border border-dashed border-muted-foreground/30 flex items-center justify-center text-[8px] text-muted-foreground/50"
              >
                {isFinished ? "✓" : "⌂"}
              </div>
            );
          }
          
          return (
            <GemPharaoh
              key={tokenId}
              color={color}
              isMovable={isMovable}
              isFinished={isFinished}
              onClick={() => onTokenClick(playerIndex, tokenIndex)}
              tokenId={tokenId}
            />
          );
        })}
      </div>
    </div>
  );
});

// Center logo component - Triangle with circle only
const CenterLogo = memo(() => (
  <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
    <div 
      className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-full flex flex-col items-center justify-center"
      style={{
        background: 'linear-gradient(135deg, hsl(35 30% 15%) 0%, hsl(25 25% 12%) 100%)',
        boxShadow: `
          0 0 30px rgba(251, 191, 36, 0.3),
          inset 0 2px 4px rgba(255, 255, 255, 0.05),
          inset 0 -2px 4px rgba(0, 0, 0, 0.4)
        `,
        border: '3px solid hsl(45 80% 45%)',
      }}
    >
      {/* Pyramid (triangle) with embossed/engraved effect */}
      <div className="relative">
        <div 
          className="w-0 h-0"
          style={{
            borderLeft: '14px solid transparent',
            borderRight: '14px solid transparent',
            borderBottom: '24px solid hsl(45 70% 50%)',
            filter: 'drop-shadow(0 0 8px rgba(251, 191, 36, 0.5))',
          }}
        />
        {/* Inner shadow for carved effect */}
        <div 
          className="absolute top-[2px] left-1/2 -translate-x-1/2 w-0 h-0"
          style={{
            borderLeft: '11px solid transparent',
            borderRight: '11px solid transparent',
            borderBottom: '19px solid hsl(35 60% 40%)',
          }}
        />
        {/* Glowing circle */}
        <div 
          className="absolute top-1/2 left-1/2 -translate-x-1/2 translate-y-[-30%] w-3 h-3 sm:w-4 sm:h-4 rounded-full"
          style={{
            background: 'radial-gradient(circle at 30% 30%, hsl(45 90% 70%), hsl(45 80% 50%))',
            boxShadow: '0 0 12px rgba(251, 191, 36, 0.8), inset 0 -1px 2px rgba(0,0,0,0.3)',
          }}
        />
      </div>
    </div>
  </div>
));

// Path cell component
const PathCell = memo(({ 
  index, 
  color,
  isStart,
}: { 
  index: number; 
  color?: PlayerColor;
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
      style={{
        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.2)',
      }}
    >
      {isStart ? '★' : ''}
    </div>
  );
});

const LudoBoard = memo(({ 
  players, 
  currentPlayerIndex, 
  movableTokens, 
  onTokenClick 
}: LudoBoardProps) => {
  return (
    <div className="relative w-full max-w-[400px] sm:max-w-[450px] md:max-w-[500px] mx-auto">
      {/* Keyframe animations */}
      <style>{`
        @keyframes shimmerSweep {
          0%, 100% { transform: translateX(-100%); }
          50% { transform: translateX(100%); }
        }
        @keyframes highlightFloat {
          0%, 100% { transform: translate(0, 0); opacity: 0.1; }
          50% { transform: translate(10px, 5px); opacity: 0.15; }
        }
        @keyframes dustFloat {
          0%, 100% { transform: translateY(0) scale(1); opacity: 0.4; }
          50% { transform: translateY(-10px) scale(1.2); opacity: 0.8; }
        }
      `}</style>

      {/* Board container with Egyptian stone texture */}
      <div 
        className="relative aspect-square rounded-2xl p-3 sm:p-4"
        style={{
          background: `
            linear-gradient(135deg, hsl(40 35% 18%) 0%, hsl(30 30% 14%) 30%, hsl(35 25% 12%) 70%, hsl(40 35% 16%) 100%)
          `,
          boxShadow: `
            0 0 80px rgba(251, 191, 36, 0.12),
            0 20px 40px rgba(0, 0, 0, 0.4),
            inset 0 2px 4px rgba(255, 255, 255, 0.05),
            inset 0 -2px 4px rgba(0, 0, 0, 0.3)
          `,
        }}
      >
        {/* Gold shimmer effect */}
        <GoldShimmer />
        
        {/* Carved hieroglyphs */}
        <CarvedHieroglyphs />
        
        {/* Dust particles */}
        <DustParticles />

        {/* Hieroglyph border decoration */}
        <div 
          className="absolute inset-0 rounded-2xl pointer-events-none"
          style={{
            border: '4px solid hsl(45 60% 35%)',
            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3), inset 0 -1px 2px rgba(255,255,255,0.1)',
          }}
        />
        <div 
          className="absolute inset-[6px] rounded-xl pointer-events-none"
          style={{
            border: '2px solid hsl(45 50% 25%)',
            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.2)',
          }}
        />
        
        {/* Corner decorations with carved effect */}
        <div className="absolute top-2 left-2 w-6 h-6 border-t-2 border-l-2 border-primary/50 rounded-tl-lg" style={{ boxShadow: '1px 1px 2px rgba(0,0,0,0.3)' }} />
        <div className="absolute top-2 right-2 w-6 h-6 border-t-2 border-r-2 border-primary/50 rounded-tr-lg" style={{ boxShadow: '-1px 1px 2px rgba(0,0,0,0.3)' }} />
        <div className="absolute bottom-2 left-2 w-6 h-6 border-b-2 border-l-2 border-primary/50 rounded-bl-lg" style={{ boxShadow: '1px -1px 2px rgba(0,0,0,0.3)' }} />
        <div className="absolute bottom-2 right-2 w-6 h-6 border-b-2 border-r-2 border-primary/50 rounded-br-lg" style={{ boxShadow: '-1px -1px 2px rgba(0,0,0,0.3)' }} />

        {/* Main grid layout */}
        <div className="relative w-full h-full grid grid-cols-[1fr_1fr_1fr] grid-rows-[1fr_1fr_1fr] gap-1 z-10">
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
          <div 
            className="relative rounded-lg"
            style={{
              background: 'linear-gradient(135deg, hsl(35 25% 12%) 0%, hsl(30 20% 10%) 100%)',
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3)',
              border: '1px solid hsl(45 40% 25%)',
            }}
          >
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
      <div className="absolute -inset-4 rounded-3xl bg-gradient-to-br from-primary/8 via-transparent to-primary/8 pointer-events-none blur-2xl" />
    </div>
  );
});

LudoBoard.displayName = 'LudoBoard';
HomeBase.displayName = 'HomeBase';
GemPharaoh.displayName = 'GemPharaoh';
CenterLogo.displayName = 'CenterLogo';
PathCell.displayName = 'PathCell';
GoldShimmer.displayName = 'GoldShimmer';
DustParticles.displayName = 'DustParticles';
CarvedHieroglyphs.displayName = 'CarvedHieroglyphs';

export default LudoBoard;