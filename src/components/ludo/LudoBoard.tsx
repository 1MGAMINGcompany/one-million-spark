import { memo, useEffect, useState, useRef } from "react";
import { Token, PlayerColor, getTokenCoords } from "./ludoTypes";

interface LudoBoardProps {
  players: { color: PlayerColor; tokens: Token[]; isAI: boolean }[];
  currentPlayerIndex: number;
  movableTokens: number[];
  onTokenClick: (playerIndex: number, tokenIndex: number) => void;
}

const PLAYER_STYLES: Record<PlayerColor, { 
  bg: string;
  fill: string;
  border: string;
  glow: string;
}> = {
  gold: {
    bg: "hsl(45 80% 50%)",
    fill: "hsl(45 90% 60%)",
    border: "hsl(45 70% 40%)",
    glow: "rgba(251, 191, 36, 0.6)",
  },
  ruby: {
    bg: "hsl(0 70% 50%)",
    fill: "hsl(0 80% 55%)",
    border: "hsl(0 60% 35%)",
    glow: "rgba(239, 68, 68, 0.6)",
  },
  emerald: {
    bg: "hsl(145 60% 40%)",
    fill: "hsl(145 70% 50%)",
    border: "hsl(145 50% 30%)",
    glow: "rgba(16, 185, 129, 0.6)",
  },
  sapphire: {
    bg: "hsl(220 70% 50%)",
    fill: "hsl(220 80% 55%)",
    border: "hsl(220 60% 35%)",
    glow: "rgba(59, 130, 246, 0.6)",
  },
};

// Corner symbols
const CORNER_SYMBOLS: Record<PlayerColor, string> = {
  gold: "☥",
  ruby: "𓂀", 
  emerald: "𓆣",
  sapphire: "△",
};

// Determine what each cell in 15x15 grid should be
const getCellInfo = (row: number, col: number): { 
  type: "path" | "home-area" | "center" | "empty" | "home-column"; 
  color?: PlayerColor;
  isStart?: boolean;
  isSafe?: boolean;
} => {
  // Center 3x3 area (rows 6-8, cols 6-8) - the finish area
  if (row >= 6 && row <= 8 && col >= 6 && col <= 8) {
    return { type: "center" };
  }
  
  // Home bases (4 corner 6x6 areas)
  // Gold (top-left)
  if (row >= 0 && row <= 5 && col >= 0 && col <= 5) {
    return { type: "home-area", color: "gold" };
  }
  // Ruby (top-right)
  if (row >= 0 && row <= 5 && col >= 9 && col <= 14) {
    return { type: "home-area", color: "ruby" };
  }
  // Sapphire (bottom-right)
  if (row >= 9 && row <= 14 && col >= 9 && col <= 14) {
    return { type: "home-area", color: "sapphire" };
  }
  // Emerald (bottom-left)
  if (row >= 9 && row <= 14 && col >= 0 && col <= 5) {
    return { type: "home-area", color: "emerald" };
  }
  
  // Home columns (colored paths leading to center)
  // Gold: row 7, cols 1-5
  if (row === 7 && col >= 1 && col <= 5) {
    return { type: "home-column", color: "gold" };
  }
  // Ruby: rows 1-5, col 7
  if (col === 7 && row >= 1 && row <= 5) {
    return { type: "home-column", color: "ruby" };
  }
  // Sapphire: row 7, cols 9-13
  if (row === 7 && col >= 9 && col <= 13) {
    return { type: "home-column", color: "sapphire" };
  }
  // Emerald: rows 9-13, col 7
  if (col === 7 && row >= 9 && row <= 13) {
    return { type: "home-column", color: "emerald" };
  }
  
  // Main track - the outer path
  // Top horizontal (row 6, cols 0-5 and row 6, cols 9-14)
  if (row === 6 && ((col >= 0 && col <= 5) || (col >= 9 && col <= 14))) {
    // Start positions
    if (row === 6 && col === 1) return { type: "path", color: "gold", isStart: true };
    return { type: "path" };
  }
  // Bottom horizontal (row 8, cols 0-5 and row 8, cols 9-14)
  if (row === 8 && ((col >= 0 && col <= 5) || (col >= 9 && col <= 14))) {
    if (row === 8 && col === 13) return { type: "path", color: "sapphire", isStart: true };
    return { type: "path" };
  }
  // Left vertical (col 6, rows 0-5 and col 6, rows 9-14)
  if (col === 6 && ((row >= 0 && row <= 5) || (row >= 9 && row <= 14))) {
    if (col === 6 && row === 13) return { type: "path", color: "emerald", isStart: true };
    return { type: "path" };
  }
  // Right vertical (col 8, rows 0-5 and col 8, rows 9-14)
  if (col === 8 && ((row >= 0 && row <= 5) || (row >= 9 && row <= 14))) {
    if (col === 8 && row === 1) return { type: "path", color: "ruby", isStart: true };
    return { type: "path" };
  }
  // Horizontal bridges (row 7, cols 0 and 14)
  if (row === 7 && (col === 0 || col === 14)) {
    return { type: "path" };
  }
  // Vertical bridges (col 7, rows 0 and 14)
  if (col === 7 && (row === 0 || row === 14)) {
    return { type: "path" };
  }
  
  return { type: "empty" };
};

