import { memo, useEffect, useState, useRef } from "react";
import { Token, PlayerColor, getTokenCoords } from "./ludoTypes";

interface LudoBoardProps {
  players: { color: PlayerColor; tokens: Token[]; isAI: boolean }[];
  currentPlayerIndex: number;
  movableTokens: number[];
  onTokenClick: (playerIndex: number, tokenIndex: number) => void;
}

const PLAYER_COLORS: Record<PlayerColor, { 
  bg: string;
  light: string;
  dark: string;
  glow: string;
}> = {
  gold: {
    bg: "#EAB308",
    light: "#FDE047",
    dark: "#A16207",
    glow: "rgba(251, 191, 36, 0.6)",
  },
  ruby: {
    bg: "#DC2626",
    light: "#F87171",
    dark: "#991B1B",
    glow: "rgba(239, 68, 68, 0.6)",
  },
  emerald: {
    bg: "#16A34A",
    light: "#4ADE80",
    dark: "#166534",
    glow: "rgba(16, 185, 129, 0.6)",
  },
  sapphire: {
    bg: "#2563EB",
    light: "#60A5FA",
    dark: "#1E40AF",
    glow: "rgba(59, 130, 246, 0.6)",
  },
};

const CORNER_SYMBOLS: Record<PlayerColor, string> = {
  gold: "☥",
  ruby: "𓂀", 
  emerald: "𓆣",
  sapphire: "△",
};

