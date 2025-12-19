import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import type { AnimatingChecker } from '@/hooks/useCheckerAnimation';

interface CheckerAnimationLayerProps {
  animatingCheckers: AnimatingChecker[];
  className?: string;
}

function AnimatedChecker({ checker }: { checker: AnimatingChecker }) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const startTime = checker.startTime;
    const duration = checker.duration;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const newProgress = Math.min(elapsed / duration, 1);
      setProgress(newProgress);

      if (newProgress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [checker]);

  // Easing function for smooth movement (ease-out cubic)
  const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
  const easedProgress = easeOutCubic(progress);

  // Calculate current position
  const currentX = checker.startX + (checker.endX - checker.startX) * easedProgress;
  const currentY = checker.startY + (checker.endY - checker.startY) * easedProgress;

  // Add a slight arc to the movement (parabolic lift)
  const arcHeight = -30; // pixels to lift at midpoint
  const arcOffset = Math.sin(easedProgress * Math.PI) * arcHeight;

  return (
    <div
      className="absolute pointer-events-none z-50"
      style={{
        left: currentX,
        top: currentY + arcOffset,
        transform: 'translate(-50%, -50%)',
        transition: 'none',
      }}
    >
      <div
        className={cn(
          "w-10 h-10 rounded-full shadow-xl border-2",
          checker.variant === 'gold'
            ? "bg-gradient-to-br from-yellow-400 via-yellow-500 to-amber-600 border-yellow-300"
            : "bg-gradient-to-br from-slate-600 via-slate-700 to-slate-900 border-slate-500",
          // Add glow effect during animation
          "shadow-[0_4px_20px_rgba(0,0,0,0.4)]"
        )}
        style={{
          boxShadow: checker.variant === 'gold'
            ? '0 4px 20px rgba(234, 179, 8, 0.5), 0 2px 8px rgba(0,0,0,0.3)'
            : '0 4px 20px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0,0,0,0.3)',
        }}
      />
    </div>
  );
}

export function CheckerAnimationLayer({ animatingCheckers, className }: CheckerAnimationLayerProps) {
  if (animatingCheckers.length === 0) return null;

  return (
    <div className={cn("absolute inset-0 pointer-events-none overflow-visible", className)}>
      {animatingCheckers.map(checker => (
        <AnimatedChecker key={checker.id} checker={checker} />
      ))}
    </div>
  );
}

export default CheckerAnimationLayer;
