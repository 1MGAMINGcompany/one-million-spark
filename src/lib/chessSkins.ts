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
  whiteMat: MaterialConfig;
  blackMat: MaterialConfig;
  boardLight: string;
  boardDark: string;
  boardTrim: string;
  boardBase?: string;
}

// ─── Classic ──────────────────────────────────────────────────────────────────

const CLASSIC_PROFILES: Record<string, [number, number][]> = {
  pawn: [
    [0, 0], [0.12, 0], [0.13, 0.02], [0.1, 0.04],
    [0.06, 0.12], [0.05, 0.18], [0.07, 0.22], [0.06, 0.28], [0, 0.3],
  ],
  rook: [
    [0, 0], [0.14, 0], [0.15, 0.02], [0.12, 0.05],
    [0.08, 0.15], [0.08, 0.30], [0.12, 0.32], [0.12, 0.40],
    [0.09, 0.40], [0.09, 0.38], [0.06, 0.38], [0.06, 0.40], [0, 0.40],
  ],
  knight: [
    [0, 0], [0.13, 0], [0.14, 0.02], [0.1, 0.05],
    [0.07, 0.12], [0.06, 0.20], [0.08, 0.25], [0.1, 0.32],
    [0.08, 0.38], [0.04, 0.42], [0, 0.44],
  ],
  bishop: [
    [0, 0], [0.13, 0], [0.14, 0.02], [0.1, 0.05],
    [0.06, 0.15], [0.05, 0.28], [0.07, 0.33], [0.06, 0.40],
    [0.03, 0.44], [0, 0.47],
  ],
  queen: [
    [0, 0], [0.14, 0], [0.15, 0.02], [0.11, 0.06],
    [0.07, 0.18], [0.06, 0.32], [0.09, 0.36], [0.1, 0.42],
    [0.07, 0.48], [0.04, 0.52], [0, 0.55],
  ],
  king: [
    [0, 0], [0.14, 0], [0.15, 0.02], [0.11, 0.06],
    [0.07, 0.20], [0.06, 0.36], [0.09, 0.40], [0.1, 0.46],
    [0.08, 0.50], [0.04, 0.54], [0.02, 0.56], [0, 0.58],
  ],
};

// ─── Samurai ──────────────────────────────────────────────────────────────────

const SAMURAI_PROFILES: Record<string, [number, number][]> = {
  pawn: [
    [0, 0], [0.10, 0], [0.11, 0.02], [0.08, 0.05],
    [0.05, 0.14], [0.04, 0.22], [0.06, 0.26], [0.05, 0.34], [0, 0.36],
  ],
  rook: [
    [0, 0], [0.12, 0], [0.13, 0.02], [0.10, 0.06],
    [0.06, 0.18], [0.06, 0.34], [0.10, 0.36], [0.11, 0.44],
    [0.08, 0.44], [0.08, 0.42], [0.05, 0.42], [0.05, 0.46], [0, 0.46],
  ],
  knight: [
    [0, 0], [0.11, 0], [0.12, 0.02], [0.08, 0.06],
    [0.05, 0.16], [0.04, 0.26], [0.07, 0.30], [0.09, 0.38],
    [0.06, 0.44], [0.03, 0.50], [0, 0.52],
  ],
  bishop: [
    [0, 0], [0.11, 0], [0.12, 0.02], [0.08, 0.06],
    [0.05, 0.18], [0.04, 0.32], [0.06, 0.38], [0.05, 0.46],
    [0.02, 0.52], [0, 0.55],
  ],
  queen: [
    [0, 0], [0.12, 0], [0.13, 0.02], [0.09, 0.07],
    [0.06, 0.20], [0.05, 0.36], [0.08, 0.40], [0.09, 0.48],
    [0.06, 0.54], [0.03, 0.58], [0, 0.62],
  ],
  king: [
    [0, 0], [0.12, 0], [0.13, 0.02], [0.09, 0.07],
    [0.06, 0.24], [0.05, 0.40], [0.08, 0.44], [0.09, 0.52],
    [0.06, 0.58], [0.03, 0.62], [0.02, 0.64], [0, 0.66],
  ],
};

// ─── Roman Army ───────────────────────────────────────────────────────────────

const ROMAN_PROFILES: Record<string, [number, number][]> = {
  pawn: [
    [0, 0], [0.13, 0], [0.14, 0.03], [0.12, 0.06],
    [0.08, 0.10], [0.07, 0.16], [0.09, 0.20], [0.07, 0.26], [0, 0.28],
  ],
  rook: [
    [0, 0], [0.16, 0], [0.17, 0.03], [0.14, 0.06],
    [0.10, 0.14], [0.10, 0.28], [0.14, 0.30], [0.15, 0.38],
    [0.12, 0.40], [0.12, 0.36], [0.08, 0.36], [0.08, 0.42], [0, 0.42],
  ],
  knight: [
    [0, 0], [0.14, 0], [0.15, 0.03], [0.12, 0.06],
    [0.09, 0.12], [0.08, 0.20], [0.10, 0.24], [0.12, 0.30],
    [0.09, 0.36], [0.05, 0.40], [0, 0.42],
  ],
  bishop: [
    [0, 0], [0.14, 0], [0.15, 0.03], [0.12, 0.06],
    [0.08, 0.14], [0.06, 0.26], [0.08, 0.30], [0.07, 0.38],
    [0.04, 0.42], [0, 0.45],
  ],
  queen: [
    [0, 0], [0.15, 0], [0.16, 0.03], [0.13, 0.07],
    [0.09, 0.16], [0.08, 0.30], [0.11, 0.34], [0.12, 0.40],
    [0.08, 0.46], [0.05, 0.50], [0, 0.52],
  ],
  king: [
    [0, 0], [0.15, 0], [0.16, 0.03], [0.13, 0.07],
    [0.09, 0.18], [0.08, 0.34], [0.11, 0.38], [0.12, 0.44],
    [0.09, 0.48], [0.05, 0.52], [0.03, 0.54], [0, 0.56],
  ],
};

