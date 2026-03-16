/**
 * chessSkins.ts — Central registry for chess piece skins.
 * Each skin defines unique lathe profiles, PBR materials, and board colors.
 */

export interface MaterialConfig {
  color: string;
  roughness: number;
  metalness: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  emissive?: string;
  emissiveIntensity?: number;
}

export interface ChessSkin {
  id: string;
  name: string;
  description: string;
  preview: string; // emoji
  unlockGames: number;
  unlockShares: number;
  /** Lathe profiles per piece type: array of [radius, height] control points */
  profiles: Record<string, [number, number][]>;
  /** Optional path to a GLB model file (overrides lathe profiles when available) */
  glbPath?: string;
  whiteMat: MaterialConfig;
  blackMat: MaterialConfig;
  boardLight: string;
  boardDark: string;
  boardTrim: string;
  boardBase?: string;
}

// ─── Profiles ─────────────────────────────────────────────────────────────────
// Extracted into a dedicated file-section to keep the registry compact.

import {
  CLASSIC_PROFILES,
  SAMURAI_PROFILES,
  ROMAN_PROFILES,
  CYBERPUNK_PROFILES,
  CARTOON_PROFILES,
  VIKING_PROFILES,
  GOLDEN_EMPIRE_PROFILES,
  SHADOW_KING_PROFILES,
} from "./chessSkinProfiles";

// ─── Skin Registry ────────────────────────────────────────────────────────────

