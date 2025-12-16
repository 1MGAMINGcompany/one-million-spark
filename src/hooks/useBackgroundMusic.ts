import { useEffect } from 'react';
import { useAudio } from '@/contexts/AudioContext';

export const useBackgroundMusic = (shouldPlay: boolean = true) => {
  const { playAmbient, stopAmbient, isMuted } = useAudio();

  useEffect(() => {
    if (!shouldPlay || isMuted) {
      stopAmbient();
      return;
    }

    // Play ambient sound
    playAmbient();

    // Cleanup when component unmounts or shouldPlay changes
    return () => {
      stopAmbient();
    };
  }, [shouldPlay, isMuted, playAmbient, stopAmbient]);
};