// ─── Cyberpunk ────────────────────────────────────────────────────────────────

const CYBERPUNK_PROFILES: Record<string, [number, number][]> = {
  pawn: [
    [0, 0], [0.11, 0], [0.12, 0.01], [0.12, 0.04],
    [0.06, 0.08], [0.06, 0.18], [0.08, 0.20], [0.04, 0.28], [0, 0.30],
  ],
  rook: [
    [0, 0], [0.13, 0], [0.14, 0.01], [0.14, 0.05],
    [0.08, 0.10], [0.08, 0.30], [0.13, 0.32], [0.13, 0.40],
    [0.10, 0.40], [0.10, 0.36], [0.06, 0.36], [0.06, 0.42], [0, 0.42],
  ],
  knight: [
    [0, 0], [0.12, 0], [0.13, 0.01], [0.13, 0.05],
    [0.07, 0.10], [0.07, 0.22], [0.10, 0.26], [0.10, 0.34],
    [0.06, 0.40], [0.03, 0.44], [0, 0.46],
  ],
  bishop: [
    [0, 0], [0.12, 0], [0.13, 0.01], [0.13, 0.05],
    [0.06, 0.12], [0.06, 0.30], [0.08, 0.34], [0.04, 0.42],
    [0.02, 0.46], [0, 0.48],
  ],
  queen: [
    [0, 0], [0.13, 0], [0.14, 0.01], [0.14, 0.06],
    [0.07, 0.14], [0.07, 0.34], [0.10, 0.38], [0.08, 0.46],
    [0.04, 0.52], [0.02, 0.54], [0, 0.56],
  ],
  king: [
    [0, 0], [0.13, 0], [0.14, 0.01], [0.14, 0.06],
    [0.07, 0.16], [0.07, 0.38], [0.10, 0.42], [0.08, 0.50],
    [0.05, 0.56], [0.03, 0.58], [0.02, 0.60], [0, 0.62],
  ],
};

// ─── Cartoon ──────────────────────────────────────────────────────────────────

const CARTOON_PROFILES: Record<string, [number, number][]> = {
  pawn: [
    [0, 0], [0.14, 0], [0.15, 0.03], [0.13, 0.06],
    [0.09, 0.10], [0.08, 0.14], [0.10, 0.18], [0.08, 0.22], [0, 0.24],
  ],
  rook: [
    [0, 0], [0.16, 0], [0.17, 0.03], [0.15, 0.06],
    [0.11, 0.12], [0.11, 0.26], [0.15, 0.28], [0.16, 0.36],
    [0.13, 0.38], [0.13, 0.34], [0.09, 0.34], [0.09, 0.40], [0, 0.40],
  ],
  knight: [
    [0, 0], [0.15, 0], [0.16, 0.03], [0.14, 0.06],
    [0.10, 0.10], [0.09, 0.18], [0.12, 0.22], [0.14, 0.28],
    [0.10, 0.34], [0.06, 0.38], [0, 0.40],
  ],
  bishop: [
    [0, 0], [0.15, 0], [0.16, 0.03], [0.14, 0.06],
    [0.09, 0.12], [0.08, 0.24], [0.10, 0.28], [0.08, 0.36],
    [0.05, 0.40], [0, 0.42],
  ],
  queen: [
    [0, 0], [0.16, 0], [0.17, 0.03], [0.14, 0.07],
    [0.10, 0.14], [0.09, 0.28], [0.12, 0.32], [0.14, 0.38],
    [0.10, 0.44], [0.06, 0.48], [0, 0.50],
  ],
  king: [
    [0, 0], [0.16, 0], [0.17, 0.03], [0.14, 0.07],
    [0.10, 0.16], [0.09, 0.30], [0.12, 0.34], [0.14, 0.40],
    [0.10, 0.46], [0.06, 0.50], [0.04, 0.52], [0, 0.54],
  ],
};

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
    unlockShares: 1,
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
    unlockShares: 3,
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
    unlockShares: 5,
    profiles: CARTOON_PROFILES,
    whiteMat: { color: "#ffb347", roughness: 0.6, metalness: 0.0 },
    blackMat: { color: "#7b68ee", roughness: 0.6, metalness: 0.0 },
    boardLight: "hsl(140, 40%, 75%)",
    boardDark: "hsl(140, 30%, 50%)",
    boardTrim: "hsl(0, 80%, 60%)",
    boardBase: "#2a3a2a",
  },
];

export function getSkinById(id: string): ChessSkin {
  return CHESS_SKINS.find(s => s.id === id) ?? CHESS_SKINS[0];
}
