import { useEffect, useRef } from 'react';
import { useSound } from '@/contexts/SoundContext';

export const useBackgroundMusic = (shouldPlay: boolean = true) => {
  const { playBackgroundMusic, stopBackgroundMusic } = useSound();
  const shouldPlayRef = useRef(shouldPlay);
  
  // Keep ref in sync
  useEffect(() => {
    shouldPlayRef.current = shouldPlay;
  }, [shouldPlay]);

  useEffect(() => {
    if (shouldPlay) {
      playBackgroundMusic();
    } else {
      stopBackgroundMusic();
    }

    return () => {
      stopBackgroundMusic();
    };
  // Only depend on shouldPlay, not callbacks (they handle soundEnabled internally)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldPlay]);
};
