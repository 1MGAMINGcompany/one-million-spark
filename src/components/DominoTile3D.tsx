import { cn } from "@/lib/utils";

type TileSize = "default" | "mobile";

// Which half of the tile was clicked
export type TileHalfClicked = "left" | "right";

interface DominoTile3DProps {
  left: number;
  right: number;
  isClickable?: boolean;
  isSelected?: boolean;
  isPlayable?: boolean;
  isAITurn?: boolean;
  isChainTile?: boolean;
  size?: TileSize;
  onClick?: (halfClicked?: TileHalfClicked) => void;
  className?: string;
}

// SVG pip positions for domino faces
const pipPositions: Record<number, { cx: number; cy: number }[]> = {
  0: [],
  1: [{ cx: 50, cy: 50 }],
  2: [{ cx: 25, cy: 25 }, { cx: 75, cy: 75 }],
  3: [{ cx: 25, cy: 25 }, { cx: 50, cy: 50 }, { cx: 75, cy: 75 }],
  4: [{ cx: 25, cy: 25 }, { cx: 75, cy: 25 }, { cx: 25, cy: 75 }, { cx: 75, cy: 75 }],
  5: [{ cx: 25, cy: 25 }, { cx: 75, cy: 25 }, { cx: 50, cy: 50 }, { cx: 25, cy: 75 }, { cx: 75, cy: 75 }],
  6: [{ cx: 25, cy: 25 }, { cx: 75, cy: 25 }, { cx: 25, cy: 50 }, { cx: 75, cy: 50 }, { cx: 25, cy: 75 }, { cx: 75, cy: 75 }],
};

const DominoPips = ({ count, offsetY = 0 }: { count: number; offsetY?: number }) => (
  <>
    {pipPositions[count]?.map((pos, i) => (
      <g key={i}>
        {/* Pip glow */}
        <circle
          cx={pos.cx}
          cy={pos.cy + offsetY}
          r="10"
          fill="url(#pipGlow)"
          opacity="0.6"
        />
        {/* Main pip */}
        <circle
          cx={pos.cx}
          cy={pos.cy + offsetY}
          r="7"
          fill="url(#goldPipGradient)"
          stroke="hsl(35 80% 40%)"
          strokeWidth="0.5"
        />
        {/* Pip highlight */}
        <circle
          cx={pos.cx - 2}
          cy={pos.cy + offsetY - 2}
          r="2"
          fill="hsl(45 93% 75% / 0.6)"
        />
      </g>
    ))}
  </>
);

