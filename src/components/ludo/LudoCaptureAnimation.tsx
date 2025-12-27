import { memo, useEffect, useState } from "react";
import { PlayerColor, HOME_BASE_COORDS, MAIN_TRACK_COORDS, getAbsolutePosition } from "./ludoTypes";

interface CaptureEvent {
  id: string;
  color: PlayerColor;
  tokenId: number;
  fromPosition: number; // Position on track where capture happened
  startTime: number;
}

interface LudoCaptureAnimationProps {
  captureEvent: CaptureEvent | null;
  cellSize: number;
  onAnimationComplete: () => void;
}

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

const LudoCaptureAnimation = memo(({ 
  captureEvent, 
  cellSize, 
  onAnimationComplete 
}: LudoCaptureAnimationProps) => {
  const [animationProgress, setAnimationProgress] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (!captureEvent || cellSize === 0) return;

    setIsAnimating(true);
    setAnimationProgress(0);

    const duration = 600; // Animation duration in ms
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing function for smooth arc animation
      const easeOutCubic = 1 - Math.pow(1 - progress, 3);
      setAnimationProgress(easeOutCubic);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setIsAnimating(false);
        onAnimationComplete();
      }
    };

    requestAnimationFrame(animate);
  }, [captureEvent, cellSize, onAnimationComplete]);

  if (!captureEvent || !isAnimating || cellSize === 0) return null;

  const { color, tokenId, fromPosition } = captureEvent;
  const colors = PLAYER_COLORS[color];

  // Calculate start position (where capture happened on the track)
  const absolutePos = getAbsolutePosition(fromPosition, color);
  const startCoords = MAIN_TRACK_COORDS[absolutePos];
  if (!startCoords) return null;

  // Calculate end position (home base)
  const homeCoords = HOME_BASE_COORDS[color][tokenId];
  if (!homeCoords) return null;

  const startX = (startCoords[1] + 0.5) * cellSize;
  const startY = (startCoords[0] + 0.5) * cellSize;
  const endX = (homeCoords[1] + 0.5) * cellSize;
  const endY = (homeCoords[0] + 0.5) * cellSize;

  // Calculate current position with arc
  const arcHeight = Math.abs(endX - startX) * 0.5 + 50; // Arc height based on distance
  const currentX = startX + (endX - startX) * animationProgress;
  const currentY = startY + (endY - startY) * animationProgress 
    - Math.sin(animationProgress * Math.PI) * arcHeight; // Parabolic arc

  const size = cellSize * 0.7;
  const scale = 1 + Math.sin(animationProgress * Math.PI) * 0.3; // Grow in middle of animation
  const rotation = animationProgress * 720; // Spin twice during flight

  return (
    <div className="absolute inset-0 pointer-events-none z-30">
      {/* Flying token */}
      <div
        className="absolute"
        style={{
          left: currentX - (size * scale) / 2,
          top: currentY - (size * scale) / 2,
          width: size * scale,
          height: size * scale,
          transform: `rotate(${rotation}deg)`,
          transition: 'none',
        }}
      >
        <div 
          className="w-full h-full flex items-center justify-center"
          style={{
            background: `linear-gradient(145deg, ${colors.light} 0%, ${colors.bg} 40%, ${colors.dark} 100%)`,
            boxShadow: `0 0 20px ${colors.glow}, 0 0 40px ${colors.glow}, 0 5px 15px rgba(0,0,0,0.5)`,
            clipPath: 'polygon(50% 5%, 85% 25%, 85% 85%, 50% 100%, 15% 85%, 15% 25%)',
            border: `1px solid ${colors.dark}`,
          }}
        >
          <svg viewBox="0 0 24 24" className="w-1/2 h-1/2" fill="rgba(0,0,0,0.2)">
            <path d="M12 2L8 6v2l-2 2v3l2 2v5h8v-5l2-2v-3l-2-2V6l-4-4z"/>
          </svg>
        </div>
      </div>

      {/* Trail effect */}
      {[0.1, 0.2, 0.3, 0.4].map((delay, i) => {
        const trailProgress = Math.max(0, animationProgress - delay);
        if (trailProgress <= 0) return null;
        
        const trailX = startX + (endX - startX) * trailProgress;
        const trailY = startY + (endY - startY) * trailProgress 
          - Math.sin(trailProgress * Math.PI) * arcHeight;
        const trailOpacity = (1 - delay * 2) * (1 - animationProgress);
        const trailSize = size * 0.5 * (1 - delay);

        return (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              left: trailX - trailSize / 2,
              top: trailY - trailSize / 2,
              width: trailSize,
              height: trailSize,
              background: colors.bg,
              opacity: trailOpacity,
              filter: 'blur(4px)',
            }}
          />
        );
      })}

      {/* Impact flash at start position */}
      {animationProgress < 0.3 && (
        <div
          className="absolute rounded-full"
          style={{
            left: startX - cellSize,
            top: startY - cellSize,
            width: cellSize * 2,
            height: cellSize * 2,
            background: `radial-gradient(circle, ${colors.glow} 0%, transparent 70%)`,
            opacity: 1 - animationProgress / 0.3,
            transform: `scale(${1 + animationProgress * 2})`,
          }}
        />
      )}

      {/* Landing poof at end */}
      {animationProgress > 0.8 && (
        <div
          className="absolute rounded-full"
          style={{
            left: endX - cellSize * 0.75,
            top: endY - cellSize * 0.75,
            width: cellSize * 1.5,
            height: cellSize * 1.5,
            background: `radial-gradient(circle, ${colors.glow} 0%, transparent 70%)`,
            opacity: (animationProgress - 0.8) / 0.2,
            transform: `scale(${1 + (animationProgress - 0.8) * 3})`,
          }}
        />
      )}
    </div>
  );
});

LudoCaptureAnimation.displayName = 'LudoCaptureAnimation';

export default LudoCaptureAnimation;
export type { CaptureEvent };
