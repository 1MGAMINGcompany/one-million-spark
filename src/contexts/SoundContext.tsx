import { createContext, useContext, useState, useCallback, useRef, useEffect, ReactNode } from 'react';

// Sound name mapping to file paths
const SOUND_FILES: Record<string, string> = {
  // UI sounds
  'ui_click': '/sounds/ui/click.wav',
  'ui_menu': '/sounds/ui/menu-open.mp3',
  'ui_notify': '/sounds/ui/notify.mp3',
  'ui_woosh': '/sounds/ui/woosh.mp3',
  'ui_litewoosh': '/sounds/ui/litewoosh.mp3',
  
  // System sounds
  'system_error': '/sounds/system/error.mp3',
  'system_toggle_on': '/sounds/system/toggle-on.mp3',
  'system_toggle_off': '/sounds/system/toggle-off.mp3',
  
  // Chess sounds
  'chess_move': '/sounds/chess/move.mp3',
  'chess_capture': '/sounds/chess/capture.mp3',
  'chess_check': '/sounds/chess/check.mp3',
  'chess_promotion': '/sounds/chess/promotion.mp3',
  'chess_win': '/sounds/chess/win.wav',
  'chess_lose': '/sounds/chess/lose.mp3',
  
  // Domino sounds
  'domino_place': '/sounds/checkers/slide.mp3',
  'domino_draw': '/sounds/domino/draw.mp3',
  'domino_shuffle': '/sounds/domino/shuffle.mp3',
  'domino_win': '/sounds/domino/win.mp3',
  'domino_lose': '/sounds/domino/lose.mp3',
  
  // Backgammon sounds
  'backgammon_dice': '/sounds/backgammon/dice.mp3',
  'backgammon_move': '/sounds/backgammon/move.m4a',
  'backgammon_bearoff': '/sounds/backgammon/bearoff.mp3',
  
  // Ludo sounds
  'ludo_dice': '/sounds/ludo/dice.mp3',
  'ludo_move': '/sounds/chess/move.mp3',
  'ludo_capture': '/sounds/chess/capture.mp3',
  'ludo_win': '/sounds/chess/win.wav',
  'ludo_lose': '/sounds/chess/lose.mp3',
  
  // Checkers sounds
  'checkers_slide': '/sounds/checkers/slide.mp3',
  'checkers_capture': '/sounds/checkers/capture.mp3',
  'checkers_win': '/sounds/checkers/win.wav',
  'checkers_lose': '/sounds/checkers/lose.mp3',
  
  // Room sounds
  'room_create': '/sounds/rooms/created.mp3',
  'room_enter': '/sounds/rooms/enter.mp3',
  'room_join': '/sounds/rooms/player-join.mp3',
  'room_match_start': '/sounds/rooms/match-start.mp3',
};

interface SoundContextType {
  play: (name: string) => void;
  toggleSound: () => void;
  soundEnabled: boolean;
}

const SoundContext = createContext<SoundContextType | undefined>(undefined);

// Expose for debugging
declare global {
  interface Window {
    playSound: (name: string) => void;
  }
}

export const SoundProvider = ({ children }: { children: ReactNode }) => {
  const [soundEnabled, setSoundEnabled] = useState(() => {
    const saved = localStorage.getItem('soundEnabled');
    return saved !== null ? saved === 'true' : true;
  });
  
  const soundsRef = useRef<Record<string, HTMLAudioElement>>({});
  const initializedRef = useRef(false);
  
  // Preload all sounds after first user interaction
  const initializeSounds = useCallback(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    
    Object.entries(SOUND_FILES).forEach(([name, path]) => {
      try {
        const audio = new Audio(path);
        audio.preload = 'auto';
        // Low latency settings
        audio.volume = 1;
        soundsRef.current[name] = audio;
      } catch (e) {
        console.warn(`Failed to load sound: ${name}`, e);
      }
    });
  }, []);
  
  // Initialize sounds on first interaction
  useEffect(() => {
    const handleInteraction = () => {
      initializeSounds();
      // Remove listeners after first interaction
      document.removeEventListener('click', handleInteraction);
      document.removeEventListener('touchstart', handleInteraction);
      document.removeEventListener('keydown', handleInteraction);
    };
    
    document.addEventListener('click', handleInteraction);
    document.addEventListener('touchstart', handleInteraction);
    document.addEventListener('keydown', handleInteraction);
    
    return () => {
      document.removeEventListener('click', handleInteraction);
      document.removeEventListener('touchstart', handleInteraction);
      document.removeEventListener('keydown', handleInteraction);
    };
  }, [initializeSounds]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      Object.values(soundsRef.current).forEach(audio => {
        audio.pause();
        audio.src = '';
      });
      soundsRef.current = {};
    };
  }, []);
  
  const play = useCallback((name: string) => {
    if (!soundEnabled) return;
    
    // Initialize if not done yet
    if (!initializedRef.current) {
      initializeSounds();
    }
    
    const audio = soundsRef.current[name];
    if (!audio) {
      console.warn(`Sound not found: ${name}`);
      return;
    }
    
    // Reset and play
    audio.currentTime = 0;
    audio.play().catch((e) => {
      // Silently catch iOS/autoplay errors
      console.debug('Audio play failed:', e.message);
    });
  }, [soundEnabled, initializeSounds]);
  
  const toggleSound = useCallback(() => {
    setSoundEnabled(prev => {
      const newValue = !prev;
      localStorage.setItem('soundEnabled', String(newValue));
      return newValue;
    });
  }, []);
  
  // Expose to window for debugging
  useEffect(() => {
    window.playSound = play;
    return () => {
      delete (window as any).playSound;
    };
  }, [play]);
  
  return (
    <SoundContext.Provider value={{ play, toggleSound, soundEnabled }}>
      {children}
    </SoundContext.Provider>
  );
};

export const useSound = (): SoundContextType => {
  const context = useContext(SoundContext);
  if (!context) {
    throw new Error('useSound must be used within a SoundProvider');
  }
  return context;
};
