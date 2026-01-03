/**
 * Step-by-step animation hook for Ludo token movement
 * 
 * Animates tokens through each intermediate cell instead of teleporting.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Move } from '@/lib/ludo/types';

export interface StepAnimation {
  playerIndex: number;
  tokenIndex: number;
  steps: number[]; // Array of positions to animate through
  currentStepIndex: number;
  isAnimating: boolean;
}

interface UseStepAnimationOptions {
  stepDuration?: number; // ms per step
  onComplete?: () => void;
}

export function useLudoStepAnimation(options: UseStepAnimationOptions = {}) {
  const { stepDuration = 150, onComplete } = options;
  
  const [animation, setAnimation] = useState<StepAnimation | null>(null);
  const animationRef = useRef<NodeJS.Timeout | null>(null);
  
  // Generate intermediate positions for a move
  const generateSteps = useCallback((move: Move): number[] => {
    const { fromPosition, toPosition, fromState, toState } = move;
    const steps: number[] = [];
    
    // Handle BASE to TRACK (entering the board)
    if (fromState === 'BASE' && toState === 'TRACK' && toPosition !== null) {
      steps.push(-1); // Start at base
      steps.push(toPosition); // Land on start position
      return steps;
    }
    
    // Handle TRACK movement
    if (fromState === 'TRACK' && toState === 'TRACK' && fromPosition !== null && toPosition !== null) {
      const TRACK_SIZE = 56;
      let pos = fromPosition;
      steps.push(pos);
      
      // Move forward on track (wrapping around)
      while (pos !== toPosition) {
        pos = (pos + 1) % TRACK_SIZE;
        steps.push(pos);
      }
      return steps;
    }
    
    // Handle TRACK to HOME_PATH transition
    if (fromState === 'TRACK' && toState === 'HOME_PATH' && fromPosition !== null && toPosition !== null) {
      const steps: number[] = [];
      
      // First, add track positions up to home entry
      // Home entry positions: gold=55, ruby=13, sapphire=27, emerald=41
      steps.push(fromPosition);
      
      // Then add home path positions (56+)
      for (let i = 0; i <= toPosition; i++) {
        steps.push(56 + i);
      }
      return steps;
    }
    
    // Handle HOME_PATH movement
    if (fromState === 'HOME_PATH' && toState === 'HOME_PATH' && fromPosition !== null && toPosition !== null) {
      for (let i = fromPosition; i <= toPosition; i++) {
        steps.push(56 + i);
      }
      return steps;
    }
    
    // Handle finishing (HOME_PATH to FINISHED)
    if (toState === 'FINISHED' && fromPosition !== null) {
      if (fromState === 'HOME_PATH') {
        steps.push(56 + fromPosition);
      } else if (fromState === 'TRACK') {
        steps.push(fromPosition);
      }
      steps.push(62); // Finished position
      return steps;
    }
    
    // Fallback: just show from and to
    if (fromPosition !== null) {
      if (fromState === 'BASE') steps.push(-1);
      else if (fromState === 'HOME_PATH') steps.push(56 + fromPosition);
      else steps.push(fromPosition);
    }
    
    if (toPosition !== null) {
      if (toState === 'FINISHED') steps.push(62);
      else if (toState === 'HOME_PATH') steps.push(56 + toPosition);
      else steps.push(toPosition);
    }
    
    return steps;
  }, []);
  
  // Start step animation for a move
  const startAnimation = useCallback((playerIndex: number, tokenIndex: number, move: Move) => {
    // Clear any existing animation
    if (animationRef.current) {
      clearTimeout(animationRef.current);
    }
    
    const steps = generateSteps(move);
    
    if (steps.length <= 1) {
      // No animation needed
      onComplete?.();
      return;
    }
    
    setAnimation({
      playerIndex,
      tokenIndex,
      steps,
      currentStepIndex: 0,
      isAnimating: true,
    });
  }, [generateSteps, onComplete]);
  
  // Advance to next step
  useEffect(() => {
    if (!animation?.isAnimating) return;
    
    const { steps, currentStepIndex } = animation;
    
    if (currentStepIndex >= steps.length - 1) {
      // Animation complete
      setAnimation(prev => prev ? { ...prev, isAnimating: false } : null);
      onComplete?.();
      return;
    }
    
    // Schedule next step
    animationRef.current = setTimeout(() => {
      setAnimation(prev => {
        if (!prev) return null;
        return {
          ...prev,
          currentStepIndex: prev.currentStepIndex + 1,
        };
      });
    }, stepDuration);
    
    return () => {
      if (animationRef.current) {
        clearTimeout(animationRef.current);
      }
    };
  }, [animation, stepDuration, onComplete]);
  
  // Get current animated position for a token
  const getAnimatedPosition = useCallback((playerIndex: number, tokenIndex: number, originalPosition: number): number => {
    if (!animation?.isAnimating) return originalPosition;
    if (animation.playerIndex !== playerIndex || animation.tokenIndex !== tokenIndex) {
      return originalPosition;
    }
    
    return animation.steps[animation.currentStepIndex];
  }, [animation]);
  
  // Clear animation
  const clearAnimation = useCallback(() => {
    if (animationRef.current) {
      clearTimeout(animationRef.current);
    }
    setAnimation(null);
  }, []);
  
  return {
    animation,
    startAnimation,
    getAnimatedPosition,
    clearAnimation,
    isAnimating: animation?.isAnimating ?? false,
  };
}