// Cell component
const Cell = memo(({ 
  row, 
  col, 
  type,
  color,
  isStart,
}: { 
  row: number; 
  col: number; 
  type: "path" | "home-area" | "center" | "empty" | "home-column";
  color?: PlayerColor;
  isStart?: boolean;
}) => {
  const style = color ? PLAYER_STYLES[color] : null;
  
  if (type === "empty") {
    return <div className="w-full h-full bg-transparent" />;
  }
  
  if (type === "center") {
    // Center finish area - show logo only in middle cell
    const isMiddle = row === 7 && col === 7;
    
    // Determine which triangle/arrow this cell is (for the 4 triangles pointing to center)
    let triangleColor: PlayerColor | null = null;
    if (row === 6 && col === 7) triangleColor = "ruby";
    if (row === 8 && col === 7) triangleColor = "emerald";
    if (row === 7 && col === 6) triangleColor = "gold";
    if (row === 7 && col === 8) triangleColor = "sapphire";
    
    if (isMiddle) {
      return (
        <div 
          className="w-full h-full flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, hsl(35 30% 18%) 0%, hsl(30 25% 14%) 100%)" }}
        >
          {/* Pyramid + circle logo */}
          <div className="relative">
            <div 
              style={{
                width: 0, height: 0,
                borderLeft: '6px solid transparent',
                borderRight: '6px solid transparent',
                borderBottom: '10px solid hsl(45 70% 50%)',
                filter: 'drop-shadow(0 0 4px rgba(251, 191, 36, 0.5))',
              }}
            />
            <div 
              className="absolute top-1/2 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full"
              style={{
                transform: 'translate(-50%, -10%)',
                background: 'radial-gradient(circle at 30% 30%, hsl(45 90% 70%), hsl(45 80% 50%))',
                boxShadow: '0 0 4px rgba(251, 191, 36, 0.8)',
              }}
            />
          </div>
        </div>
      );
    }
    
    if (triangleColor) {
      const triangleStyle = PLAYER_STYLES[triangleColor];
      return (
        <div 
          className="w-full h-full"
          style={{ 
            background: `linear-gradient(135deg, ${triangleStyle.bg}60 0%, ${triangleStyle.bg}30 100%)`,
            borderColor: `${triangleStyle.border}40`,
          }}
        />
      );
    }
    
    // Corner cells of center
    return (
      <div 
        className="w-full h-full"
        style={{ background: "linear-gradient(135deg, hsl(35 25% 15%) 0%, hsl(30 20% 12%) 100%)" }}
      />
    );
  }
  
  if (type === "home-area") {
    return (
      <div 
        className="w-full h-full"
        style={{
          background: `linear-gradient(135deg, ${style?.bg}25 0%, ${style?.bg}15 100%)`,
        }}
      />
    );
  }
  
  if (type === "home-column") {
    return (
      <div 
        className="w-full h-full border border-primary/10"
        style={{
          background: `linear-gradient(135deg, ${style?.bg}50 0%, ${style?.bg}30 100%)`,
          boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.15)',
        }}
      />
    );
  }
  
  // Path cell
  const hieroglyph = ["𓀀", "𓁀", "𓂀", "𓃀", "𓄀"][(row + col) % 5];
  
  return (
    <div 
      className="w-full h-full relative flex items-center justify-center border border-primary/15"
      style={{
        background: isStart && color
          ? `linear-gradient(135deg, ${style?.bg}60 0%, ${style?.bg}40 100%)`
          : "linear-gradient(135deg, hsl(40 30% 24%) 0%, hsl(35 25% 20%) 100%)",
        boxShadow: isStart 
          ? `inset 0 0 8px ${style?.glow || 'rgba(251, 191, 36, 0.3)'}`
          : "inset 0 1px 2px rgba(0,0,0,0.15)",
      }}
    >
      {/* Carved hieroglyph */}
      <span 
        className="absolute text-[5px] md:text-[7px] opacity-15 pointer-events-none"
        style={{
          textShadow: '0.5px 0.5px 1px rgba(0,0,0,0.5)',
          color: 'rgba(251,191,36,0.4)',
        }}
      >
        {hieroglyph}
      </span>
      {isStart && <span className="text-[8px] md:text-[10px] text-primary/70 z-10">★</span>}
    </div>
  );
});