// Token piece
const TokenPiece = memo(({ 
  color, 
  isMovable, 
  onClick,
  left,
  top,
  cellSize,
}: { 
  color: PlayerColor; 
  isMovable: boolean; 
  onClick: () => void;
  left: number;
  top: number;
  cellSize: number;
}) => {
  const colors = PLAYER_COLORS[color];
  const size = cellSize * 0.75;
  
  return (
    <button
      onClick={onClick}
      disabled={!isMovable}
      className={`absolute transition-all duration-500 ease-out ${isMovable ? 'cursor-pointer z-20' : 'z-10'}`}
      style={{
        left: left - size / 2,
        top: top - size / 2,
        width: size,
        height: size,
      }}
    >
      <div 
        className={`w-full h-full flex items-center justify-center transition-transform duration-200 ${isMovable ? 'scale-110' : 'hover:scale-105'}`}
        style={{
          background: `linear-gradient(135deg, ${colors.light} 0%, ${colors.bg} 50%, ${colors.dark} 100%)`,
          boxShadow: isMovable 
            ? `0 0 10px ${colors.glow}, 0 0 16px ${colors.glow}`
            : `0 2px 4px rgba(0,0,0,0.5), inset 0 1px 2px rgba(255,255,255,0.3)`,
          clipPath: 'polygon(50% 5%, 88% 28%, 88% 88%, 50% 100%, 12% 88%, 12% 28%)',
          border: `1px solid ${colors.dark}`,
        }}
      >
        <svg viewBox="0 0 24 24" className="w-1/2 h-1/2" fill="rgba(0,0,0,0.25)">
          <path d="M12 2L8 6v2l-2 2v3l2 2v5h8v-5l2-2v-3l-2-2V6l-4-4z"/>
        </svg>
      </div>
      {isMovable && (
        <div className="absolute inset-[-3px] rounded-full border-2 border-yellow-400 animate-pulse pointer-events-none" />
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
  const [boardSize, setBoardSize] = useState(0);
  
  useEffect(() => {
    const updateSize = () => {
      if (boardRef.current) {
        setBoardSize(boardRef.current.offsetWidth);
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  const cellSize = boardSize / 15;
  const pathCellStyle = "bg-[#3a3424] border border-[#5a4a34]";
  const hieroglyphs = ["𓀀", "𓁀", "𓂀", "𓃀", "𓄀"];

  // Render a single path cell
  const PathCell = ({ row, col, colored, isStart }: { row: number; col: number; colored?: PlayerColor; isStart?: boolean }) => {
    const colors = colored ? PLAYER_COLORS[colored] : null;
    const h = hieroglyphs[(row + col) % 5];
    return (
      <div
        className="absolute flex items-center justify-center border border-[#5a4a34]/50"
        style={{
          left: col * cellSize,
          top: row * cellSize,
          width: cellSize,
          height: cellSize,
          background: colored 
            ? `linear-gradient(135deg, ${colors!.bg}88 0%, ${colors!.bg}55 100%)`
            : 'linear-gradient(135deg, #3a3424 0%, #2e2a1e 100%)',
          boxShadow: isStart ? `inset 0 0 8px ${colors?.glow || 'rgba(251,191,36,0.3)'}` : 'inset 0 1px 2px rgba(0,0,0,0.2)',
        }}
      >
        <span className="text-[5px] md:text-[7px] opacity-20 text-amber-500/50 absolute">{h}</span>
        {isStart && <span className="text-[8px] md:text-[10px] text-amber-400/80 z-10">★</span>}
      </div>
    );
  };

  // Render home base (corner colored area with 4 token slots)
  const HomeBase = ({ color, startRow, startCol }: { color: PlayerColor; startRow: number; startCol: number }) => {
    const colors = PLAYER_COLORS[color];
    const size = cellSize * 6;
    const innerSize = cellSize * 4;
    const innerOffset = cellSize;
    
    return (
      <div
        className="absolute rounded-lg overflow-hidden"
        style={{
          left: startCol * cellSize,
          top: startRow * cellSize,
          width: size,
          height: size,
          background: `linear-gradient(135deg, ${colors.bg}40 0%, ${colors.bg}20 100%)`,
          border: `2px solid ${colors.bg}60`,
        }}
      >
        {/* Inner white/gold area for tokens */}
        <div
          className="absolute rounded-md"
          style={{
            left: innerOffset,
            top: innerOffset,
            width: innerSize,
            height: innerSize,
            background: 'linear-gradient(135deg, #4a4030 0%, #3a3424 100%)',
            border: '2px solid #5a4a34',
            boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.3)',
          }}
        >
          {/* 4 token slots in a 2x2 grid */}
          {[0, 1, 2, 3].map((i) => {
            const slotRow = Math.floor(i / 2);
            const slotCol = i % 2;
            const slotSize = cellSize * 1.2;
            const spacing = (innerSize - slotSize * 2) / 3;
            return (
              <div
                key={i}
                className="absolute rounded-full"
                style={{
                  left: spacing + slotCol * (slotSize + spacing),
                  top: spacing + slotRow * (slotSize + spacing),
                  width: slotSize,
                  height: slotSize,
                  background: `radial-gradient(circle at 30% 30%, ${colors.light}40, ${colors.bg}30)`,
                  border: `2px solid ${colors.bg}`,
                  boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3)',
                }}
              />
            );
          })}
        </div>
        
        {/* Corner symbol */}
        <div
          className="absolute text-lg md:text-2xl"
          style={{
            top: '8%',
            left: '8%',
            color: `${colors.bg}90`,
            textShadow: `0 0 8px ${colors.glow}`,
          }}
        >
          {CORNER_SYMBOLS[color]}
        </div>
      </div>
    );
  };

  // Build the path cells
  const renderPath = () => {
    if (cellSize === 0) return null;
    
    const cells: JSX.Element[] = [];
    
    // TOP ARM (rows 0-5, cols 6-8)
    for (let row = 0; row <= 5; row++) {
      for (let col = 6; col <= 8; col++) {
        let colored: PlayerColor | undefined;
        let isStart = false;
        
        if (col === 7) colored = "ruby"; // Home column
        if (row === 1 && col === 8) { colored = "ruby"; isStart = true; }
        
        cells.push(<PathCell key={`${row}-${col}`} row={row} col={col} colored={colored} isStart={isStart} />);
      }
    }
    
    // BOTTOM ARM (rows 9-14, cols 6-8)
    for (let row = 9; row <= 14; row++) {
      for (let col = 6; col <= 8; col++) {
        let colored: PlayerColor | undefined;
        let isStart = false;
        
        if (col === 7) colored = "emerald"; // Home column
        if (row === 13 && col === 6) { colored = "emerald"; isStart = true; }
        
        cells.push(<PathCell key={`${row}-${col}`} row={row} col={col} colored={colored} isStart={isStart} />);
      }
    }
    
    // LEFT ARM (rows 6-8, cols 0-5)
    for (let row = 6; row <= 8; row++) {
      for (let col = 0; col <= 5; col++) {
        let colored: PlayerColor | undefined;
        let isStart = false;
        
        if (row === 7) colored = "gold"; // Home column
        if (row === 6 && col === 1) { colored = "gold"; isStart = true; }
        
        cells.push(<PathCell key={`${row}-${col}`} row={row} col={col} colored={colored} isStart={isStart} />);
      }
    }
    
    // RIGHT ARM (rows 6-8, cols 9-14)
    for (let row = 6; row <= 8; row++) {
      for (let col = 9; col <= 14; col++) {
        let colored: PlayerColor | undefined;
        let isStart = false;
        
        if (row === 7) colored = "sapphire"; // Home column
        if (row === 8 && col === 13) { colored = "sapphire"; isStart = true; }
        
        cells.push(<PathCell key={`${row}-${col}`} row={row} col={col} colored={colored} isStart={isStart} />);
      }
    }
    
    // CENTER 3x3 (rows 6-8, cols 6-8)
    for (let row = 6; row <= 8; row++) {
      for (let col = 6; col <= 8; col++) {
        const isMiddle = row === 7 && col === 7;
        let triangleColor: PlayerColor | undefined;
        
        if (row === 6 && col === 7) triangleColor = "ruby";
        if (row === 8 && col === 7) triangleColor = "emerald";
        if (row === 7 && col === 6) triangleColor = "gold";
        if (row === 7 && col === 8) triangleColor = "sapphire";
        
        const colors = triangleColor ? PLAYER_COLORS[triangleColor] : null;
        
        cells.push(
          <div
            key={`center-${row}-${col}`}
            className="absolute flex items-center justify-center"
            style={{
              left: col * cellSize,
              top: row * cellSize,
              width: cellSize,
              height: cellSize,
              background: triangleColor 
                ? `linear-gradient(135deg, ${colors!.bg}60 0%, ${colors!.bg}30 100%)`
                : 'linear-gradient(135deg, #2a261e 0%, #1e1a14 100%)',
              border: '1px solid #4a4034',
            }}
          >
            {isMiddle && (
              <div className="relative">
                <div 
                  style={{
                    width: 0, height: 0,
                    borderLeft: '6px solid transparent',
                    borderRight: '6px solid transparent',
                    borderBottom: '10px solid #EAB308',
                    filter: 'drop-shadow(0 0 4px rgba(251, 191, 36, 0.6))',
                  }}
                />
                <div 
                  className="absolute top-1/2 left-1/2 w-2 h-2 rounded-full"
                  style={{
                    transform: 'translate(-50%, -30%)',
                    background: 'radial-gradient(circle at 30% 30%, #FDE047, #EAB308)',
                    boxShadow: '0 0 6px rgba(251, 191, 36, 0.8)',
                  }}
                />
              </div>
            )}
          </div>
        );
      }
    }
    
    return cells;
  };

  // Render tokens
  const renderTokens = () => {
    if (cellSize === 0) return null;
    
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
            left={left}
            top={top}
            cellSize={cellSize}
          />
        );
      });
    });
    
    return tokens;
  };

  return (
    <div className="relative w-full max-w-[min(85vw,380px)] md:max-w-[min(55vh,420px)] mx-auto aspect-square">
      <div 
        ref={boardRef}
        className="relative w-full h-full rounded-lg overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #2e2a1e 0%, #252218 50%, #1e1a14 100%)',
          boxShadow: '0 0 30px rgba(251, 191, 36, 0.08), 0 8px 24px rgba(0, 0, 0, 0.5)',
          border: '3px solid #5a4a34',
        }}
      >
        {/* Subtle shimmer */}
        <div 
          className="absolute inset-0 pointer-events-none opacity-[0.04]"
          style={{
            background: 'linear-gradient(105deg, transparent 40%, rgba(251, 191, 36, 0.5) 50%, transparent 60%)',
            animation: 'shimmer 12s ease-in-out infinite',
          }}
        />
        
        {/* Home bases */}
        {boardSize > 0 && (
          <>
            <HomeBase color="gold" startRow={0} startCol={0} />
            <HomeBase color="ruby" startRow={0} startCol={9} />
            <HomeBase color="sapphire" startRow={9} startCol={9} />
            <HomeBase color="emerald" startRow={9} startCol={0} />
          </>
        )}
        
        {/* Path cells */}
        {renderPath()}
        
        {/* Tokens */}
        {renderTokens()}
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

TokenPiece.displayName = 'TokenPiece';
LudoBoard.displayName = 'LudoBoard';

export default LudoBoard;
