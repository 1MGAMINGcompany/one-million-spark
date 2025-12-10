import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface Dice3DProps {
  value: number;
  variant: "ivory" | "obsidian";
  isRolling?: boolean;
  className?: string;
  size?: "xs" | "sm" | "md" | "lg";
}

// Pip positions for dice faces
const pipPositions: Record<number, { x: number; y: number }[]> = {
  1: [{ x: 50, y: 50 }],
  2: [{ x: 25, y: 25 }, { x: 75, y: 75 }],
  3: [{ x: 25, y: 25 }, { x: 50, y: 50 }, { x: 75, y: 75 }],
  4: [{ x: 25, y: 25 }, { x: 75, y: 25 }, { x: 25, y: 75 }, { x: 75, y: 75 }],
  5: [{ x: 25, y: 25 }, { x: 75, y: 25 }, { x: 50, y: 50 }, { x: 25, y: 75 }, { x: 75, y: 75 }],
  6: [{ x: 25, y: 25 }, { x: 75, y: 25 }, { x: 25, y: 50 }, { x: 75, y: 50 }, { x: 25, y: 75 }, { x: 75, y: 75 }],
};

export const Dice3D = ({ value, variant, isRolling = false, className, size = "md" }: Dice3DProps) => {
  const [displayValue, setDisplayValue] = useState(value);
  const [rolling, setRolling] = useState(false);

  useEffect(() => {
    if (isRolling) {
      setRolling(true);
      let count = 0;
      const interval = setInterval(() => {
        setDisplayValue(Math.floor(Math.random() * 6) + 1);
        count++;
        if (count >= 8) {
          clearInterval(interval);
          setDisplayValue(value);
          setRolling(false);
        }
      }, 80);
      return () => clearInterval(interval);
    } else {
      setDisplayValue(value);
    }
  }, [isRolling, value]);

  const isIvory = variant === "ivory";
  const sizeMap = { xs: 28, sm: 36, md: 48, lg: 56 };
  const svgSize = sizeMap[size];

  return (
    <div
      className={cn(
        "relative transition-all duration-300",
        rolling && "animate-bounce",
        className
      )}
      style={{
        perspective: "200px",
      }}
    >
      {/* Glow effect */}
      <div
        className={cn(
          "absolute inset-0 rounded-lg blur-md opacity-60",
          isIvory ? "bg-primary/40" : "bg-primary/20"
        )}
      />

      {/* Drop shadow */}
      <div className="absolute inset-0 translate-y-2 rounded-lg bg-black/40 blur-md" />

      <svg
        width={svgSize}
        height={svgSize}
        viewBox="0 0 100 100"
        className={cn(
          "relative drop-shadow-lg transition-transform duration-100",
          rolling && "scale-110"
        )}
        style={{
          transform: rolling ? `rotateX(${Math.random() * 20 - 10}deg) rotateY(${Math.random() * 20 - 10}deg)` : undefined,
        }}
      >
        <defs>
          {/* Ivory gradient */}
          <linearGradient id={`ivoryGradient-${value}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="hsl(45 20% 95%)" />
            <stop offset="30%" stopColor="hsl(45 15% 90%)" />
            <stop offset="70%" stopColor="hsl(40 10% 85%)" />
            <stop offset="100%" stopColor="hsl(35 15% 78%)" />
          </linearGradient>

          {/* Obsidian gradient */}
          <linearGradient id={`obsidianGradient-${value}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="hsl(220 20% 22%)" />
            <stop offset="30%" stopColor="hsl(220 18% 15%)" />
            <stop offset="70%" stopColor="hsl(220 15% 10%)" />
            <stop offset="100%" stopColor="hsl(220 20% 6%)" />
          </linearGradient>

          {/* Top specular highlight */}
          <linearGradient id={`specular-${value}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={isIvory ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.3)"} />
            <stop offset="30%" stopColor={isIvory ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.1)"} />
            <stop offset="100%" stopColor="transparent" />
          </linearGradient>

          {/* Gold pip gradient */}
          <radialGradient id={`goldPip-${value}`} cx="30%" cy="30%" r="70%">
            <stop offset="0%" stopColor="hsl(45 93% 75%)" />
            <stop offset="50%" stopColor="hsl(45 93% 54%)" />
            <stop offset="100%" stopColor="hsl(35 80% 35%)" />
          </radialGradient>

          {/* Pip glow */}
          <radialGradient id={`pipGlow-${value}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="hsl(45 93% 54% / 0.5)" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
        </defs>

        {/* Dice body */}
        <rect
          x="5"
          y="5"
          width="90"
          height="90"
          rx="12"
          ry="12"
          fill={isIvory ? `url(#ivoryGradient-${value})` : `url(#obsidianGradient-${value})`}
          stroke={isIvory ? "hsl(35 15% 70%)" : "hsl(45 93% 40% / 0.3)"}
          strokeWidth="2"
        />

        {/* Specular highlight */}
        <rect
          x="8"
          y="8"
          width="84"
          height="40"
          rx="10"
          ry="10"
          fill={`url(#specular-${value})`}
        />

        {/* Inner bevel shadow */}
        <rect
          x="10"
          y="10"
          width="80"
          height="80"
          rx="10"
          ry="10"
          fill="none"
          stroke={isIvory ? "hsl(35 10% 75%)" : "hsl(220 20% 5%)"}
          strokeWidth="1"
          opacity="0.5"
        />

        {/* Pips */}
        {pipPositions[displayValue]?.map((pos, i) => (
          <g key={i}>
            {/* Pip glow */}
            <circle
              cx={pos.x}
              cy={pos.y}
              r="12"
              fill={`url(#pipGlow-${value})`}
            />
            {/* Pip body */}
            <circle
              cx={pos.x}
              cy={pos.y}
              r="8"
              fill={`url(#goldPip-${value})`}
              stroke="hsl(35 80% 35%)"
              strokeWidth="0.5"
            />
            {/* Pip highlight */}
            <circle
              cx={pos.x - 2}
              cy={pos.y - 2}
              r="2.5"
              fill="hsl(45 93% 80% / 0.7)"
            />
          </g>
        ))}
      </svg>
    </div>
  );
};

interface Checker3DProps {
  variant: "gold" | "obsidian";
  count?: number;
  isSelected?: boolean;
  isValidTarget?: boolean;
  onClick?: () => void;
  className?: string;
  size?: "xs" | "sm" | "md" | "lg";
}

export const Checker3D = ({ 
  variant, 
  count = 1, 
  isSelected = false, 
  isValidTarget = false,
  onClick,
  className,
  size = "md"
}: Checker3DProps) => {
  const isGold = variant === "gold";
  const sizeMap = { xs: { w: 22, h: 16 }, sm: { w: 28, h: 20 }, md: { w: 32, h: 24 }, lg: { w: 40, h: 30 } };
  const { w, h } = sizeMap[size];

  return (
    <button
      onClick={onClick}
      className={cn(
        "relative transition-all duration-200 focus:outline-none",
        onClick && "cursor-pointer hover:scale-105",
        isSelected && "scale-110",
        // Larger touch target on mobile
        "min-w-[44px] min-h-[44px] flex items-center justify-center",
        className
      )}
    >
      {/* Valid target glow */}
      {isValidTarget && (
        <div className="absolute -inset-1 bg-primary rounded-full animate-pulse-gold blur-sm opacity-80" />
      )}

      {/* Selection glow */}
      {isSelected && (
        <div className="absolute -inset-1.5 bg-gradient-to-r from-primary via-gold-light to-primary rounded-full blur-md opacity-90" />
      )}

      {/* Drop shadow */}
      <div className="absolute inset-0 translate-y-1 rounded-full bg-black/40 blur-sm" />

      <svg
        width={w}
        height={h}
        viewBox="0 0 100 75"
        className="relative drop-shadow-md"
      >
        <defs>
          {/* Gold gradient */}
          <radialGradient id={`goldChecker-${variant}`} cx="35%" cy="35%" r="65%">
            <stop offset="0%" stopColor="hsl(45 93% 70%)" />
            <stop offset="40%" stopColor="hsl(45 93% 54%)" />
            <stop offset="80%" stopColor="hsl(35 80% 40%)" />
            <stop offset="100%" stopColor="hsl(35 70% 30%)" />
          </radialGradient>

          {/* Obsidian gradient */}
          <radialGradient id={`obsidianChecker-${variant}`} cx="35%" cy="35%" r="65%">
            <stop offset="0%" stopColor="hsl(220 15% 25%)" />
            <stop offset="40%" stopColor="hsl(220 15% 15%)" />
            <stop offset="80%" stopColor="hsl(220 15% 8%)" />
            <stop offset="100%" stopColor="hsl(220 15% 4%)" />
          </radialGradient>

          {/* Gold rim for obsidian */}
          <linearGradient id="goldRim" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="hsl(45 93% 60% / 0.4)" />
            <stop offset="50%" stopColor="hsl(45 93% 40% / 0.6)" />
            <stop offset="100%" stopColor="hsl(45 93% 60% / 0.4)" />
          </linearGradient>

          {/* Emboss effect */}
          <linearGradient id="embossTop" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.4)" />
            <stop offset="50%" stopColor="transparent" />
          </linearGradient>
        </defs>

        {/* Checker base (3D edge) */}
        <ellipse
          cx="50"
          cy="50"
          rx="42"
          ry="20"
          fill={isGold ? "hsl(35 70% 25%)" : "hsl(220 15% 5%)"}
        />

        {/* Main checker body */}
        <ellipse
          cx="50"
          cy="40"
          rx="42"
          ry="20"
          fill={isGold ? `url(#goldChecker-${variant})` : `url(#obsidianChecker-${variant})`}
          stroke={isGold ? "hsl(35 80% 35%)" : "url(#goldRim)"}
          strokeWidth={isGold ? "2" : "1.5"}
        />

        {/* Top highlight */}
        <ellipse
          cx="50"
          cy="40"
          rx="38"
          ry="16"
          fill="url(#embossTop)"
          opacity="0.6"
        />

        {/* Inner embossed ring */}
        <ellipse
          cx="50"
          cy="40"
          rx="30"
          ry="12"
          fill="none"
          stroke={isGold ? "hsl(35 70% 30% / 0.5)" : "hsl(45 93% 54% / 0.15)"}
          strokeWidth="1.5"
        />

        {/* Specular highlight */}
        <ellipse
          cx="38"
          cy="32"
          rx="12"
          ry="5"
          fill={isGold ? "hsl(45 93% 80% / 0.5)" : "hsl(220 10% 40% / 0.3)"}
        />

        {/* Count number if > 1 */}
        {count > 1 && (
          <text
            x="50"
            y="45"
            textAnchor="middle"
            fill={isGold ? "hsl(35 70% 20%)" : "hsl(45 93% 54%)"}
            fontSize="18"
            fontWeight="bold"
            fontFamily="sans-serif"
          >
            {count}
          </text>
        )}
      </svg>
    </button>
  );
};

// Stacked checkers for board display
export const CheckerStack = ({
  count,
  variant,
  isSelected = false,
  isValidTarget = false,
  onClick,
  isTop = true,
  size = "md",
}: {
  count: number;
  variant: "gold" | "obsidian";
  isSelected?: boolean;
  isValidTarget?: boolean;
  onClick?: () => void;
  isTop?: boolean;
  size?: "xs" | "sm" | "md" | "lg";
}) => {
  const displayCount = Math.min(count, 5);
  const marginClass = size === "xs" ? "-mt-2" : size === "lg" ? "-mt-4" : "-mt-3";
  const marginClassReverse = size === "xs" ? "-mb-2" : size === "lg" ? "-mb-4" : "-mb-3";

  return (
    <div
      className={cn(
        "flex items-center",
        isTop ? "flex-col" : "flex-col-reverse"
      )}
    >
      {Array.from({ length: displayCount }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "transition-all duration-200",
            i > 0 && (isTop ? marginClass : marginClassReverse)
          )}
        >
          <Checker3D
            variant={variant}
            size={size}
            count={i === displayCount - 1 && count > 5 ? count : undefined}
            isSelected={i === displayCount - 1 && isSelected}
            isValidTarget={i === displayCount - 1 && isValidTarget}
            onClick={i === displayCount - 1 ? onClick : undefined}
          />
        </div>
      ))}
    </div>
  );
};

export default Dice3D;
