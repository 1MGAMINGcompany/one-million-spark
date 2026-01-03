/**
 * Ludo Board Component
 * 
 * Renders the Egyptian-themed Ludo board with tokens.
 * Works with both old format (position-based) and new format (state-based).
 */

import { memo, useEffect, useState, useRef } from "react";
import LudoCaptureAnimation, { CaptureEvent } from "./LudoCaptureAnimation";

// Re-export types for backward compatibility
export type PlayerColor = 'gold' | 'ruby' | 'sapphire' | 'emerald';

// Token interface that works with both old and new systems
export interface Token {
  id: number;
  color: PlayerColor;
  position: number; // -1 = BASE, 0-51 = TRACK, 56-61 = HOME_PATH, 62 = FINISHED
}

export interface Player {
  color: PlayerColor;
  tokens: Token[];
  isAI: boolean;
  startPosition?: number;
  homeColumn?: number;
}

interface LudoBoardProps {
  players: Player[];
  currentPlayerIndex: number;
  movableTokens: number[];
  onTokenClick: (playerIndex: number, tokenIndex: number) => void;
  captureEvent?: CaptureEvent | null;
  onCaptureAnimationComplete?: () => void;
  eliminatedPlayers?: Set<number>;
}

// Color configuration
const PLAYER_COLORS: Record<PlayerColor, { 
  bg: string;
  light: string;
  dark: string;
  glow: string;
}> = {
  gold: {
    bg: "#D4AF37",
    light: "#F4D03F",
    dark: "#8B7021",
    glow: "rgba(212, 175, 55, 0.6)",
  },
  ruby: {
    bg: "#E31B23",
    light: "#FF6B6B",
    dark: "#8B0000",
    glow: "rgba(227, 27, 35, 0.5)",
  },
  emerald: {
    bg: "#50C878",
    light: "#7DCEA0",
    dark: "#228B22",
    glow: "rgba(80, 200, 120, 0.5)",
  },
  sapphire: {
    bg: "#0F52BA",
    light: "#5B9BD5",
    dark: "#082567",
    glow: "rgba(15, 82, 186, 0.5)",
  },
};

const CORNER_SYMBOLS: Record<PlayerColor, string> = {
  gold: "☥",
  ruby: "𓂀", 
  emerald: "𓆣",
  sapphire: "△",
};

/**
 * Board coordinate mappings (15x15 grid)
 * Track: 52 cells (0-51), forming a continuous clockwise path
 * 
 * Standard Ludo board with 4 arms (top, bottom, left, right) and center.
 * Each arm is 6 cells wide (columns 6-8 or rows 6-8).
 * Track goes around the outside of each arm.
 */
const TRACK_COORDS: Record<number, [number, number]> = {
  // === GOLD'S SECTION (0-12): Start bottom-left, go UP then turn RIGHT ===
  0: [6, 1],   // Gold START (row 6, col 1) - safe square
  1: [5, 1],   // moving up
  2: [4, 1],
  3: [3, 1],
  4: [2, 1],
  5: [1, 1],
  6: [0, 1],   // top-left corner area
  7: [0, 2],   // moving right along top
  8: [0, 3],
  9: [0, 4],
  10: [0, 5],
  11: [0, 6],  // entering top arm
  12: [1, 6],  // moving down into ruby's area
  
  // === RUBY'S SECTION (13-25): Start top, go DOWN then turn RIGHT ===
  13: [2, 6],  // Ruby START (row 2, col 6) - safe square
  14: [3, 6],  // moving down
  15: [4, 6],
  16: [5, 6],
  17: [6, 6],  // center-left area
  18: [6, 7],  // moving right through center
  19: [6, 8],  
  20: [6, 9],  // entering right arm
  21: [6, 10],
  22: [6, 11],
  23: [6, 12],
  24: [6, 13],
  25: [7, 13], // turning down into sapphire's area
  
  // === SAPPHIRE'S SECTION (26-38): Start top-right, go DOWN then turn LEFT ===
  26: [8, 13], // Sapphire START (row 8, col 13) - safe square
  27: [8, 12], // moving left
  28: [8, 11],
  29: [8, 10],
  30: [8, 9],
  31: [8, 8],  // center-right area
  32: [9, 8],  // moving down
  33: [10, 8],
  34: [11, 8],
  35: [12, 8],
  36: [13, 8],
  37: [14, 8], // bottom-right corner area
  38: [14, 7], // turning left into emerald's area
  
  // === EMERALD'S SECTION (39-51): Start bottom, go UP then turn LEFT ===
  39: [14, 6], // Emerald START (row 14, col 6) - safe square
  40: [13, 6], // moving up
  41: [12, 6],
  42: [11, 6],
  43: [10, 6],
  44: [9, 6],
  45: [8, 6],  // center-bottom area
  46: [8, 5],  // moving left
  47: [8, 4],
  48: [8, 3],
  49: [8, 2],
  50: [8, 1],
  51: [7, 1],  // turning up to connect back to Gold's start area
};

