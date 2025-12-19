import React, { useEffect, useState, useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';

export interface AnimatingChecker {
  id: string;
  variant: 'gold' | 'obsidian';
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  startTime: number;
  duration: number;
}

interface BackgammonCheckerAnimationProps {
  animatingChecker: AnimatingChecker | null;
  onAnimationComplete?: () => void;
}

export function BackgammonCheckerAnimation({ 
  animatingChecker, 
  onAnimationComplete 
}: BackgammonCheckerAnimationProps) {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [opacity, setOpacity] = useState(0);
  const animationRef = useRef<number | null>(null);
  const completedRef = useRef(false);

  useEffect(() => {
    if (!animatingChecker) {
      setOpacity(0);
      return;
    }

    completedRef.current = false;
    setOpacity(1);
    setPosition({ x: animatingChecker.fromX, y: animatingChecker.fromY });

    const animate = () => {
      if (!animatingChecker || completedRef.current) return;

      const elapsed = Date.now() - animatingChecker.startTime;
      const progress = Math.min(elapsed / animatingChecker.duration, 1);

      // Ease-out cubic for smooth deceleration
      const eased = 1 - Math.pow(1 - progress, 3);

      const currentX = animatingChecker.fromX + (animatingChecker.toX - animatingChecker.fromX) * eased;
      const currentY = animatingChecker.fromY + (animatingChecker.toY - animatingChecker.fromY) * eased;

      setPosition({ x: currentX, y: currentY });

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        completedRef.current = true;
        setOpacity(0);
        onAnimationComplete?.();
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [animatingChecker, onAnimationComplete]);

  if (!animatingChecker || opacity === 0) return null;

  return (
    <div
      className="fixed pointer-events-none z-[100]"
      style={{
        left: position.x,
        top: position.y,
        transform: 'translate(-50%, -50%)',
        opacity,
      }}
    >
      <div
        className={cn(
          "w-10 h-10 rounded-full shadow-2xl border-2 transition-shadow",
          animatingChecker.variant === 'gold'
            ? "bg-gradient-to-br from-yellow-300 via-yellow-400 to-amber-600 border-yellow-200"
            : "bg-gradient-to-br from-slate-500 via-slate-700 to-slate-900 border-slate-400"
        )}
        style={{
          boxShadow: animatingChecker.variant === 'gold'
            ? '0 8px 32px rgba(234, 179, 8, 0.6), 0 4px 16px rgba(0,0,0,0.3), inset 0 2px 4px rgba(255,255,255,0.4)'
            : '0 8px 32px rgba(0, 0, 0, 0.6), 0 4px 16px rgba(0,0,0,0.3), inset 0 2px 4px rgba(255,255,255,0.2)',
        }}
      />
    </div>
  );
}

// Hook to manage checker animations
export function useCheckerAnimation(duration: number = 500) {
  const [animatingChecker, setAnimatingChecker] = useState<AnimatingChecker | null>(null);
  const idCounter = useRef(0);
  const resolveRef = useRef<(() => void) | null>(null);

  const animateMove = useCallback((
    variant: 'gold' | 'obsidian',
    fromElement: HTMLElement | null,
    toElement: HTMLElement | null
  ): Promise<void> => {
    return new Promise((resolve) => {
      if (!fromElement || !toElement) {
        resolve();
        return;
      }

      const fromRect = fromElement.getBoundingClientRect();
      const toRect = toElement.getBoundingClientRect();

      const checker: AnimatingChecker = {
        id: `checker-anim-${++idCounter.current}`,
        variant,
        fromX: fromRect.left + fromRect.width / 2,
        fromY: fromRect.top + fromRect.height / 2,
        toX: toRect.left + toRect.width / 2,
        toY: toRect.top + toRect.height / 2,
        startTime: Date.now(),
        duration,
      };

      resolveRef.current = resolve;
      setAnimatingChecker(checker);
    });
  }, [duration]);

  const onAnimationComplete = useCallback(() => {
    setAnimatingChecker(null);
    resolveRef.current?.();
    resolveRef.current = null;
  }, []);

  return {
    animatingChecker,
    animateMove,
    onAnimationComplete,
  };
}

export default BackgammonCheckerAnimation;
