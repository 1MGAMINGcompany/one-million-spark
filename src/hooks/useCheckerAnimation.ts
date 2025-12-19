import { useState, useCallback, useRef } from 'react';

export interface AnimatingChecker {
  id: string;
  variant: 'gold' | 'obsidian';
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  startTime: number;
  duration: number;
}

export interface PointPosition {
  x: number;
  y: number;
}

export function useCheckerAnimation(duration: number = 400) {
  const [animatingCheckers, setAnimatingCheckers] = useState<AnimatingChecker[]>([]);
  const animationCounter = useRef(0);

  const animateChecker = useCallback((
    variant: 'gold' | 'obsidian',
    startPos: PointPosition,
    endPos: PointPosition,
    onComplete?: () => void
  ) => {
    const id = `anim-${++animationCounter.current}`;
    
    const checker: AnimatingChecker = {
      id,
      variant,
      startX: startPos.x,
      startY: startPos.y,
      endX: endPos.x,
      endY: endPos.y,
      startTime: Date.now(),
      duration,
    };

    setAnimatingCheckers(prev => [...prev, checker]);

    // Remove after animation completes
    setTimeout(() => {
      setAnimatingCheckers(prev => prev.filter(c => c.id !== id));
      onComplete?.();
    }, duration);
  }, [duration]);

  const clearAnimations = useCallback(() => {
    setAnimatingCheckers([]);
  }, []);

  return {
    animatingCheckers,
    animateChecker,
    clearAnimations,
  };
}
