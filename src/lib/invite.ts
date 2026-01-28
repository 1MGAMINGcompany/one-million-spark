// Solana-based invite links with rich room info

import { isWalletInAppBrowser } from "@/lib/walletBrowserDetection";

export interface RoomInviteInfo {
  roomPda: string;
  gameName?: string;
  stakeSol?: number;
  winnerPayout?: number;
  turnTimeSeconds?: number;
  maxPlayers?: number;
  playerCount?: number;
  mode?: 'casual' | 'ranked' | 'private';
}

export function buildInviteLink(params: {
  roomId: string;
  cluster?: string;
}) {
  const url = new URL(window.location.origin);
  url.pathname = `/room/${params.roomId}`;
  return url.toString();
}

// Build rich invite message with room details
// Set includeLink=false for native share (url passed separately)
export function buildInviteMessage(info: RoomInviteInfo, includeLink: boolean = true): string {
  const lines: string[] = [];
  
  lines.push(`🎮 Join my ${info.gameName || 'game'} on 1M Gaming!`);
  lines.push('');
  
  if (info.stakeSol && info.stakeSol > 0) {
    lines.push(`💰 Stake: ${info.stakeSol.toFixed(4)} SOL`);
    if (info.winnerPayout) {
      lines.push(`🏆 Winner gets: ${info.winnerPayout.toFixed(4)} SOL`);
    }
  } else {
    lines.push('🆓 Free to play (no stake)');
  }
  
  if (info.maxPlayers) {
    const current = info.playerCount || 1;
    lines.push(`👥 Players: ${current}/${info.maxPlayers}`);
  }
  
  if (info.turnTimeSeconds && info.turnTimeSeconds > 0) {
    const timeStr = info.turnTimeSeconds >= 60 
      ? `${Math.floor(info.turnTimeSeconds / 60)}m` 
      : `${info.turnTimeSeconds}s`;
    lines.push(`⏱️ Turn time: ${timeStr}`);
  }
  
  if (info.mode) {
    const modeEmoji = info.mode === 'ranked' ? '🔴' : info.mode === 'private' ? '🟣' : '🟢';
    const modeName = info.mode.charAt(0).toUpperCase() + info.mode.slice(1);
    lines.push(`${modeEmoji} ${modeName} mode`);
  }
  
  // Only include embedded URL for copy/paste scenarios (WhatsApp URL builder, SMS, etc.)
  // Native share should use the url parameter instead to avoid preview domain issues
  if (includeLink) {
    lines.push('');
    lines.push('📱 On mobile? Open this link inside your wallet app!');
    lines.push(`👉 ${buildInviteLink({ roomId: info.roomPda })}`);
  }
  
  return lines.join('\n');
}

/**
 * Safely open an external URL. Wallet in-app browsers (Phantom/Solflare)
 * often fail with window.open(), so we use location.href as fallback.
 * Returns true if navigation was attempted successfully.
 */
function safeExternalOpen(url: string): boolean {
  try {
    const inWalletBrowser = isWalletInAppBrowser();
    const isHttpsUrl = url.startsWith('https://') || url.startsWith('http://');
    
    // Wallet browsers cannot open custom URL schemes (sms:, mailto:)
    // Return false to trigger fallback (copy link + toast)
    if (inWalletBrowser && !isHttpsUrl) {
      console.log("[invite] Wallet browser cannot open custom scheme:", url.slice(0, 30));
      return false;
    }
    
    if (inWalletBrowser) {
      // In wallet browsers, use location.href for HTTPS links
      console.log("[invite] Wallet browser - using location.href for:", url.slice(0, 50));
      window.location.href = url;
      return true;
    }
    
    // Regular browser - try window.open first
    const popup = window.open(url, "_blank", "noopener,noreferrer");
    if (!popup) {
      // Popup blocked - fallback to location.href
      console.log("[invite] Popup blocked - falling back to location.href");
      window.location.href = url;
    }
    return true;
  } catch (e) {
    console.error("[invite] Failed to open URL:", e);
    return false;
  }
}

