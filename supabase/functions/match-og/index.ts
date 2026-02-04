import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function shortenWallet(wallet: string | null): string {
  if (!wallet) return "Unknown";
  return `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;
}

function formatStake(lamports: number): string {
  const sol = lamports / 1e9;
  if (sol === 0) return "FREE MATCH";
  return `${sol.toFixed(4)} SOL`;
}

function formatGameType(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function formatWinReason(reason: string): string {
  const labels: Record<string, string> = {
    checkmate: "Checkmate",
    resign: "Resignation",
    forfeit: "Forfeit",
    timeout: "Timeout",
    void: "Void",
    bearoff: "Bear Off",
    blocked: "Blocked",
    unknown: "Match Complete",
  };
  return labels[reason] || reason;
}

function generateSvg(match: {
  game_type: string;
  mode: string;
  winner_wallet: string | null;
  loser_wallet: string | null;
  win_reason: string;
  stake_lamports: number;
  winner_rank_after?: number | null;
}): string {
  const gameType = formatGameType(match.game_type);
  const mode = match.mode === "ranked" ? "RANKED" : match.mode === "private" ? "PRIVATE" : "CASUAL";
  const winner = shortenWallet(match.winner_wallet);
  const opponent = shortenWallet(match.loser_wallet);
  const stake = formatStake(match.stake_lamports);
  const winReason = formatWinReason(match.win_reason);
  const isVoid = match.win_reason === "void";
  const rankBadge = match.mode === "ranked" && match.winner_rank_after ? `${match.winner_rank_after}` : null;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Background gradient -->
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0a0a0f;stop-opacity:1" />
      <stop offset="50%" style="stop-color:#12121a;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#1a1a28;stop-opacity:1" />
    </linearGradient>
    
    <!-- Gold gradient for branding -->
    <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#FCE68A;stop-opacity:1" />
      <stop offset="50%" style="stop-color:#FACC15;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#AB8215;stop-opacity:1" />
    </linearGradient>
    
    <!-- Accent gradient -->
    <linearGradient id="accentGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#3b82f6;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#1d4ed8;stop-opacity:1" />
    </linearGradient>
    
    <!-- Winner glow -->
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
      <feMerge>
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    
    <!-- Card shadow -->
    <filter id="cardShadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="4" stdDeviation="8" flood-color="#000" flood-opacity="0.5"/>
    </filter>
  </defs>
  
  <!-- Background -->
  <rect width="1200" height="630" fill="url(#bgGrad)"/>
  
  <!-- Decorative grid pattern -->
  <g opacity="0.03">
    ${Array.from({ length: 12 }, (_, i) => `<line x1="${i * 100}" y1="0" x2="${i * 100}" y2="630" stroke="#fff" stroke-width="1"/>`).join('')}
    ${Array.from({ length: 7 }, (_, i) => `<line x1="0" y1="${i * 90}" x2="1200" y2="${i * 90}" stroke="#fff" stroke-width="1"/>`).join('')}
  </g>
  
  <!-- Decorative corner accents -->
  <polygon points="0,0 80,0 0,80" fill="url(#goldGrad)" opacity="0.15"/>
  <polygon points="1200,630 1120,630 1200,550" fill="url(#goldGrad)" opacity="0.15"/>
  
  <!-- Top bar -->
  <rect x="0" y="0" width="1200" height="4" fill="url(#goldGrad)"/>
  
  <!-- 1MGAMING Logo/Brand -->
  <text x="600" y="90" text-anchor="middle" font-family="Arial, sans-serif" font-size="42" font-weight="bold" fill="url(#goldGrad)" filter="url(#glow)">
    1M GAMING
  </text>
  
  <!-- Pyramid icon (simplified) -->
  <g transform="translate(600, 120)" opacity="0.6">
    <polygon points="0,-25 22,15 -22,15" fill="url(#goldGrad)" stroke="none"/>
  </g>
  
  <!-- Game type badge -->
  <g transform="translate(600, 180)">
    <rect x="-100" y="-20" width="200" height="40" rx="20" fill="#1e1e2e" stroke="url(#goldGrad)" stroke-width="2"/>
    <text x="0" y="7" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" font-weight="bold" fill="#fff">
      ${escapeXml(gameType.toUpperCase())}
    </text>
  </g>
  
  <!-- Mode badge -->
  <g transform="translate(600, 230)">
    <rect x="-60" y="-14" width="120" height="28" rx="14" fill="${match.mode === 'ranked' ? '#3b82f6' : '#6b7280'}" opacity="0.8"/>
    <text x="0" y="5" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#fff">
      ${escapeXml(mode)}
    </text>
  </g>
  
  <!-- Main content card -->
  <rect x="100" y="270" width="1000" height="260" rx="16" fill="#1a1a2e" filter="url(#cardShadow)" opacity="0.9"/>
  <rect x="100" y="270" width="1000" height="260" rx="16" fill="none" stroke="url(#goldGrad)" stroke-width="1" opacity="0.3"/>
  
  ${isVoid ? `
    <!-- Void state -->
    <text x="600" y="380" text-anchor="middle" font-family="Arial, sans-serif" font-size="36" fill="#ef4444" font-weight="bold">
      SETTLEMENT FAILED
    </text>
    <text x="600" y="420" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" fill="#888">
      No winner recorded
    </text>
  ` : `
    <!-- VS Layout -->
    <g>
      <!-- Winner side -->
      <text x="300" y="320" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" fill="#22c55e" font-weight="bold">
        WINNER
      </text>
      <text x="300" y="365" text-anchor="middle" font-family="monospace" font-size="32" fill="#fff" font-weight="bold">
        ${escapeXml(winner)}
      </text>
      ${rankBadge ? `
        <g transform="translate(300, 400)">
          <rect x="-45" y="-15" width="90" height="30" rx="15" fill="url(#accentGrad)"/>
          <text x="0" y="7" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" fill="#fff" font-weight="bold">
            ⭐ ${escapeXml(rankBadge)}
          </text>
        </g>
      ` : ''}
      
      <!-- VS divider -->
      <g transform="translate(600, 360)">
        <circle r="35" fill="#1e1e2e" stroke="url(#goldGrad)" stroke-width="2"/>
        <text y="8" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" fill="url(#goldGrad)" font-weight="bold">
          VS
        </text>
      </g>
      
      <!-- Opponent side -->
      <text x="900" y="320" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" fill="#888">
        OPPONENT
      </text>
      <text x="900" y="365" text-anchor="middle" font-family="monospace" font-size="32" fill="#888">
        ${escapeXml(opponent)}
      </text>
    </g>
    
    <!-- Win reason -->
    <text x="600" y="480" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" fill="#a3a3a3">
      Won by ${escapeXml(winReason)}
    </text>
  `}
  
  <!-- Stake display -->
  <g transform="translate(600, 560)">
    <rect x="-120" y="-25" width="240" height="50" rx="25" fill="#1e1e2e" stroke="url(#goldGrad)" stroke-width="2"/>
    <text x="0" y="8" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" fill="url(#goldGrad)" font-weight="bold">
      💰 ${escapeXml(stake)}
    </text>
  </g>
  
  <!-- Footer -->
  <text x="600" y="615" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#666">
    one-million-spark.lovable.app
  </text>
</svg>`;
}

function generateNotFoundSvg(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0a0a0f;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#1a1a28;stop-opacity:1" />
    </linearGradient>
    <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#FCE68A;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#AB8215;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bgGrad)"/>
  <rect x="0" y="0" width="1200" height="4" fill="url(#goldGrad)"/>
  <text x="600" y="280" text-anchor="middle" font-family="Arial, sans-serif" font-size="42" font-weight="bold" fill="url(#goldGrad)">
    1M GAMING
  </text>
  <text x="600" y="360" text-anchor="middle" font-family="Arial, sans-serif" font-size="32" fill="#888">
    Match Not Found
  </text>
  <text x="600" y="410" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" fill="#555">
    This match may have expired or doesn't exist
  </text>
</svg>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const roomPda = url.searchParams.get('roomPda');

    if (!roomPda || roomPda.length < 10) {
      const svg = generateNotFoundSvg();
      return new Response(svg, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'image/svg+xml',
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data, error } = await supabase
      .from("match_share_cards")
      .select("game_type, mode, winner_wallet, loser_wallet, win_reason, stake_lamports, winner_rank_after")
      .eq("room_pda", roomPda)
      .single();

    if (error || !data) {
      console.log("[match-og] Not found:", roomPda.slice(0, 8));
      const svg = generateNotFoundSvg();
      return new Response(svg, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'image/svg+xml',
          'Cache-Control': 'public, max-age=60',
        },
      });
    }

    console.log("[match-og] ✅ Generating OG for:", roomPda.slice(0, 8), data.game_type);
    
    const svg = generateSvg(data);
    
    return new Response(svg, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=3600',
      },
    });

  } catch (err) {
    console.error("[match-og] Error:", err);
    const svg = generateNotFoundSvg();
    return new Response(svg, {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'image/svg+xml',
      },
    });
  }
});
