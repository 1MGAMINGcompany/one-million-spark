import { useState, useEffect, useCallback, useRef } from "react";
import { Chess, Square, PieceSymbol, Color } from "chess.js";
import { cn } from "@/lib/utils";
import { 
  CaptureAnimationLayer, 
  CaptureAnimation
} from "./CaptureAnimationLayer";

interface ChessBoardPremiumProps {
  game: Chess;
  onMove: (from: Square, to: Square) => boolean;
  disabled?: boolean;
  captureAnimations?: CaptureAnimation[];
  onAnimationComplete?: (id: string) => void;
  animationsEnabled?: boolean;
  flipped?: boolean;
  playerColor?: Color;
}

const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
const ranks = ["8", "7", "6", "5", "4", "3", "2", "1"];

// Premium Chess Piece SVG Component
const ChessPiece = ({ 
  type, 
  color, 
  isSelected 
}: { 
  type: PieceSymbol; 
  color: Color;
  isSelected: boolean;
}) => {
  const isWhite = color === "w";
  
  // SVG piece paths (simplified stylized versions)
  const piecePaths: Record<PieceSymbol, JSX.Element> = {
    k: (
      <g>
        {/* King cross */}
        <path d="M50 8 L50 20 M44 14 L56 14" stroke={isWhite ? "url(#darkGoldGradient)" : "url(#obsidianTrim)"} strokeWidth="4" strokeLinecap="round"/>
        {/* Crown base */}
        <path d="M30 30 Q50 20 70 30 L75 60 Q50 55 25 60 Z" fill={isWhite ? "url(#ivoryGradient)" : "url(#obsidianGradient)"} stroke={isWhite ? "url(#darkGoldGradient)" : "url(#obsidianTrim)"} strokeWidth="2.5"/>
        {/* Base */}
        <ellipse cx="50" cy="75" rx="28" ry="10" fill={isWhite ? "url(#ivoryGradient)" : "url(#obsidianGradient)"} stroke={isWhite ? "url(#darkGoldGradient)" : "url(#obsidianTrim)"} strokeWidth="2.5"/>
        <rect x="25" y="60" width="50" height="15" rx="3" fill={isWhite ? "url(#ivoryGradient)" : "url(#obsidianGradient)"} stroke={isWhite ? "url(#darkGoldGradient)" : "url(#obsidianTrim)"} strokeWidth="2.5"/>
      </g>
    ),
    q: (
      <g>
        {/* Crown points */}
        <path d="M20 35 L30 55 L40 35 L50 55 L60 35 L70 55 L80 35 L75 65 L25 65 Z" fill={isWhite ? "url(#ivoryGradient)" : "url(#obsidianGradient)"} stroke={isWhite ? "url(#darkGoldGradient)" : "url(#obsidianTrim)"} strokeWidth="2.5"/>
        {/* Crown jewels */}
        <circle cx="20" cy="30" r="5" fill={isWhite ? "url(#darkGoldGradient)" : "url(#obsidianTrim)"}/>
        <circle cx="40" cy="30" r="5" fill={isWhite ? "url(#darkGoldGradient)" : "url(#obsidianTrim)"}/>
        <circle cx="60" cy="30" r="5" fill={isWhite ? "url(#darkGoldGradient)" : "url(#obsidianTrim)"}/>
        <circle cx="80" cy="30" r="5" fill={isWhite ? "url(#darkGoldGradient)" : "url(#obsidianTrim)"}/>
        <circle cx="50" cy="25" r="6" fill={isWhite ? "url(#darkGoldGradient)" : "url(#obsidianTrim)"}/>
        {/* Base */}
        <ellipse cx="50" cy="78" rx="28" ry="10" fill={isWhite ? "url(#ivoryGradient)" : "url(#obsidianGradient)"} stroke={isWhite ? "url(#darkGoldGradient)" : "url(#obsidianTrim)"} strokeWidth="2.5"/>
        <rect x="25" y="65" width="50" height="13" rx="3" fill={isWhite ? "url(#ivoryGradient)" : "url(#obsidianGradient)"} stroke={isWhite ? "url(#darkGoldGradient)" : "url(#obsidianTrim)"} strokeWidth="2.5"/>
      </g>
    ),
    r: (
      <g>
        {/* Tower top */}
        <path d="M25 25 L25 40 L35 40 L35 30 L45 30 L45 40 L55 40 L55 30 L65 30 L65 40 L75 40 L75 25 Z" fill={isWhite ? "url(#ivoryGradient)" : "url(#obsidianGradient)"} stroke={isWhite ? "url(#darkGoldGradient)" : "url(#obsidianTrim)"} strokeWidth="2.5"/>
        {/* Tower body */}
        <rect x="28" y="40" width="44" height="25" fill={isWhite ? "url(#ivoryGradient)" : "url(#obsidianGradient)"} stroke={isWhite ? "url(#darkGoldGradient)" : "url(#obsidianTrim)"} strokeWidth="2.5"/>
        {/* Base */}
        <ellipse cx="50" cy="78" rx="28" ry="10" fill={isWhite ? "url(#ivoryGradient)" : "url(#obsidianGradient)"} stroke={isWhite ? "url(#darkGoldGradient)" : "url(#obsidianTrim)"} strokeWidth="2.5"/>
        <rect x="22" y="65" width="56" height="13" rx="3" fill={isWhite ? "url(#ivoryGradient)" : "url(#obsidianGradient)"} stroke={isWhite ? "url(#darkGoldGradient)" : "url(#obsidianTrim)"} strokeWidth="2.5"/>
      </g>
    ),
    b: (
      <g>
        {/* Bishop head */}
        <ellipse cx="50" cy="22" rx="8" ry="10" fill={isWhite ? "url(#ivoryGradient)" : "url(#obsidianGradient)"} stroke={isWhite ? "url(#darkGoldGradient)" : "url(#obsidianTrim)"} strokeWidth="2.5"/>
        <path d="M50 12 L50 18" stroke={isWhite ? "url(#darkGoldGradient)" : "url(#obsidianTrim)"} strokeWidth="3" strokeLinecap="round"/>
        {/* Body */}
        <path d="M35 35 Q50 25 65 35 L60 65 L40 65 Z" fill={isWhite ? "url(#ivoryGradient)" : "url(#obsidianGradient)"} stroke={isWhite ? "url(#darkGoldGradient)" : "url(#obsidianTrim)"} strokeWidth="2.5"/>
        {/* Base */}
        <ellipse cx="50" cy="78" rx="26" ry="10" fill={isWhite ? "url(#ivoryGradient)" : "url(#obsidianGradient)"} stroke={isWhite ? "url(#darkGoldGradient)" : "url(#obsidianTrim)"} strokeWidth="2.5"/>
        <rect x="28" y="65" width="44" height="13" rx="3" fill={isWhite ? "url(#ivoryGradient)" : "url(#obsidianGradient)"} stroke={isWhite ? "url(#darkGoldGradient)" : "url(#obsidianTrim)"} strokeWidth="2.5"/>
      </g>
    ),
    n: (
      <g>
        {/* Horse head - distinctive silhouette with mane, ears, and muzzle */}
        <path 
          d="M30 72 L32 55 L28 48 Q26 38 32 30 Q36 22 42 18 L44 12 L48 18 Q52 14 56 16 L58 12 L62 18 Q72 22 74 35 Q75 42 70 48 L72 52 Q74 56 70 58 L65 55 Q60 60 55 58 L50 62 L48 72 Z" 
          fill={isWhite ? "url(#ivoryGradient)" : "url(#obsidianGradient)"} 
          stroke={isWhite ? "url(#darkGoldGradient)" : "url(#obsidianTrim)"} 
          strokeWidth="2.5"
        />
        {/* Mane detail */}
        <path 
          d="M44 18 Q40 28 42 38 M48 18 Q46 26 48 34 M52 16 Q52 24 54 30" 
          stroke={isWhite ? "url(#darkGoldGradient)" : "url(#obsidianTrim)"} 
          strokeWidth="1.5" 
          fill="none"
          strokeLinecap="round"
        />
        {/* Nostril */}
        <ellipse cx="68" cy="50" rx="2" ry="3" fill={isWhite ? "hsl(35 50% 45%)" : "hsl(220 15% 25%)"}/>
        {/* Eye - larger and more visible */}
        <ellipse cx="56" cy="32" rx="4" ry="5" fill={isWhite ? "hsl(35 60% 25%)" : "hsl(45 90% 50%)"}/>
        <circle cx="55" cy="31" r="1.5" fill={isWhite ? "hsl(45 30% 90%)" : "hsl(45 93% 80%)"}/>
        {/* Base */}
        <ellipse cx="50" cy="82" rx="26" ry="8" fill={isWhite ? "url(#ivoryGradient)" : "url(#obsidianGradient)"} stroke={isWhite ? "url(#darkGoldGradient)" : "url(#obsidianTrim)"} strokeWidth="2.5"/>
        <rect x="28" y="72" width="44" height="10" rx="3" fill={isWhite ? "url(#ivoryGradient)" : "url(#obsidianGradient)"} stroke={isWhite ? "url(#darkGoldGradient)" : "url(#obsidianTrim)"} strokeWidth="2.5"/>
      </g>
    ),
    p: (
      <g>
        {/* Pawn head */}
        <circle cx="50" cy="28" r="14" fill={isWhite ? "url(#ivoryGradient)" : "url(#obsidianGradient)"} stroke={isWhite ? "url(#darkGoldGradient)" : "url(#obsidianTrim)"} strokeWidth="2.5"/>
        {/* Neck */}
        <path d="M40 42 Q50 50 60 42 L58 60 L42 60 Z" fill={isWhite ? "url(#ivoryGradient)" : "url(#obsidianGradient)"} stroke={isWhite ? "url(#darkGoldGradient)" : "url(#obsidianTrim)"} strokeWidth="2.5"/>
        {/* Base */}
        <ellipse cx="50" cy="78" rx="24" ry="10" fill={isWhite ? "url(#ivoryGradient)" : "url(#obsidianGradient)"} stroke={isWhite ? "url(#darkGoldGradient)" : "url(#obsidianTrim)"} strokeWidth="2.5"/>
        <rect x="30" y="60" width="40" height="18" rx="3" fill={isWhite ? "url(#ivoryGradient)" : "url(#obsidianGradient)"} stroke={isWhite ? "url(#darkGoldGradient)" : "url(#obsidianTrim)"} strokeWidth="2.5"/>
      </g>
    ),
  };

  return (
    <svg 
      viewBox="0 0 100 90" 
      className={cn(
        "w-full h-full drop-shadow-lg transition-all duration-200",
        isSelected && "drop-shadow-[0_0_15px_hsl(45_93%_54%_/_0.8)] scale-110"
      )}
    >
      <defs>
        {/* Ivory/Gold gradient for white pieces */}
        <linearGradient id="ivoryGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="hsl(45 30% 95%)" />
          <stop offset="30%" stopColor="hsl(45 25% 88%)" />
          <stop offset="70%" stopColor="hsl(40 20% 80%)" />
          <stop offset="100%" stopColor="hsl(35 25% 70%)" />
        </linearGradient>
        
        {/* Gold trim gradient */}
        <linearGradient id="goldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="hsl(45 93% 65%)" />
          <stop offset="50%" stopColor="hsl(45 93% 54%)" />
          <stop offset="100%" stopColor="hsl(35 80% 40%)" />
        </linearGradient>
        
        {/* Darker gold gradient for white piece outlines - more contrast */}
        <linearGradient id="darkGoldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="hsl(40 85% 45%)" />
          <stop offset="40%" stopColor="hsl(35 80% 35%)" />
          <stop offset="70%" stopColor="hsl(30 75% 28%)" />
          <stop offset="100%" stopColor="hsl(25 70% 22%)" />
        </linearGradient>
        
        {/* Obsidian gradient for black pieces - more contrast */}
        <linearGradient id="obsidianGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="hsl(220 20% 28%)" />
          <stop offset="30%" stopColor="hsl(220 18% 18%)" />
          <stop offset="70%" stopColor="hsl(220 15% 12%)" />
          <stop offset="100%" stopColor="hsl(220 12% 8%)" />
        </linearGradient>
        
        {/* Gold trim for black pieces - more visible */}
        <linearGradient id="obsidianTrim" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="hsl(45 93% 65%)" />
          <stop offset="50%" stopColor="hsl(45 93% 50%)" />
          <stop offset="100%" stopColor="hsl(35 80% 40%)" />
        </linearGradient>
      </defs>
      
      {piecePaths[type]}
      
      {/* Specular highlight */}
      <ellipse 
        cx="42" 
        cy="35" 
        rx="8" 
        ry="4" 
        fill={isWhite ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.15)"} 
      />
      
      {/* Additional rim light for black pieces */}
      {!isWhite && (
        <ellipse 
          cx="55" 
          cy="25" 
          rx="6" 
          ry="3" 
          fill="hsl(45 93% 70% / 0.2)" 
        />
      )}
    </svg>
  );
};