export function shareInvite(link: string, gameName?: string, info?: RoomInviteInfo): Promise<boolean> {
  const title = gameName ? `Join my ${gameName} game!` : "Game Invite";
  
  // For native share, do NOT embed URL in text - use url parameter only
  // This prevents mobile apps from using preview domain URLs from the text body
  const text = info ? buildInviteMessage(info, false) : undefined;
  
  if (navigator.share) {
    return navigator.share({ title, text: text || title, url: link })
      .then(() => true)
      .catch(() => false);
  }
  return navigator.clipboard.writeText(link).then(() => true).catch(() => false);
}

export function whatsappInvite(link: string, gameName?: string, info?: RoomInviteInfo): boolean {
  const message = info ? buildInviteMessage(info) : (
    gameName 
      ? `🎮 Join my ${gameName} game on 1M Gaming: ${link}`
      : `🎮 Join my game room: ${link}`
  );
  const text = encodeURIComponent(message);
  return safeExternalOpen(`https://wa.me/?text=${text}`);
}

export function smsInvite(link: string, gameName?: string, info?: RoomInviteInfo): boolean {
  const message = info ? buildInviteMessage(info) : (
    gameName 
      ? `🎮 Join my ${gameName} game on 1M Gaming: ${link}`
      : `🎮 Join my private game room: ${link}`
  );
  // sms: protocol works on mobile devices
  return safeExternalOpen(`sms:?body=${encodeURIComponent(message)}`);
}

export function facebookInvite(link: string): boolean {
  const url = encodeURIComponent(link);
  return safeExternalOpen(`https://www.facebook.com/sharer/sharer.php?u=${url}`);
}

export function emailInvite(link: string, gameName?: string, info?: RoomInviteInfo): boolean {
  const subject = encodeURIComponent(
    gameName ? `Join my ${gameName} game on 1M Gaming` : "Game room invite"
  );
  
  let bodyText: string;
  if (info) {
    const details = buildInviteMessage(info);
    bodyText = `Hey!\n\n${details}\n\nSee you there!`;
  } else {
    bodyText = `Hey!\n\nI've created a game room on 1M Gaming and I'd love for you to join.\n\nClick here to join: ${link}\n\nSee you there!`;
  }
  
  const body = encodeURIComponent(bodyText);
  return safeExternalOpen(`mailto:?subject=${subject}&body=${body}`);
}

export function twitterInvite(link: string, gameName?: string, info?: RoomInviteInfo): boolean {
  let text: string;
  if (info && info.stakeSol && info.stakeSol > 0) {
    text = `🎮 Play ${gameName || 'games'} for ${info.stakeSol.toFixed(4)} SOL on @1MGaming! Winner takes ${info.winnerPayout?.toFixed(4) || '?'} SOL 🏆`;
  } else {
    text = gameName 
      ? `🎮 Join my ${gameName} game on @1MGaming!` 
      : `🎮 Join my game on @1MGaming!`;
  }
  const encodedText = encodeURIComponent(text);
  const encodedUrl = encodeURIComponent(link);
  return safeExternalOpen(`https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`);
}

export function telegramInvite(link: string, gameName?: string, info?: RoomInviteInfo): boolean {
  const message = info ? buildInviteMessage(info) : (
    gameName 
      ? `🎮 Join my ${gameName} game on 1M Gaming!`
      : `🎮 Join my game room!`
  );
  const encodedText = encodeURIComponent(message);
  const encodedUrl = encodeURIComponent(link);
  return safeExternalOpen(`https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`);
}

export function copyInviteLink(link: string): Promise<void> {
  return navigator.clipboard.writeText(link);
}

export function copyInviteMessage(info: RoomInviteInfo): Promise<void> {
  const message = buildInviteMessage(info);
  return navigator.clipboard.writeText(message);
}