export const CHESS_SKINS: ChessSkin[] = [
  {
    id: "classic",
    name: "Classic",
    description: "Timeless marble and obsidian. The original.",
    preview: "♔",
    unlockGames: 0,
    unlockShares: 0,
    profiles: CLASSIC_PROFILES,
    whiteMat: { color: "#f5ead8", roughness: 0.15, metalness: 0.02, clearcoat: 1.0, clearcoatRoughness: 0.08 },
    blackMat: { color: "#141418", roughness: 0.12, metalness: 0.6, clearcoat: 0.9, clearcoatRoughness: 0.05 },
    boardLight: "hsl(38, 45%, 75%)",
    boardDark: "hsl(25, 35%, 32%)",
    boardTrim: "hsl(42, 75%, 50%)",
  },
  {
    id: "samurai",
    name: "Samurai",
    description: "Elegant Japanese lacquer and ivory bone.",
    preview: "⚔️",
    unlockGames: 0,
    unlockShares: 0,
    profiles: SAMURAI_PROFILES,
    whiteMat: { color: "#f0e4c8", roughness: 0.25, metalness: 0.05, clearcoat: 0.6, clearcoatRoughness: 0.15 },
    blackMat: { color: "#1a0a0a", roughness: 0.10, metalness: 0.3, clearcoat: 1.0, clearcoatRoughness: 0.03 },
    boardLight: "hsl(25, 30%, 55%)",
    boardDark: "hsl(15, 40%, 18%)",
    boardTrim: "hsl(0, 60%, 40%)",
    boardBase: "#0d0808",
  },
  {
    id: "roman",
    name: "Roman Army",
    description: "Bronze and iron forged in the empire.",
    preview: "🏛️",
    unlockGames: 10,
    unlockShares: 0,
    profiles: ROMAN_PROFILES,
    whiteMat: { color: "#c8a050", roughness: 0.20, metalness: 0.85, clearcoat: 0.4, clearcoatRoughness: 0.2 },
    blackMat: { color: "#2a2a30", roughness: 0.25, metalness: 0.7, clearcoat: 0.3, clearcoatRoughness: 0.3 },
    boardLight: "hsl(35, 40%, 65%)",
    boardDark: "hsl(30, 15%, 25%)",
    boardTrim: "hsl(35, 70%, 45%)",
    boardBase: "#1a1510",
  },
  {
    id: "cyberpunk",
    name: "Cyberpunk",
    description: "Neon-lit circuits. Hack the board.",
    preview: "🤖",
    unlockGames: 25,
    unlockShares: 1,
    profiles: CYBERPUNK_PROFILES,
    whiteMat: { color: "#0a2040", roughness: 0.10, metalness: 0.8, emissive: "#00ffff", emissiveIntensity: 0.4 },
    blackMat: { color: "#1a0a2a", roughness: 0.10, metalness: 0.8, emissive: "#ff00ff", emissiveIntensity: 0.35 },
    boardLight: "hsl(220, 15%, 25%)",
    boardDark: "hsl(230, 20%, 12%)",
    boardTrim: "hsl(190, 100%, 50%)",
    boardBase: "#050510",
  },
  {
    id: "cartoon",
    name: "Cartoon",
    description: "Bold, bouncy, and full of personality!",
    preview: "🎨",
    unlockGames: 50,
    unlockShares: 3,
    profiles: CARTOON_PROFILES,
    whiteMat: { color: "#ffb347", roughness: 0.6, metalness: 0.0 },
    blackMat: { color: "#7b68ee", roughness: 0.6, metalness: 0.0 },
    boardLight: "hsl(140, 40%, 75%)",
    boardDark: "hsl(140, 30%, 50%)",
    boardTrim: "hsl(0, 80%, 60%)",
    boardBase: "#2a3a2a",
  },
  {
    id: "viking",
    name: "Viking",
    description: "Forged in Nordic frost and iron.",
    preview: "🪓",
    unlockGames: 100,
    unlockShares: 0,
    profiles: VIKING_PROFILES,
    whiteMat: { color: "#c8dde8", roughness: 0.18, metalness: 0.7, clearcoat: 0.5, clearcoatRoughness: 0.15 },
    blackMat: { color: "#1e2428", roughness: 0.22, metalness: 0.75, clearcoat: 0.3, clearcoatRoughness: 0.2 },
    boardLight: "hsl(210, 10%, 50%)",
    boardDark: "hsl(210, 12%, 22%)",
    boardTrim: "hsl(200, 60%, 55%)",
    boardBase: "#0e1214",
  },
  {
    id: "golden-empire",
    name: "Golden Empire",
    description: "Pure gold and obsidian. Only the elite.",
    preview: "👑",
    unlockGames: 200,
    unlockShares: 0,
    profiles: GOLDEN_EMPIRE_PROFILES,
    whiteMat: { color: "#ffd700", roughness: 0.08, metalness: 0.95, clearcoat: 1.0, clearcoatRoughness: 0.03, emissive: "#221100", emissiveIntensity: 0.15 },
    blackMat: { color: "#0a0a0e", roughness: 0.06, metalness: 0.9, clearcoat: 1.0, clearcoatRoughness: 0.02 },
    boardLight: "hsl(45, 30%, 18%)",
    boardDark: "hsl(0, 0%, 6%)",
    boardTrim: "hsl(45, 90%, 50%)",
    boardBase: "#050505",
  },
  {
    id: "shadow-king",
    name: "Shadow King",
    description: "Born from the void. 500 games to unlock.",
    preview: "💀",
    unlockGames: 500,
    unlockShares: 0,
    profiles: SHADOW_KING_PROFILES,
    whiteMat: { color: "#b0b8c8", roughness: 0.14, metalness: 0.6, emissive: "#8844cc", emissiveIntensity: 0.2 },
    blackMat: { color: "#0d0518", roughness: 0.10, metalness: 0.7, emissive: "#6622aa", emissiveIntensity: 0.3 },
    boardLight: "hsl(270, 8%, 18%)",
    boardDark: "hsl(270, 12%, 8%)",
    boardTrim: "hsl(275, 70%, 45%)",
    boardBase: "#06020e",
  },
];

export function getSkinById(id: string): ChessSkin {
  return CHESS_SKINS.find(s => s.id === id) ?? CHESS_SKINS[0];
}