// Token piece component
const TokenPiece = memo(({ 
  color, 
  isMovable, 
  onClick,
  style: positionStyle,
}: { 
  color: PlayerColor; 
  isMovable: boolean; 
  onClick: () => void;
  style: React.CSSProperties;
}) => {
  const style = PLAYER_STYLES[color];
  
  return (
    <button
      onClick={onClick}
      disabled={!isMovable}
      className={`
        absolute
        flex items-center justify-center
        transition-all duration-500 ease-out
        ${isMovable ? 'cursor-pointer z-20' : 'z-10'}
      `}
      style={{
        ...positionStyle,
        width: '75%',
        height: '75%',
        transform: 'translate(-50%, -50%)',
      }}
    >
      {/* Gem pharaoh body */}
      <div 
        className={`
          w-full h-full rounded-sm
          flex items-center justify-center
          transition-transform duration-200
          ${isMovable ? 'scale-110' : 'hover:scale-105'}
        `}
        style={{
          background: `linear-gradient(135deg, ${style.fill} 0%, ${style.bg} 50%, ${style.border} 100%)`,
          boxShadow: isMovable 
            ? `0 0 10px ${style.glow}, 0 0 16px ${style.glow}`
            : `0 2px 4px rgba(0,0,0,0.4), inset 0 1px 2px rgba(255,255,255,0.3)`,
          clipPath: 'polygon(50% 5%, 88% 28%, 88% 88%, 50% 100%, 12% 88%, 12% 28%)',
          border: `1px solid ${style.border}`,
        }}
      >
        {/* Pharaoh silhouette */}
        <svg viewBox="0 0 24 24" className="w-1/2 h-1/2 drop-shadow-sm" fill="rgba(0,0,0,0.3)">
          <path d="M12 2L8 6v2l-2 2v3l2 2v5h8v-5l2-2v-3l-2-2V6l-4-4zm0 2l2 2v1h-4V6l2-2z"/>
        </svg>
      </div>
      
      {/* Movable ring */}
      {isMovable && (
        <div 
          className="absolute inset-[-2px] rounded-full border-2 border-primary animate-pulse pointer-events-none"
        />
      )}
    </button>
  );
});

