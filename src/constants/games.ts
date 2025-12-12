export const GAMES = {
  CHESS: 1,
  DOMINOS: 2,
  BACKGAMMON: 3,
} as const;

export type GameId = (typeof GAMES)[keyof typeof GAMES];
