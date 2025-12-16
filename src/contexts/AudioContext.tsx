import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { AudioManager } from '@/lib/AudioManager';

interface AudioContextType {
  isMuted: boolean;
  toggleMute: () => void;
  playClick: () => void;
  playPieceMove: () => void;
  playDominoTap: () => void;
  playDiceRoll: () => void;
  playWinChime: () => void;
  playAmbient: () => void;
  stopAmbient: () => void;
  isAmbientPlaying: boolean;
}

const AudioContext = createContext<AudioContextType | undefined>(undefined);

export const AudioProvider = ({ children }: { children: ReactNode }) => {
  const [isMuted, setIsMuted] = useState(false);
  const [isAmbientPlaying, setIsAmbientPlaying] = useState(false);
  const [wantsAmbient, setWantsAmbient] = useState(false);

  const toggleMute = useCallback(() => {
    const newMuted = AudioManager.toggleMute();
    setIsMuted(newMuted);
    if (newMuted) {
      setIsAmbientPlaying(false);
      setWantsAmbient(false);
    }
  }, []);

  const playClick = useCallback(() => {
    AudioManager.playClick();
  }, []);

  const playPieceMove = useCallback(() => {
    AudioManager.playPieceMove();
  }, []);

  const playDominoTap = useCallback(() => {
    AudioManager.playDominoTap();
  }, []);

  const playDiceRoll = useCallback(() => {
    AudioManager.playDiceRoll();
  }, []);

  const playWinChime = useCallback(() => {
    AudioManager.playWinChime();
  }, []);

  const playAmbient = useCallback(() => {
    setWantsAmbient(true);
    AudioManager.playAmbient();
    setIsAmbientPlaying(AudioManager.isAmbientPlaying());
  }, []);

  const stopAmbient = useCallback(() => {
    setWantsAmbient(false);
    AudioManager.stopAmbient();
    setIsAmbientPlaying(false);
  }, []);

  // Retry playing ambient on user interaction if autoplay was blocked
  useEffect(() => {
    if (!wantsAmbient || isMuted) return;

    const tryPlay = () => {
      if (wantsAmbient && !AudioManager.isAmbientPlaying()) {
        AudioManager.playAmbient();
        setIsAmbientPlaying(AudioManager.isAmbientPlaying());
      }
    };

    document.addEventListener('click', tryPlay, { once: true });
    document.addEventListener('keydown', tryPlay, { once: true });
    document.addEventListener('touchstart', tryPlay, { once: true });

    return () => {
      document.removeEventListener('click', tryPlay);
      document.removeEventListener('keydown', tryPlay);
      document.removeEventListener('touchstart', tryPlay);
    };
  }, [wantsAmbient, isMuted]);

  return (
    <AudioContext.Provider
      value={{
        isMuted,
        toggleMute,
        playClick,
        playPieceMove,
        playDominoTap,
        playDiceRoll,
        playWinChime,
        playAmbient,
        stopAmbient,
        isAmbientPlaying,
      }}
    >
      {children}
    </AudioContext.Provider>
  );
};

export const useAudio = (): AudioContextType => {
  const context = useContext(AudioContext);
  if (!context) {
    throw new Error('useAudio must be used within an AudioProvider');
  }
  return context;
};
