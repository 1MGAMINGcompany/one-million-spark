import { useEffect, useRef } from 'react';

const MUSIC_PATH = '/sounds/ambient/lightwind.mp3';

export const useBackgroundMusic = (shouldPlay: boolean = true) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!shouldPlay) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      return;
    }

    // Create audio element if it doesn't exist
    if (!audioRef.current) {
      audioRef.current = new Audio(MUSIC_PATH);
      audioRef.current.loop = true;
      audioRef.current.volume = 0.15; // Soft background volume
    }

    const audio = audioRef.current;

    // Try to play (may be blocked by autoplay policy)
    const playMusic = () => {
      audio.play().catch(() => {
        // Autoplay blocked, will play on user interaction
      });
    };

    playMusic();

    // Also try on first user interaction
    const handleInteraction = () => {
      if (audio.paused) {
        playMusic();
      }
      document.removeEventListener('click', handleInteraction);
      document.removeEventListener('keydown', handleInteraction);
    };

    document.addEventListener('click', handleInteraction);
    document.addEventListener('keydown', handleInteraction);

    return () => {
      document.removeEventListener('click', handleInteraction);
      document.removeEventListener('keydown', handleInteraction);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    };
  }, [shouldPlay]);

  return audioRef.current;
};