// Home path coordinates (positions 56-61 in old format, 0-5 in new format)
// These are the colored paths leading to the center (7,7)
const HOME_PATH_COORDS: Record<PlayerColor, [number, number][]> = {
  gold: [[7, 2], [7, 3], [7, 4], [7, 5], [7, 6], [7, 7]],     // enters from col 1, goes right
  ruby: [[2, 7], [3, 7], [4, 7], [5, 7], [6, 7], [7, 7]],     // enters from row 1, goes down  
  sapphire: [[7, 12], [7, 11], [7, 10], [7, 9], [7, 8], [7, 7]], // enters from col 13, goes left
  emerald: [[12, 7], [11, 7], [10, 7], [9, 7], [8, 7], [7, 7]], // enters from row 13, goes up
};

// Home base token positions (position -1)
const HOME_BASE_COORDS: Record<PlayerColor, [number, number][]> = {
  gold: [[2, 2], [2, 4], [4, 2], [4, 4]],
  ruby: [[2, 10], [2, 12], [4, 10], [4, 12]],
  sapphire: [[10, 10], [10, 12], [12, 10], [12, 12]],
  emerald: [[10, 2], [10, 4], [12, 2], [12, 4]],
};

// Finished position (center)
const FINISHED_COORD: [number, number] = [7, 7];

// Get token coordinates from position
function getTokenCoords(position: number, color: PlayerColor, tokenId: number): [number, number] | null {
  // BASE
  if (position === -1) {
    return HOME_BASE_COORDS[color][tokenId];
  }
  
  // FINISHED
  if (position === 62) {
    return FINISHED_COORD;
  }
  
  // HOME_PATH (56-61)
  if (position >= 56 && position <= 61) {
    const pathIndex = position - 56;
    return HOME_PATH_COORDS[color][pathIndex];
  }
  
  // TRACK (0-51)
  if (position >= 0 && position <= 51) {
    return TRACK_COORDS[position];
  }
  
  console.warn(`Unknown position: ${position} for ${color}`);
  return null;
}

