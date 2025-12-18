import { useEffect } from 'react';
import { useSound } from '@/contexts/SoundContext';

export const useBackgroundMusic = (shouldPlay: boolean = true) => {
  const { playBackgroundMusic, stopBackgroundMusic } = useSound();

  useEffect(() => {
    if (shouldPlay) {
      playBackgroundMusic();
    } else {
      stopBackgroundMusic();
    }

    return () => {
      stopBackgroundMusic();
    };
  }, [shouldPlay, playBackgroundMusic, stopBackgroundMusic]);
};