const DominoTile3D = ({
  left,
  right,
  isClickable = false,
  isSelected = false,
  isPlayable = false,
  isAITurn = false,
  isChainTile = false,
  size = "default",
  onClick,
  className,
}: DominoTile3DProps) => {
  // Size multipliers for mobile (smaller to fit 6-7 tiles side by side)
  const sizeMultiplier = size === "mobile" ? 0.52 : 1;
  const baseTileWidth = isChainTile ? 60 : 80;
  const baseTileHeight = isChainTile ? 36 : 120;
  const tileWidth = Math.round(baseTileWidth * sizeMultiplier);
  const tileHeight = Math.round(baseTileHeight * sizeMultiplier);
  const isHorizontal = isChainTile;

  // Handle click with position detection for vertical tiles
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!isClickable || !onClick) return;
    
    // For chain tiles (horizontal), just fire the click
    if (isChainTile) {
      onClick();
      return;
    }
    
    // For hand tiles (vertical), detect which half was clicked
    const rect = e.currentTarget.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const halfHeight = rect.height / 2;
    
    // Top half = "left" value (first pip section), Bottom half = "right" value
    const halfClicked: TileHalfClicked = clickY < halfHeight ? "left" : "right";
    onClick(halfClicked);
  };

  return (
    <button
      onClick={handleClick}
      disabled={!isClickable}
      className={cn(
        "relative group transition-all duration-300 focus:outline-none",
        isClickable && isPlayable && "cursor-pointer hover:-translate-y-2",
        isClickable && !isPlayable && "opacity-40 cursor-not-allowed",
        !isClickable && "cursor-default",
        isSelected && "scale-105 -translate-y-3",
        isAITurn && !isChainTile && "opacity-50",
        className
      )}
      style={{
        perspective: "500px",
      }}
    >
      {/* Playable glow ring */}
      {isPlayable && !isChainTile && (
        <div className="absolute -inset-1 bg-gradient-to-r from-primary via-gold-light to-primary rounded-xl opacity-60 blur-sm animate-pulse-gold group-hover:opacity-100 group-hover:blur-md transition-all" />
      )}

      {/* Selected ring */}
      {isSelected && (
        <div className="absolute -inset-1.5 bg-gradient-to-r from-primary to-gold-light rounded-xl opacity-90 blur-md" />
      )}

      {/* Drop shadow */}
      <div 
        className={cn(
          "absolute inset-0 translate-y-2 rounded-xl bg-black/40 blur-md transition-transform duration-300",
          isClickable && isPlayable && "group-hover:translate-y-3 group-hover:blur-lg",
          isSelected && "translate-y-3 blur-lg"
        )}
        style={{
          transform: isChainTile ? "translateY(3px)" : undefined
        }}
      />

      {/* Main tile container with 3D transform */}
      <div
        className={cn(
          "relative transition-transform duration-300",
          isClickable && isPlayable && "group-hover:[transform:rotateX(8deg)]",
          isSelected && "[transform:rotateX(10deg)]"
        )}
        style={{
          transformStyle: "preserve-3d",
        }}
      >
        <svg
          width={isHorizontal ? tileWidth : tileWidth}
          height={isHorizontal ? tileHeight : tileHeight}
          viewBox={isHorizontal ? "0 0 200 100" : "0 0 100 200"}
          className="relative"
        >
          <defs>
            {/* Main tile gradient - matte black */}
            <linearGradient id="tileGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="hsl(220 20% 18%)" />
              <stop offset="40%" stopColor="hsl(220 15% 10%)" />
              <stop offset="100%" stopColor="hsl(220 20% 6%)" />
            </linearGradient>

            {/* Top edge glossy reflection */}
            <linearGradient id="glossyTop" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="hsl(220 10% 35%)" />
              <stop offset="30%" stopColor="hsl(220 15% 20%)" />
              <stop offset="100%" stopColor="transparent" />
            </linearGradient>

            {/* Gold pip gradient */}
            <radialGradient id="goldPipGradient" cx="30%" cy="30%" r="70%">
              <stop offset="0%" stopColor="hsl(45 93% 75%)" />
              <stop offset="50%" stopColor="hsl(45 93% 54%)" />
              <stop offset="100%" stopColor="hsl(35 80% 35%)" />
            </radialGradient>

            {/* Pip glow */}
            <radialGradient id="pipGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="hsl(45 93% 54% / 0.6)" />
              <stop offset="100%" stopColor="transparent" />
            </radialGradient>

            {/* Divider gold gradient */}
            <linearGradient id="dividerGradient" x1="0%" y1="0%" x2={isHorizontal ? "0%" : "100%"} y2={isHorizontal ? "100%" : "0%"}>
              <stop offset="0%" stopColor="hsl(35 80% 30%)" />
              <stop offset="50%" stopColor="hsl(45 93% 54%)" />
              <stop offset="100%" stopColor="hsl(35 80% 30%)" />
            </linearGradient>

            {/* Bevel edge */}
            <linearGradient id="bevelEdge" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="hsl(220 15% 25%)" />
              <stop offset="50%" stopColor="hsl(220 15% 15%)" />
              <stop offset="100%" stopColor="hsl(220 15% 8%)" />
            </linearGradient>
          </defs>

          {/* Outer bevel edge */}
          <rect
            x="0"
            y="0"
            width={isHorizontal ? 200 : 100}
            height={isHorizontal ? 100 : 200}
            rx="12"
            ry="12"
            fill="url(#bevelEdge)"
          />

          {/* Main tile body */}
          <rect
            x="3"
            y="3"
            width={isHorizontal ? 194 : 94}
            height={isHorizontal ? 94 : 194}
            rx="10"
            ry="10"
            fill="url(#tileGradient)"
          />

          {/* Glossy top reflection */}
          <rect
            x="3"
            y="3"
            width={isHorizontal ? 194 : 94}
            height={isHorizontal ? 30 : 50}
            rx="10"
            ry="10"
            fill="url(#glossyTop)"
            opacity="0.7"
          />

          {/* Inner shadow for depth */}
          <rect
            x="6"
            y="6"
            width={isHorizontal ? 188 : 88}
            height={isHorizontal ? 88 : 188}
            rx="8"
            ry="8"
            fill="none"
            stroke="hsl(220 20% 5%)"
            strokeWidth="2"
            opacity="0.5"
          />

          {isHorizontal ? (
            <>
              {/* Left half pips (scaled and positioned for horizontal) */}
              <g transform="translate(0, 0) scale(1, 1)">
                <DominoPips count={left} offsetY={0} />
              </g>

              {/* Center divider - gold inlay */}
              <line
                x1="100"
                y1="15"
                x2="100"
                y2="85"
                stroke="url(#dividerGradient)"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <line
                x1="100"
                y1="15"
                x2="100"
                y2="85"
                stroke="hsl(45 93% 70% / 0.3)"
                strokeWidth="1"
              />

              {/* Right half pips */}
              <g transform="translate(100, 0)">
                <DominoPips count={right} offsetY={0} />
              </g>
            </>
          ) : (
            <>
              {/* Top half pips */}
              <DominoPips count={left} offsetY={0} />

              {/* Center divider - gold inlay */}
              <line
                x1="15"
                y1="100"
                x2="85"
                y2="100"
                stroke="url(#dividerGradient)"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <line
                x1="15"
                y1="100"
                x2="85"
                y2="100"
                stroke="hsl(45 93% 70% / 0.3)"
                strokeWidth="1"
              />

              {/* Bottom half pips */}
              <DominoPips count={right} offsetY={100} />
            </>
          )}

          {/* Subtle texture overlay */}
          <rect
            x="3"
            y="3"
            width={isHorizontal ? 194 : 94}
            height={isHorizontal ? 94 : 194}
            rx="10"
            ry="10"
            fill="url(#noisePattern)"
            opacity="0.03"
          />
        </svg>
      </div>
    </button>
  );
};

