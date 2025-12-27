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
  'domino_place': '/sounds/domino/place.mp3',
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
  'ludo_move': '/sounds/backgammon/move.m4a', // Use backgammon move sound (more board-game like)
  'ludo_capture': '/sounds/checkers/capture.mp3',
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
  playBackgroundMusic: () => void;
  stopBackgroundMusic: () => void;
  isBackgroundMusicPlaying: boolean;
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
  const backgroundMusicRef = useRef<HTMLAudioElement | null>(null);
  const [isBackgroundMusicPlaying, setIsBackgroundMusicPlaying] = useState(false);
  const wantsBackgroundMusicRef = useRef(false);
  const initializedRef = useRef(false);
  
  // Initialize background music immediately (but won't play until interaction)
  useEffect(() => {
    if (!backgroundMusicRef.current) {
      backgroundMusicRef.current = new Audio('/sounds/ambient/lightwind.mp3');
      backgroundMusicRef.current.loop = true;
      backgroundMusicRef.current.volume = 0.35;
    }
  }, []);
  
  // Preload all sounds after first user interaction
  const initializeSounds = useCallback(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    
    Object.entries(SOUND_FILES).forEach(([name, path]) => {
      try {
        const audio = new Audio(path);
        audio.preload = 'auto';
        audio.volume = 1;
        soundsRef.current[name] = audio;
      } catch (e) {
        console.warn(`Failed to load sound: ${name}`, e);
      }
    });
  }, []);
  
  // Try to play background music on ANY user interaction (only until first successful play)
  useEffect(() => {
    let hasInitialized = false;
    
    const tryPlayBackgroundMusic = () => {
      if (wantsBackgroundMusicRef.current && soundEnabled && backgroundMusicRef.current) {
        backgroundMusicRef.current.play().then(() => {
          setIsBackgroundMusicPlaying(true);
          hasInitialized = true;
          console.log('Background music started');
          // Remove listeners once we've successfully started - no need to keep retrying
          removeListeners();
        }).catch((e) => {
          console.log('Background music blocked, waiting for interaction:', e.message);
        });
      }
    };
    
    const handleInteraction = () => {
      initializeSounds();
      // Only try to play if we haven't successfully initialized yet
      if (!hasInitialized) {
        tryPlayBackgroundMusic();
      }
    };
    
    const removeListeners = () => {
      document.removeEventListener('click', handleInteraction);
      document.removeEventListener('touchstart', handleInteraction);
      document.removeEventListener('keydown', handleInteraction);
    };
    
    // Add multiple listeners and keep them active until first success
    document.addEventListener('click', handleInteraction);
    document.addEventListener('touchstart', handleInteraction);
    document.addEventListener('keydown', handleInteraction);
    
    // Also try immediately in case we already have permission
    tryPlayBackgroundMusic();
    
    return removeListeners;
  }, [initializeSounds, soundEnabled]);
  
  // Stop/start background music when sound toggle changes - this is the primary control
  useEffect(() => {
    if (!backgroundMusicRef.current) return;
    
    if (!soundEnabled) {
      // Immediately stop when disabled
      backgroundMusicRef.current.pause();
      backgroundMusicRef.current.currentTime = 0;
      setIsBackgroundMusicPlaying(false);
    } else if (wantsBackgroundMusicRef.current) {
      // Resume if we want music and sound is enabled
      backgroundMusicRef.current.play().then(() => {
        setIsBackgroundMusicPlaying(true);
      }).catch(() => {});
    }
  }, [soundEnabled]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      Object.values(soundsRef.current).forEach(audio => {
        audio.pause();
        audio.src = '';
      });
      soundsRef.current = {};
      if (backgroundMusicRef.current) {
        backgroundMusicRef.current.pause();
        backgroundMusicRef.current = null;
      }
    };
  }, []);
  
  const play = useCallback((name: string) => {
    if (!soundEnabled) {
      console.log(`[SOUND] Sound disabled, skipping: ${name}`);
      return;
    }
    
    // Initialize if not done yet
    if (!initializedRef.current) {
      initializeSounds();
    }
    
    const audio = soundsRef.current[name];
    if (!audio) {
      // Try to create the audio on-demand if not preloaded
      const path = SOUND_FILES[name];
      if (path) {
        console.log(`[SOUND] Creating audio on-demand: ${name}`);
        const newAudio = new Audio(path);
        newAudio.volume = 1;
        soundsRef.current[name] = newAudio;
        newAudio.play().catch((e) => {
          console.debug('[SOUND] Audio play failed:', e.message);
        });
        return;
      }
      console.warn(`[SOUND] Sound not found: ${name}`);
      return;
    }
    
    // Reset and play
    audio.currentTime = 0;
    audio.play().catch((e) => {
      // Silently catch iOS/autoplay errors
      console.debug('[SOUND] Audio play failed:', e.message);
    });
  }, [soundEnabled, initializeSounds]);
  
  const playBackgroundMusic = useCallback(() => {
    // Only set wants flag if sound is enabled
    if (!soundEnabled) return;
    
    wantsBackgroundMusicRef.current = true;
    
    // Initialize if not done yet
    if (!initializedRef.current) {
      initializeSounds();
    }
    
    if (backgroundMusicRef.current && backgroundMusicRef.current.paused) {
      backgroundMusicRef.current.play().then(() => {
        setIsBackgroundMusicPlaying(true);
      }).catch(() => {
        // Will retry on user interaction
      });
    }
  }, [soundEnabled, initializeSounds]);
  
  const stopBackgroundMusic = useCallback(() => {
    wantsBackgroundMusicRef.current = false;
    if (backgroundMusicRef.current) {
      backgroundMusicRef.current.pause();
      backgroundMusicRef.current.currentTime = 0;
    }
    setIsBackgroundMusicPlaying(false);
  }, []);
  
  const toggleSound = useCallback(() => {
    setSoundEnabled(prev => {
      const newValue = !prev;
      localStorage.setItem('soundEnabled', String(newValue));
      
      // Immediately stop background music when disabling
      if (!newValue && backgroundMusicRef.current) {
        backgroundMusicRef.current.pause();
        backgroundMusicRef.current.currentTime = 0;
        wantsBackgroundMusicRef.current = false;
        setIsBackgroundMusicPlaying(false);
      }
      
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
    <SoundContext.Provider value={{ 
      play, 
      toggleSound, 
      soundEnabled, 
      playBackgroundMusic, 
      stopBackgroundMusic,
      isBackgroundMusicPlaying 
    }}>
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
