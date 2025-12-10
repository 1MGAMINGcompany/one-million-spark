import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
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

  const toggleMute = useCallback(() => {
    const newMuted = AudioManager.toggleMute();
    setIsMuted(newMuted);
    if (newMuted) {
      setIsAmbientPlaying(false);
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
    AudioManager.playAmbient();
    setIsAmbientPlaying(true);
  }, []);

  const stopAmbient = useCallback(() => {
    AudioManager.stopAmbient();
    setIsAmbientPlaying(false);
  }, []);

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
