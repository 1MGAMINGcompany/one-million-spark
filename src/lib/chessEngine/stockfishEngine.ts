export type Difficulty = "easy" | "medium" | "hard";

export interface ChessAI {
  setDifficulty: (level: Difficulty) => void;
  getBestMove: (fen: string) => Promise<string>;
  terminate: () => void;
  isReady: () => boolean;
}

interface DifficultyConfig {
  skillLevel: number;
  depth: number;
  randomnessProbability: number; // 0-1, chance to pick from top N moves
}

const DIFFICULTY_CONFIG: Record<Difficulty, DifficultyConfig> = {
  easy: {
    skillLevel: 2,
    depth: 1,
    randomnessProbability: 0.2, // 20% chance to pick random from top moves
  },
  medium: {
    skillLevel: 8,
    depth: 3,
    randomnessProbability: 0.05, // 5% chance
  },
  hard: {
    skillLevel: 15,
    depth: 5,
    randomnessProbability: 0, // No randomness
  },
};

export function createChessAI(initialDifficulty: Difficulty): ChessAI {
  let worker: Worker | null = null;
  let difficulty = initialDifficulty;
  let ready = false;
  let pendingResolve: ((move: string) => void) | null = null;
  let multiPVMoves: string[] = [];
  let isMultiPVMode = false;
  let initPromise: Promise<void> | null = null;

  const initWorker = (): Promise<void> => {
    if (initPromise) return initPromise;
    
    initPromise = new Promise((resolve, reject) => {
      try {
        // Use the lite single-threaded version for browser compatibility
        // This is loaded directly from the stockfish package's CDN-like approach
        const workerUrl = 'https://unpkg.com/stockfish@17.1.1/src/stockfish-17.1-lite-single-03e3232.js';
        
        worker = new Worker(workerUrl);

        worker.onmessage = (e) => {
          const line = typeof e.data === 'string' ? e.data : e.data?.toString() || '';
          
          // console.log('Stockfish:', line); // Debug
          
          if (line === 'readyok') {
            ready = true;
            resolve();
          }

          // Collect MultiPV moves if in that mode
          if (isMultiPVMode && line.startsWith('info') && line.includes(' pv ')) {
            const match = line.match(/pv\s+(\S+)/);
            if (match) {
              multiPVMoves.push(match[1]);
            }
          }

          // Parse bestmove response
          if (line.startsWith('bestmove') && pendingResolve) {
            const match = line.match(/bestmove\s+(\S+)/);
            if (match) {
              const bestMove = match[1];
              const config = DIFFICULTY_CONFIG[difficulty];
              
              // Apply randomness for easier difficulties
              if (config.randomnessProbability > 0 && multiPVMoves.length > 1 && Math.random() < config.randomnessProbability) {
                // Pick randomly from collected PV moves
                const topMoves = multiPVMoves.slice(0, 3);
                const randomMove = topMoves[Math.floor(Math.random() * topMoves.length)];
                pendingResolve(randomMove);
              } else {
                pendingResolve(bestMove);
              }
              pendingResolve = null;
              multiPVMoves = [];
              isMultiPVMode = false;
            }
          }
        };

        worker.onerror = (error) => {
          console.error('Stockfish worker error:', error);
          ready = false;
          reject(error);
        };

        // Initialize UCI
        sendCommand('uci');
        sendCommand('isready');
        
        // Timeout fallback - if readyok never comes within 10 seconds, resolve anyway
        setTimeout(() => {
          if (!ready) {
            console.warn('Stockfish initialization timeout, assuming ready');
            ready = true;
            resolve();
          }
        }, 10000);
      } catch (err) {
        console.error('Failed to create Stockfish worker:', err);
        reject(err);
      }
    });
    
    return initPromise;
  };

  const sendCommand = (cmd: string) => {
    if (worker) {
      worker.postMessage(cmd);
    }
  };

  const applyDifficultySettings = () => {
    const config = DIFFICULTY_CONFIG[difficulty];
    sendCommand(`setoption name Skill Level value ${config.skillLevel}`);
    
    // For randomness, use MultiPV to get multiple candidate moves
    if (config.randomnessProbability > 0) {
      sendCommand('setoption name MultiPV value 3');
    } else {
      sendCommand('setoption name MultiPV value 1');
    }
  };

  // Start initialization immediately
  initWorker().catch(console.error);

  return {
    setDifficulty: (level: Difficulty) => {
      difficulty = level;
      if (ready) {
        applyDifficultySettings();
      }
    },

    getBestMove: async (fen: string): Promise<string> => {
      await initWorker();
      
      if (!worker) {
        throw new Error('Stockfish worker not available');
      }

      return new Promise((resolve, reject) => {
        pendingResolve = resolve;
        const config = DIFFICULTY_CONFIG[difficulty];
        
        // Track if we should collect MultiPV moves for randomness
        isMultiPVMode = config.randomnessProbability > 0;
        multiPVMoves = [];
        
        applyDifficultySettings();
        sendCommand('ucinewgame');
        sendCommand('isready');
        sendCommand(`position fen ${fen}`);
        sendCommand(`go depth ${config.depth}`);
        
        // Timeout fallback
        setTimeout(() => {
          if (pendingResolve) {
            console.warn('Stockfish move timeout');
            reject(new Error('Move timeout'));
            pendingResolve = null;
          }
        }, 30000); // 30 second timeout
      });
    },

    terminate: () => {
      if (worker) {
        sendCommand('quit');
        worker.terminate();
        worker = null;
        ready = false;
        initPromise = null;
      }
    },

    isReady: () => ready,
  };
}