const LudoBoard = memo(({ 
  players, 
  currentPlayerIndex, 
  movableTokens, 
  onTokenClick,
}: LudoBoardProps) => {
  const boardRef = useRef<HTMLDivElement>(null);
  const [cellSize, setCellSize] = useState(0);
  
  useEffect(() => {
    const updateSize = () => {
      if (boardRef.current) {
        const size = boardRef.current.offsetWidth / 15;
        setCellSize(size);
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Render 15x15 grid
  const grid = [];
  for (let row = 0; row < 15; row++) {
    for (let col = 0; col < 15; col++) {
      const { type, color, isStart, isSafe } = getCellInfo(row, col);
      grid.push(
        <Cell
          key={`${row}-${col}`}
          row={row}
          col={col}
          type={type}
          color={color}
          isStart={isStart}
        />
      );
    }
  }

  // Render tokens
  const renderTokens = () => {
    const tokens: JSX.Element[] = [];
    
    players.forEach((player, playerIndex) => {
      player.tokens.forEach((token, tokenIndex) => {
        const coords = getTokenCoords(token.position, player.color, token.id);
        if (!coords) return;
        
        const isMovable = currentPlayerIndex === playerIndex && movableTokens.includes(tokenIndex);
        
        const left = (coords[1] + 0.5) * cellSize;
        const top = (coords[0] + 0.5) * cellSize;
        
        tokens.push(
          <TokenPiece
            key={`${player.color}-${token.id}`}
            color={player.color}
            isMovable={isMovable}
            onClick={() => onTokenClick(playerIndex, tokenIndex)}
            style={{ left, top }}
          />
        );
      });
    });
    
    return tokens;
  };

  // Render corner symbols in home areas
  const renderCornerSymbols = () => {
    const corners: { color: PlayerColor; row: number; col: number }[] = [
      { color: "gold", row: 2.5, col: 2.5 },
      { color: "ruby", row: 2.5, col: 11.5 },
      { color: "sapphire", row: 11.5, col: 11.5 },
      { color: "emerald", row: 11.5, col: 2.5 },
    ];
    
    return corners.map(({ color, row, col }) => {
      const style = PLAYER_STYLES[color];
      const playerIdx = ["gold", "ruby", "sapphire", "emerald"].indexOf(color);
      const isActive = playerIdx === currentPlayerIndex;
      
      return (
        <div
          key={`symbol-${color}`}
          className="absolute flex items-center justify-center text-lg md:text-2xl pointer-events-none"
          style={{
            left: col * cellSize,
            top: row * cellSize,
            width: cellSize * 2,
            height: cellSize * 2,
            transform: 'translate(-50%, -50%)',
            textShadow: isActive 
              ? `0 0 8px ${style.glow}`
              : '0 2px 4px rgba(0,0,0,0.5)',
            color: isActive ? style.fill : 'rgba(251, 191, 36, 0.4)',
            transition: 'all 0.3s ease',
          }}
        >
          {CORNER_SYMBOLS[color]}
        </div>
      );
    });
  };

  return (
    <div className="relative w-full max-w-[min(85vw,380px)] md:max-w-[min(55vh,420px)] mx-auto aspect-square">
      <div 
        ref={boardRef}
        className="relative w-full h-full rounded-lg overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, hsl(40 35% 20%) 0%, hsl(30 30% 15%) 50%, hsl(35 25% 12%) 100%)',
          boxShadow: `
            0 0 30px rgba(251, 191, 36, 0.08),
            0 8px 24px rgba(0, 0, 0, 0.4),
            inset 0 1px 2px rgba(255, 255, 255, 0.04)
          `,
          border: '2px solid hsl(45 50% 35%)',
        }}
      >
        {/* Subtle shimmer */}
        <div 
          className="absolute inset-0 pointer-events-none opacity-[0.06]"
          style={{
            background: 'linear-gradient(105deg, transparent 40%, rgba(251, 191, 36, 0.4) 50%, transparent 60%)',
            animation: 'shimmer 10s ease-in-out infinite',
          }}
        />
        
        {/* Grid */}
        <div className="absolute inset-0 grid grid-cols-[repeat(15,1fr)] grid-rows-[repeat(15,1fr)]">
          {grid}
        </div>
        
        {/* Tokens */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="relative w-full h-full pointer-events-auto">
            {cellSize > 0 && renderTokens()}
          </div>
        </div>
        
        {/* Corner symbols */}
        {cellSize > 0 && renderCornerSymbols()}
      </div>
      
      <style>{`
        @keyframes shimmer {
          0%, 100% { transform: translateX(-100%); }
          50% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
});

Cell.displayName = 'Cell';
TokenPiece.displayName = 'TokenPiece';
LudoBoard.displayName = 'LudoBoard';

export default LudoBoard;
