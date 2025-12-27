/**
 * Rematch payload and link generation utilities
 */

export type RematchMode = 'same' | 'double' | 'custom';

export interface RematchPayload {
  originRoomId: string;      // Original room PDA
  gameType: string;          // Game type (chess, checkers, backgammon, ludo, dominos)
  maxPlayers: number;        // Number of players (typically 2)
  stakeLamports: number;     // Stake amount in lamports
  mode: RematchMode;         // same, double, or custom
}

/**
 * Calculate stake based on mode and original stake
 */
export function calculateRematchStake(
  originalStakeLamports: number,
  mode: RematchMode,
  customStakeLamports?: number
): number {
  switch (mode) {
    case 'same':
      return originalStakeLamports;
    case 'double':
      return originalStakeLamports * 2;
    case 'custom':
      return customStakeLamports ?? originalStakeLamports;
    default:
      return originalStakeLamports;
  }
}

/**
 * Generate a rematch share link
 */
export function generateRematchLink(payload: RematchPayload): string {
  const baseUrl = window.location.origin;
  const params = new URLSearchParams({
    rematch: '1',
    origin: payload.originRoomId,
    stake: payload.stakeLamports.toString(),
    mode: payload.mode,
    game: payload.gameType,
    players: payload.maxPlayers.toString(),
  });
  
  return `${baseUrl}/create-room?${params.toString()}`;
}

/**
 * Parse rematch parameters from URL
 */
export function parseRematchParams(searchParams: URLSearchParams): RematchPayload | null {
  const isRematch = searchParams.get('rematch') === '1';
  if (!isRematch) return null;
  
  const origin = searchParams.get('origin');
  const stake = searchParams.get('stake');
  const mode = searchParams.get('mode') as RematchMode | null;
  const game = searchParams.get('game');
  const players = searchParams.get('players');
  
  if (!origin || !stake || !mode || !game) return null;
  
  return {
    originRoomId: origin,
    gameType: game,
    maxPlayers: players ? parseInt(players, 10) : 2,
    stakeLamports: parseInt(stake, 10),
    mode,
  };
}

/**
 * Format lamports to SOL for display
 */
export function lamportsToSol(lamports: number): number {
  return lamports / 1_000_000_000;
}

/**
 * Format SOL to lamports
 */
export function solToLamports(sol: number): number {
  return Math.floor(sol * 1_000_000_000);
}
