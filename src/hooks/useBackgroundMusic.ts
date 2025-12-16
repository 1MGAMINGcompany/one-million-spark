import { useEffect } from 'react';
import { useSound } from '@/contexts/SoundContext';

export const useBackgroundMusic = (shouldPlay: boolean = true) => {
  const { playBackgroundMusic, stopBackgroundMusic, soundEnabled } = useSound();

  useEffect(() => {
    if (!shouldPlay || !soundEnabled) {
      stopBackgroundMusic();
      return;
    }

    playBackgroundMusic();

    return () => {
      stopBackgroundMusic();
    };
  }, [shouldPlay, soundEnabled, playBackgroundMusic, stopBackgroundMusic]);
};