export function ChessBoardPremium({ 
  game, 
  onMove, 
  disabled = false,
  captureAnimations = [],
  onAnimationComplete,
  animationsEnabled = true,
  flipped = false,
  playerColor = "w"
}: ChessBoardPremiumProps) {
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [legalMoves, setLegalMoves] = useState<Square[]>([]);
  const [movingPiece, setMovingPiece] = useState<{ from: Square; to: Square } | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const [squareSize, setSquareSize] = useState(0);

  // Flip the board based on player color or explicit flip prop
  const displayFiles = flipped ? [...files].reverse() : files;
  const displayRanks = flipped ? [...ranks].reverse() : ranks;

  // Measure square size
  useEffect(() => {
    const updateSize = () => {
      if (boardRef.current) {
        const boardWidth = boardRef.current.offsetWidth;
        setSquareSize(boardWidth / 8);
      }
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  const handleSquareClick = useCallback((square: Square) => {
    if (disabled) return;

    const piece = game.get(square);

    if (selectedSquare) {
      const moveSuccessful = onMove(selectedSquare, square);
      
      if (moveSuccessful) {
        setMovingPiece({ from: selectedSquare, to: square });
        setTimeout(() => setMovingPiece(null), 300);
        setSelectedSquare(null);
        setLegalMoves([]);
        return;
      }

      // Allow selecting own pieces based on playerColor
      if (piece && piece.color === playerColor) {
        setSelectedSquare(square);
        const moves = game.moves({ square, verbose: true });
        setLegalMoves(moves.map((m) => m.to as Square));
        return;
      }

      setSelectedSquare(null);
      setLegalMoves([]);
      return;
    }

    // Select piece if it belongs to the player
    if (piece && piece.color === playerColor) {
      setSelectedSquare(square);
      const moves = game.moves({ square, verbose: true });
      setLegalMoves(moves.map((m) => m.to as Square));
    }
  }, [disabled, game, selectedSquare, onMove, playerColor]);

  const isLightSquare = (file: number, rank: number) => {
    return (file + rank) % 2 === 0;
  };

  return (
    <div className="aspect-square w-full max-w-[600px] md:max-w-none md:max-h-[calc(100vh-220px)] md:w-auto md:h-[calc(100vh-220px)] mx-auto">
      {/* Gold border frame */}
      <div className="relative p-1 rounded-lg bg-gradient-to-br from-primary via-gold-light to-primary shadow-[0_0_30px_-5px_hsl(45_93%_54%_/_0.5)]">
        <div ref={boardRef} className="relative grid grid-cols-8 rounded overflow-hidden">
          {/* Capture Animation Layer */}
          {onAnimationComplete && (
            <CaptureAnimationLayer 
              animations={captureAnimations}
              onAnimationComplete={onAnimationComplete}
              squareSize={squareSize}
              enabled={animationsEnabled}
            />
          )}
          {displayRanks.map((rank, rankIndex) =>
            displayFiles.map((file, fileIndex) => {
              const square = `${file}${rank}` as Square;
              const piece = game.get(square);
              // Calculate light/dark based on actual board position, not display position
              const actualFileIndex = files.indexOf(file);
              const actualRankIndex = ranks.indexOf(rank);
              const isLight = isLightSquare(actualFileIndex, actualRankIndex);
              const isSelected = selectedSquare === square;
              const isLegalMove = legalMoves.includes(square);
              const isCheck = game.isCheck() && piece?.type === "k" && piece?.color === game.turn();
              const isMoving = movingPiece?.to === square;

              return (
                <button
                  key={square}
                  onClick={() => handleSquareClick(square)}
                  disabled={disabled}
                  className={cn(
                    "aspect-square flex items-center justify-center relative transition-all duration-200",
                    disabled ? "cursor-not-allowed" : "cursor-pointer",
                    isSelected && "z-10"
                  )}
                  style={{
                    background: isLight 
                      ? "linear-gradient(135deg, hsl(40 45% 75%) 0%, hsl(38 50% 70%) 50%, hsl(35 45% 65%) 100%)"
                      : "linear-gradient(135deg, hsl(45 80% 50%) 0%, hsl(43 75% 45%) 30%, hsl(40 70% 38%) 60%, hsl(38 65% 32%) 100%)",
                  }}
                >
                  {/* Sandstone/Obsidian texture overlay */}
                  <div 
                    className="absolute inset-0 opacity-30 pointer-events-none"
                    style={{
                      backgroundImage: isLight 
                        ? `url("data:image/svg+xml,%3Csvg viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.15'/%3E%3C/svg%3E")`
                        : undefined,
                    }}
                  />
                  
                  {/* Gold square enhancements for shiny effect */}
                  {!isLight && (
                    <>
                      {/* Metallic shine gradient overlay */}
                      <div 
                        className="absolute inset-0 pointer-events-none"
                        style={{
                          background: "linear-gradient(135deg, rgba(255,255,255,0.25) 0%, transparent 30%, transparent 70%, rgba(255,255,255,0.1) 100%)",
                        }}
                      />
                      
                      {/* Radial highlight for depth */}
                      <div 
                        className="absolute inset-0 pointer-events-none"
                        style={{
                          background: "radial-gradient(ellipse at 30% 30%, rgba(255,255,255,0.2) 0%, transparent 50%)",
                        }}
                      />
                      
                      {/* Bottom shadow for 3D effect */}
                      <div 
                        className="absolute inset-0 pointer-events-none"
                        style={{
                          background: "linear-gradient(180deg, transparent 60%, rgba(0,0,0,0.2) 100%)",
                        }}
                      />
                      
                      {/* Subtle texture */}
                      <div 
                        className="absolute inset-0 pointer-events-none opacity-20"
                        style={{
                          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.2' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.2'/%3E%3C/svg%3E")`,
                        }}
                      />
                      
                      
                      {/* Inner glow border for definition */}
                      <div 
                        className="absolute inset-0 pointer-events-none"
                        style={{
                          boxShadow: "inset 0 0 6px 1px hsl(35 70% 25% / 0.3)",
                        }}
                      />
                    </>
                  )}

                  {/* Selection glow - enhanced for dark squares */}
                  {isSelected && (
                    <div 
                      className={cn(
                        "absolute inset-0 animate-pulse",
                        isLight ? "bg-primary/30" : "bg-primary/40"
                      )}
                      style={!isLight ? {
                        boxShadow: "inset 0 0 15px 3px hsl(45 93% 54% / 0.5)",
                      } : undefined}
                    />
                  )}
                  
                  {/* Check indicator - dramatic pulsing danger effect */}
                  {isCheck && (
                    <>
                      {/* Radial danger gradient */}
                      <div 
                        className="absolute inset-0 animate-check-pulse"
                        style={{
                          background: "radial-gradient(circle at center, hsl(0 80% 50% / 0.6) 0%, hsl(0 70% 40% / 0.4) 50%, transparent 70%)",
                        }}
                      />
                      {/* Pulsing ring around the king */}
                      <div 
                        className="absolute inset-1 rounded-sm animate-check-ring"
                        style={{
                          boxShadow: "0 0 12px 3px hsl(0 80% 50% / 0.7), inset 0 0 8px 2px hsl(0 80% 50% / 0.4)",
                        }}
                      />
                      {/* Corner warning indicators */}
                      <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-red-500 animate-pulse" />
                      <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-red-500 animate-pulse" />
                      <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-red-500 animate-pulse" />
                      <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-red-500 animate-pulse" />
                    </>
                  )}

                  {/* Legal move indicator */}
                  {isLegalMove && !piece && (
                    <div className="absolute w-4 h-4 rounded-full bg-primary/50 shadow-[0_0_10px_2px_hsl(45_93%_54%_/_0.5)] animate-pulse" />
                  )}
                  {isLegalMove && piece && (
                    <div className="absolute inset-1 ring-4 ring-primary/60 rounded-sm shadow-[0_0_15px_2px_hsl(45_93%_54%_/_0.4)]" />
                  )}
                  
                  {/* Piece */}
                  {piece && (
                    <div 
                      className={cn(
                        "w-[80%] h-[80%] transition-all",
                        isMoving && "animate-[bounce_0.3s_ease-out]"
                      )}
                    >
                      <ChessPiece 
                        type={piece.type} 
                        color={piece.color}
                        isSelected={isSelected}
                      />
                    </div>
                  )}

                  {/* Square notation */}
                  {fileIndex === 0 && (
                    <span className={cn(
                      "absolute top-0.5 left-1 text-xs font-medium",
                      isLight ? "text-amber-800/60" : "text-primary/50"
                    )}>
                      {rank}
                    </span>
                  )}
                  {rankIndex === 7 && (
                    <span className={cn(
                      "absolute bottom-0.5 right-1 text-xs font-medium",
                      isLight ? "text-amber-800/60" : "text-primary/50"
                    )}>
                      {file}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export default ChessBoardPremium;
