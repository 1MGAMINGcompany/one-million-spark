/**
 * Share Match Utilities
 * Helpers for generating share links and sharing match results
 */

// Get the production domain
export function getShareDomain(): string {
  // Use published domain for production
  if (typeof window !== "undefined") {
    const host = window.location.host;
    if (host.includes("1mgaming.com") || host.includes("one-million-spark.lovable.app")) {
      return window.location.origin;
    }
  }
  // Fallback to production URL
  return "https://one-million-spark.lovable.app";
}

// Build match share URL
export function buildMatchShareUrl(roomPda: string): string {
  return `${getShareDomain()}/match/${roomPda}`;
}

// Build WhatsApp share URL
export function buildWhatsAppShareUrl(roomPda: string, isWinner: boolean, gameName: string): string {
  const matchUrl = buildMatchShareUrl(roomPda);
  const message = isWinner
    ? `🏆 I just won a ${gameName} match on 1M Gaming! Check it out: ${matchUrl}`
    : `🎮 Just finished a ${gameName} match on 1M Gaming! Check out the results: ${matchUrl}`;
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

// Build Twitter/X share URL
export function buildTwitterShareUrl(roomPda: string, isWinner: boolean, gameName: string): string {
  const matchUrl = buildMatchShareUrl(roomPda);
  const text = isWinner
    ? `🏆 Victory! Just won a ${gameName} match on @1MGaming`
    : `🎮 Just played ${gameName} on @1MGaming`;
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(matchUrl)}`;
}

// Native share via Web Share API
export async function nativeShare(roomPda: string, isWinner: boolean, gameName: string): Promise<boolean> {
  if (!navigator.share) {
    return false;
  }

  const matchUrl = buildMatchShareUrl(roomPda);
  const title = isWinner ? `🏆 I Won at ${gameName}!` : `🎮 ${gameName} Match`;
  const text = isWinner
    ? `I just won a ${gameName} match on 1M Gaming! Check out the results.`
    : `Just finished a ${gameName} match on 1M Gaming.`;

  try {
    await navigator.share({
      title,
      text,
      url: matchUrl,
    });
    return true;
  } catch (err) {
    // User cancelled or share failed
    console.log("[shareMatch] Native share cancelled or failed:", err);
    return false;
  }
}

// Copy match link to clipboard
export async function copyMatchLink(roomPda: string): Promise<boolean> {
  const matchUrl = buildMatchShareUrl(roomPda);
  try {
    await navigator.clipboard.writeText(matchUrl);
    return true;
  } catch (err) {
    console.error("[shareMatch] Copy to clipboard failed:", err);
    return false;
  }
}

// Check if native share is available
export function isNativeShareAvailable(): boolean {
  return typeof navigator !== "undefined" && !!navigator.share;
}

// Shorten wallet address for display
export function shortenAddress(address: string | null, chars = 4): string {
  if (!address) return "—";
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

// Convert lamports to SOL
export function lamportsToSol(lamports: number): number {
  return lamports / 1_000_000_000;
}

// Game type display names
export const GAME_DISPLAY_NAMES: Record<string, string> = {
  chess: "Chess",
  checkers: "Checkers",
  backgammon: "Backgammon",
  dominos: "Dominos",
  ludo: "Ludo",
};

export function getGameDisplayName(gameType: string | undefined): string {
  if (!gameType) return "Game";
  return GAME_DISPLAY_NAMES[gameType.toLowerCase()] || gameType;
}
