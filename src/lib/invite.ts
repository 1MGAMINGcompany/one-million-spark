// Solana-based invite links with rich room info

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
export function buildInviteMessage(info: RoomInviteInfo): string {
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
  
  lines.push('');
  lines.push(`👉 ${buildInviteLink({ roomId: info.roomPda })}`);
  
  return lines.join('\n');
}

export function shareInvite(link: string, gameName?: string, info?: RoomInviteInfo) {
  const title = gameName ? `Join my ${gameName} game!` : "Game Invite";
  const text = info ? buildInviteMessage(info) : undefined;
  
  if (navigator.share) {
    return navigator.share({ title, text: text || title, url: link });
  }
  return navigator.clipboard.writeText(link);
}

export function whatsappInvite(link: string, gameName?: string, info?: RoomInviteInfo) {
  const message = info ? buildInviteMessage(info) : (
    gameName 
      ? `🎮 Join my ${gameName} game on 1M Gaming: ${link}`
      : `🎮 Join my game room: ${link}`
  );
  const text = encodeURIComponent(message);
  window.open(`https://wa.me/?text=${text}`, "_blank");
}

export function smsInvite(link: string, gameName?: string, info?: RoomInviteInfo) {
  const message = info ? buildInviteMessage(info) : (
    gameName 
      ? `🎮 Join my ${gameName} game on 1M Gaming: ${link}`
      : `🎮 Join my private game room: ${link}`
  );
  // sms: protocol works on mobile devices
  window.open(`sms:?body=${encodeURIComponent(message)}`, "_blank");
}

export function facebookInvite(link: string) {
  const url = encodeURIComponent(link);
  window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, "_blank");
}

export function emailInvite(link: string, gameName?: string, info?: RoomInviteInfo) {
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
  window.open(`mailto:?subject=${subject}&body=${body}`);
}

export function copyInviteLink(link: string): Promise<void> {
  return navigator.clipboard.writeText(link);
}