// Token piece component
const TokenPiece = memo(({ 
  color, 
  isMovable, 
  onClick,
  left,
  top,
  cellSize,
  isEliminated,
}: { 
  color: PlayerColor; 
  isMovable: boolean; 
  onClick: () => void;
  left: number;
  top: number;
  cellSize: number;
  isEliminated?: boolean;
}) => {
  const colors = PLAYER_COLORS[color];
  const size = cellSize * 0.7;
  
  const eliminatedStyle = isEliminated ? {
    filter: 'grayscale(100%) brightness(0.6)',
    opacity: 0.4,
  } : {};
  
  return (
    <button
      onClick={onClick}
      disabled={!isMovable || isEliminated}
      className={`absolute transition-all duration-300 ease-out ${isMovable && !isEliminated ? 'cursor-pointer z-20' : 'z-10'}`}
      style={{
        left: left - size / 2,
        top: top - size / 2,
        width: size,
        height: size,
        ...eliminatedStyle,
      }}
    >
      <div 
        className={`w-full h-full flex items-center justify-center transition-transform duration-200 ${isMovable && !isEliminated ? 'scale-110' : ''}`}
        style={{
          background: `linear-gradient(145deg, ${colors.light} 0%, ${colors.bg} 40%, ${colors.dark} 100%)`,
          boxShadow: isMovable && !isEliminated
            ? `0 0 12px ${colors.glow}, 0 0 20px ${colors.glow}`
            : `0 3px 6px rgba(0,0,0,0.4), inset 0 2px 3px rgba(255,255,255,0.4)`,
          clipPath: 'polygon(50% 5%, 85% 25%, 85% 85%, 50% 100%, 15% 85%, 15% 25%)',
          border: `1px solid ${colors.dark}`,
        }}
      >
        <svg viewBox="0 0 24 24" className="w-1/2 h-1/2" fill="rgba(0,0,0,0.2)">
          <path d="M12 2L8 6v2l-2 2v3l2 2v5h8v-5l2-2v-3l-2-2V6l-4-4z"/>
        </svg>
      </div>
      {isMovable && !isEliminated && (
        <div className="absolute inset-[-4px] rounded-full border-2 border-amber-300 animate-pulse pointer-events-none" />
      )}
      {isEliminated && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-full h-0.5 bg-red-500/70 rotate-45 absolute" />
          <div className="w-full h-0.5 bg-red-500/70 -rotate-45 absolute" />
        </div>
      )}
    </button>
  );
});

TokenPiece.displayName = 'TokenPiece';

