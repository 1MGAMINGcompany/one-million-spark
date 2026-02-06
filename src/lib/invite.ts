// Solana-based invite links (placeholder for future Solana program integration)

export function buildInviteLink(params: {
  roomPda: string;
}) {
  const url = new URL(window.location.origin);
  url.pathname = `/room/${params.roomPda}`;
  return url.toString();
}

export function shareInvite(link: string, gameName?: string) {
  const title = gameName ? `Join my ${gameName} game!` : "Game Invite";
  if (navigator.share) {
    return navigator.share({ title, url: link });
  }
  return navigator.clipboard.writeText(link);
}

export function whatsappInvite(link: string, gameName?: string) {
  const message = gameName 
    ? `🎮 Join my ${gameName} game on 1M Gaming: ${link}`
    : `🎮 Join my game room: ${link}`;
  const text = encodeURIComponent(message);
  window.open(`https://wa.me/?text=${text}`, "_blank");
}

export function facebookInvite(link: string) {
  const url = encodeURIComponent(link);
  window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, "_blank");
}

export function emailInvite(link: string, gameName?: string) {
  const subject = encodeURIComponent(
    gameName ? `Join my ${gameName} game on 1M Gaming` : "Game room invite"
  );
  const body = encodeURIComponent(
    `Hey!\n\nI've created a game room on 1M Gaming and I'd love for you to join.\n\nClick here to join: ${link}\n\nSee you there!`
  );
  window.open(`mailto:?subject=${subject}&body=${body}`);
}

export function copyInviteLink(link: string): Promise<void> {
  return navigator.clipboard.writeText(link);
}
