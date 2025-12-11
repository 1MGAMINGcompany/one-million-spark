// Unified game engine exports

// Core types and utilities
export type { PlayerId, GameResult, GameEngine } from './core/types';
export type { Difficulty, AiConfig, AiEngine } from './core/ai';
export { createAiEngine } from './core/ai';
export { chooseBestMove } from './core/minimax';

// Backgammon
export type { BackgammonState, BackgammonMove } from './backgammon/types';
export { backgammonEngine, getInitialBackgammonState, toLegacyMove } from './backgammon/engine';
export { chooseBackgammonMove } from './backgammon/ai';