const LudoBoard = memo(({ 
  players, 
  currentPlayerIndex, 
  movableTokens, 
  onTokenClick,
  captureEvent,
  onCaptureAnimationComplete,
  eliminatedPlayers = new Set(),
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
  const hieroglyphs = ["𓀀", "𓁀", "𓂀", "𓃀", "𓄀", "𓅀", "𓆣", "☥"];

  // Path cell component
  const PathCell = ({ row, col, colored, isStart }: { row: number; col: number; colored?: PlayerColor; isStart?: boolean }) => {
    const colors = colored ? PLAYER_COLORS[colored] : null;
    const h = hieroglyphs[(row * 3 + col * 2) % hieroglyphs.length];
    
    return (
      <div
        className="absolute flex items-center justify-center"
        style={{
          left: col * cellSize,
          top: row * cellSize,
          width: cellSize,
          height: cellSize,
          background: colored 
            ? `linear-gradient(145deg, ${colors!.bg}99 0%, ${colors!.bg}66 100%)`
            : 'linear-gradient(145deg, #4a3c20 0%, #3a2e18 50%, #2e2410 100%)',
          boxShadow: `inset 2px 2px 4px rgba(0,0,0,0.5), inset -1px -1px 2px rgba(255,215,0,0.1)`,
          border: '1px solid #2a2008',
        }}
      >
        <span 
          className="text-[6px] md:text-[8px] absolute"
          style={{ color: 'rgba(139, 112, 33, 0.4)' }}
        >
          {h}
        </span>
        {isStart && (
          <span 
            className="text-[10px] md:text-xs z-10"
            style={{ 
              color: colors?.light || '#FFD700',
              textShadow: `0 0 4px ${colors?.glow || 'rgba(255,215,0,0.5)'}`,
            }}
          >
            ★
          </span>
        )}
      </div>
    );
  };

  // Home base component
  const HomeBase = ({ color, startRow, startCol, isEliminated }: { color: PlayerColor; startRow: number; startCol: number; isEliminated?: boolean }) => {
    const colors = PLAYER_COLORS[color];
    const size = cellSize * 6;
    const innerSize = cellSize * 4;
    const innerOffset = cellSize;
    
    return (
      <div
        className="absolute overflow-hidden"
        style={{
          left: startCol * cellSize,
          top: startRow * cellSize,
          width: size,
          height: size,
          background: `linear-gradient(145deg, ${colors.bg}50 0%, ${colors.bg}30 100%)`,
          border: `2px solid ${colors.bg}80`,
          boxShadow: `inset 0 0 20px ${colors.glow}`,
          filter: isEliminated ? 'grayscale(100%) brightness(0.5)' : undefined,
          opacity: isEliminated ? 0.6 : 1,
        }}
      >
        <div
          className="absolute"
          style={{
            left: innerOffset,
            top: innerOffset,
            width: innerSize,
            height: innerSize,
            background: 'linear-gradient(145deg, #5a4820 0%, #4a3818 50%, #3a2a10 100%)',
            border: '2px solid #6a5828',
            boxShadow: 'inset 2px 2px 8px rgba(0,0,0,0.4)',
          }}
        >
          {[0, 1, 2, 3].map((i) => {
            const slotRow = Math.floor(i / 2);
            const slotCol = i % 2;
            const slotSize = cellSize * 1.1;
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
                  background: `radial-gradient(circle at 30% 30%, ${colors.light}30, ${colors.bg}20)`,
                  border: `2px solid ${colors.bg}80`,
                  boxShadow: 'inset 2px 2px 4px rgba(0,0,0,0.3)',
                }}
              />
            );
          })}
        </div>
        
        <div
          className="absolute text-xl md:text-2xl"
          style={{
            top: '6%',
            left: '6%',
            color: `${colors.bg}`,
            textShadow: `0 0 6px ${colors.glow}`,
          }}
        >
          {CORNER_SYMBOLS[color]}
        </div>
        
        {isEliminated && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <div className="w-3/4 h-1 bg-red-600/80 rotate-45 absolute rounded" />
            <div className="w-3/4 h-1 bg-red-600/80 -rotate-45 absolute rounded" />
            <span className="absolute bottom-2 text-xs font-bold text-red-500/90 uppercase tracking-wider">
              OUT
            </span>
          </div>
        )}
      </div>
    );
  };

  // Render path cells - generate from TRACK_COORDS and HOME_PATH_COORDS
  const renderPath = () => {
    if (cellSize === 0) return null;
    
    const cells: JSX.Element[] = [];
    const renderedCells = new Set<string>();
    
    // Safe square positions (start positions)
    const safeSquares: Record<string, PlayerColor> = {
      '6,1': 'gold',
      '2,6': 'ruby',
      '8,13': 'sapphire',
      '14,6': 'emerald',
    };
    
    // Render all track cells
    Object.values(TRACK_COORDS).forEach(([row, col]) => {
      const key = `${row},${col}`;
      if (renderedCells.has(key)) return;
      renderedCells.add(key);
      
      const safeColor = safeSquares[key];
      cells.push(
        <PathCell 
          key={`track-${row}-${col}`} 
          row={row} 
          col={col} 
          isStart={!!safeColor}
          colored={safeColor}
        />
      );
    });
    
    // Render all home path cells
    const homePathColors: PlayerColor[] = ['gold', 'ruby', 'sapphire', 'emerald'];
    homePathColors.forEach(color => {
      HOME_PATH_COORDS[color].forEach(([row, col]) => {
        const key = `${row},${col}`;
        if (renderedCells.has(key)) return;
        renderedCells.add(key);
        
        cells.push(
          <PathCell 
            key={`home-${color}-${row}-${col}`} 
            row={row} 
            col={col} 
            colored={color}
          />
        );
      });
    });
    
    // CENTER 3x3 (rows 6-8, cols 6-8) - special rendering for center pyramid
    for (let row = 6; row <= 8; row++) {
      for (let col = 6; col <= 8; col++) {
        const key = `${row},${col}`;
        if (renderedCells.has(key)) continue;
        renderedCells.add(key);
        
        const isMiddle = row === 7 && col === 7;
        let triangleColor: PlayerColor | undefined;
        
        if (row === 6 && col === 7) triangleColor = "ruby";
        if (row === 8 && col === 7) triangleColor = "emerald";
        if (row === 7 && col === 6) triangleColor = "gold";
        if (row === 7 && col === 8) triangleColor = "sapphire";
        
        const colors = triangleColor ? PLAYER_COLORS[triangleColor] : null;
        
        cells.push(
          <div
            key={`c-${row}-${col}`}
            className="absolute flex items-center justify-center"
            style={{
              left: col * cellSize,
              top: row * cellSize,
              width: cellSize,
              height: cellSize,
              background: triangleColor 
                ? `linear-gradient(145deg, ${colors!.bg}70 0%, ${colors!.bg}40 100%)`
                : 'linear-gradient(145deg, #3a2e18 0%, #2a2008 100%)',
              border: '1px solid #2a2008',
              boxShadow: 'inset 1px 1px 3px rgba(0,0,0,0.4)',
            }}
          >
            {isMiddle && (
              <div className="relative">
                <div 
                  style={{
                    width: 0, height: 0,
                    borderLeft: `${cellSize * 0.2}px solid transparent`,
                    borderRight: `${cellSize * 0.2}px solid transparent`,
                    borderBottom: `${cellSize * 0.35}px solid #FFD700`,
                    filter: 'drop-shadow(0 0 4px rgba(255, 215, 0, 0.6))',
                  }}
                />
                <div 
                  className="absolute top-1/2 left-1/2 rounded-full"
                  style={{
                    width: cellSize * 0.12,
                    height: cellSize * 0.12,
                    transform: 'translate(-50%, -20%)',
                    background: 'radial-gradient(circle at 30% 30%, #FFF8DC, #FFD700)',
                    boxShadow: '0 0 8px rgba(255, 215, 0, 0.8)',
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
      const isPlayerEliminated = eliminatedPlayers.has(playerIndex);
      
      player.tokens.forEach((token, tokenIndex) => {
        const coords = getTokenCoords(token.position, player.color, token.id);
        if (!coords) {
          return;
        }
        
        const isMovable = !isPlayerEliminated && currentPlayerIndex === playerIndex && movableTokens.includes(tokenIndex);
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
            isEliminated={isPlayerEliminated}
          />
        );
      });
    });
    
    return tokens;
  };

  return (
    <div className="relative w-full max-w-[75vw] sm:max-w-[85vw] md:max-w-[min(60vh,480px)] mx-auto aspect-square">
      <div 
        ref={boardRef}
        className="relative w-full h-full overflow-hidden"
        style={{
          background: 'linear-gradient(145deg, #FFE066 0%, #F7D94C 25%, #F4D03F 50%, #E6BE33 75%, #D4AF37 100%)',
          boxShadow: '0 0 60px rgba(255, 224, 102, 0.35), 0 12px 32px rgba(0, 0, 0, 0.3), inset 0 2px 8px rgba(255,255,255,0.5)',
          border: '4px solid #E6BE33',
          borderRadius: '8px',
        }}
      >
        {/* Subtle gold shimmer */}
        <div 
          className="absolute inset-0 pointer-events-none opacity-[0.08]"
          style={{
            background: 'linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.5) 50%, transparent 70%)',
            animation: 'goldShimmer 8s ease-in-out infinite',
          }}
        />
        
        {/* Home bases */}
        {boardSize > 0 && (
          <>
            <HomeBase color="gold" startRow={0} startCol={0} isEliminated={eliminatedPlayers.has(0)} />
            <HomeBase color="ruby" startRow={0} startCol={9} isEliminated={eliminatedPlayers.has(1)} />
            <HomeBase color="sapphire" startRow={9} startCol={9} isEliminated={eliminatedPlayers.has(3)} />
            <HomeBase color="emerald" startRow={9} startCol={0} isEliminated={eliminatedPlayers.has(2)} />
          </>
        )}
        
        {/* Path cells */}
        {renderPath()}
        
        {/* Tokens */}
        {renderTokens()}
        
        {/* Capture Animation */}
        {captureEvent && onCaptureAnimationComplete && (
          <LudoCaptureAnimation
            captureEvent={captureEvent}
            cellSize={cellSize}
            onAnimationComplete={onCaptureAnimationComplete}
          />
        )}
      </div>
      
      <style>{`
        @keyframes goldShimmer {
          0%, 100% { transform: translateX(-120%); }
          50% { transform: translateX(120%); }
        }
      `}</style>
    </div>
  );
});

LudoBoard.displayName = 'LudoBoard';

export default LudoBoard;