// Face-down tile for AI hand
export const DominoTileBack = ({ isThinking = false }: { isThinking?: boolean }) => (
  <div className={cn(
    "relative transition-all duration-300",
    isThinking && "opacity-60"
  )}>
    {/* Thinking glow indicator */}
    {isThinking && (
      <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-primary animate-pulse shadow-[0_0_10px_2px_hsl(45_93%_54%_/_0.6)]" />
    )}
    
    {/* Drop shadow */}
    <div className="absolute inset-0 translate-y-1 rounded-lg bg-black/30 blur-sm" />
    
    <svg width="48" height="36" viewBox="0 0 100 75" className="relative">
      <defs>
        <linearGradient id="backGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="hsl(220 20% 16%)" />
          <stop offset="50%" stopColor="hsl(220 15% 10%)" />
          <stop offset="100%" stopColor="hsl(220 20% 6%)" />
        </linearGradient>
        <linearGradient id="backGlossy" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="hsl(220 10% 30%)" />
          <stop offset="40%" stopColor="transparent" />
        </linearGradient>
        <radialGradient id="centerDecor" cx="50%" cy="50%" r="40%">
          <stop offset="0%" stopColor="hsl(45 93% 54% / 0.3)" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
      </defs>

      {/* Bevel edge */}
      <rect x="0" y="0" width="100" height="75" rx="8" fill="hsl(220 15% 20%)" />
      
      {/* Main body */}
      <rect x="2" y="2" width="96" height="71" rx="6" fill="url(#backGradient)" />
      
      {/* Glossy top */}
      <rect x="2" y="2" width="96" height="25" rx="6" fill="url(#backGlossy)" opacity="0.5" />
      
      {/* Center decoration */}
      <circle cx="50" cy="37.5" r="15" fill="url(#centerDecor)" />
      
      {/* Question mark or pattern */}
      <text x="50" y="45" textAnchor="middle" fill="hsl(45 93% 54% / 0.4)" fontSize="24" fontFamily="serif">?</text>
    </svg>
  </div>
);

export default DominoTile3D;
