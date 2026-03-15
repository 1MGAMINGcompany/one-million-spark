/**
 * useChessSkin — manages skin selection and unlock progression.
 * All data in localStorage for simplicity.
 */

import { useState, useCallback, useMemo } from "react";
import { CHESS_SKINS, getSkinById, type ChessSkin } from "@/lib/chessSkins";

const SKIN_KEY = "chess-skin";
const GAMES_KEY = "chess-games-completed";
const SHARES_KEY = "chess-shares-count";

function readInt(key: string): number {
  try { return parseInt(localStorage.getItem(key) || "0", 10) || 0; } catch { return 0; }
}

export function incrementChessGames(): number {
  const n = readInt(GAMES_KEY) + 1;
  try { localStorage.setItem(GAMES_KEY, String(n)); } catch {}
  return n;
}

export function incrementChessShares(): number {
  const n = readInt(SHARES_KEY) + 1;
  try { localStorage.setItem(SHARES_KEY, String(n)); } catch {}
  return n;
}

export interface UseChessSkinReturn {
  activeSkin: ChessSkin;
  skinId: string;
  setSkin: (id: string) => void;
  allSkins: ChessSkin[];
  unlockedSkins: ChessSkin[];
  isUnlocked: (skin: ChessSkin) => boolean;
  progress: { games: number; shares: number };
}

export function useChessSkin(): UseChessSkinReturn {
  const [skinId, setSkinId] = useState<string>(() => {
    try { return localStorage.getItem(SKIN_KEY) || "classic"; } catch { return "classic"; }
  });

  const [games] = useState(() => readInt(GAMES_KEY));
  const [shares] = useState(() => readInt(SHARES_KEY));

  const progress = useMemo(() => ({ games, shares }), [games, shares]);

  const isUnlocked = useCallback((skin: ChessSkin): boolean => {
    return games >= skin.unlockGames && shares >= skin.unlockShares;
  }, [games, shares]);

  const unlockedSkins = useMemo(() => CHESS_SKINS.filter(isUnlocked), [isUnlocked]);

  const setSkin = useCallback((id: string) => {
    const skin = getSkinById(id);
    if (isUnlocked(skin)) {
      setSkinId(id);
      try { localStorage.setItem(SKIN_KEY, id); } catch {}
    }
  }, [isUnlocked]);

  const activeSkin = useMemo(() => getSkinById(skinId), [skinId]);

  return { activeSkin, skinId, setSkin, allSkins: CHESS_SKINS, unlockedSkins, isUnlocked, progress };
}
