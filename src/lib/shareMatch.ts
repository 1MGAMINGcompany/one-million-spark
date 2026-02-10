/**
 * Share utility functions for match results
 */

const LAMPORTS_PER_SOL = 1_000_000_000;

export function buildMatchUrl(roomPda: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://one-million-spark.lovable.app';
  return `${origin}/match/${roomPda}`;
}

export async function copyMatchLink(roomPda: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(buildMatchUrl(roomPda));
    return true;
  } catch {
    return false;
  }
}

export async function nativeShareMatch(roomPda: string, gameType: string): Promise<boolean> {
  const url = buildMatchUrl(roomPda);
  const title = `I just won a ${gameType} match!`;
  const text = `Check out my win on 1M Gaming 🏆`;

  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export function whatsappShareMatch(roomPda: string, gameType: string): string {
  const url = buildMatchUrl(roomPda);
  const text = `🏆 I just won a ${gameType} match on 1M Gaming! Check it out: ${url}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function twitterShareMatch(roomPda: string, gameType: string, solWon?: number): string {
  const url = buildMatchUrl(roomPda);
  const solText = solWon ? ` and won ${solWon.toFixed(4)} SOL` : '';
  const text = `🏆 Just won a ${gameType} match${solText} on @1MGaming!\n\n`;
  return `https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
}

export function lamportsToSolDisplay(lamports: number | null | undefined): string {
  if (!lamports) return '0';
  return (lamports / LAMPORTS_PER_SOL).toFixed(4);
}
