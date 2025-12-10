// 3D-style gold game icons for featured games

export const ChessIcon = () => (
  <svg viewBox="0 0 80 80" className="w-full h-full drop-shadow-[0_4px_8px_rgba(0,0,0,0.4)]">
    {/* Base */}
    <ellipse cx="40" cy="70" rx="20" ry="5" fill="url(#goldGradientBase)" />
    <rect x="25" y="65" width="30" height="5" fill="url(#goldGradient)" />
    
    {/* Pedestal */}
    <path d="M28 65 L32 55 L48 55 L52 65 Z" fill="url(#goldGradient)" />
    <rect x="30" y="50" width="20" height="5" fill="url(#goldGradientLight)" />
    
    {/* Body - pyramid-like pawn */}
    <path d="M32 50 L40 15 L48 50 Z" fill="url(#goldGradientBody)" stroke="url(#goldStroke)" strokeWidth="0.5" />
    
    {/* Top sphere */}
    <circle cx="40" cy="12" r="6" fill="url(#goldSphere)" />
    <ellipse cx="38" cy="10" rx="2" ry="1.5" fill="hsl(45 93% 80% / 0.6)" />
    
    {/* Highlights */}
    <path d="M36 45 L40 20 L40 45 Z" fill="hsl(45 93% 70% / 0.3)" />
    
    <defs>
      <linearGradient id="goldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="hsl(45 93% 60%)" />
        <stop offset="50%" stopColor="hsl(45 93% 50%)" />
        <stop offset="100%" stopColor="hsl(35 80% 40%)" />
      </linearGradient>
      <linearGradient id="goldGradientBase" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="hsl(35 80% 35%)" />
        <stop offset="100%" stopColor="hsl(35 70% 25%)" />
      </linearGradient>
      <linearGradient id="goldGradientLight" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="hsl(45 93% 65%)" />
        <stop offset="100%" stopColor="hsl(45 93% 50%)" />
      </linearGradient>
      <linearGradient id="goldGradientBody" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="hsl(45 93% 65%)" />
        <stop offset="40%" stopColor="hsl(45 93% 54%)" />
        <stop offset="100%" stopColor="hsl(35 80% 35%)" />
      </linearGradient>
      <radialGradient id="goldSphere" cx="35%" cy="35%" r="60%">
        <stop offset="0%" stopColor="hsl(45 93% 75%)" />
        <stop offset="50%" stopColor="hsl(45 93% 54%)" />
        <stop offset="100%" stopColor="hsl(35 80% 35%)" />
      </radialGradient>
      <linearGradient id="goldStroke" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="hsl(45 93% 70%)" />
        <stop offset="100%" stopColor="hsl(35 80% 40%)" />
      </linearGradient>
    </defs>
  </svg>
);

export const DominoIcon = () => (
  <svg viewBox="0 0 80 80" className="w-full h-full drop-shadow-[0_4px_8px_rgba(0,0,0,0.4)]">
    {/* Main domino tile - angled for 3D effect */}
    <g transform="rotate(-10 40 40)">
      {/* Shadow */}
      <rect x="22" y="18" width="36" height="52" rx="4" fill="rgba(0,0,0,0.3)" transform="translate(3, 3)" />
      
      {/* Tile body */}
      <rect x="22" y="16" width="36" height="52" rx="4" fill="url(#dominoGradient)" stroke="hsl(35 80% 40%)" strokeWidth="1.5" />
      
      {/* Beveled edge highlight */}
      <rect x="23" y="17" width="34" height="50" rx="3" fill="none" stroke="hsl(220 30% 25%)" strokeWidth="0.5" />
      
      {/* Center divider with gold inlay */}
      <line x1="24" y1="42" x2="56" y2="42" stroke="url(#goldLineGradient)" strokeWidth="2" />
      
      {/* Top pips - gold */}
      <circle cx="32" cy="26" r="3" fill="url(#pipGold)" />
      <circle cx="48" cy="26" r="3" fill="url(#pipGold)" />
      <circle cx="32" cy="36" r="3" fill="url(#pipGold)" />
      <circle cx="48" cy="36" r="3" fill="url(#pipGold)" />
      
      {/* Bottom pips - gold */}
      <circle cx="40" cy="52" r="3" fill="url(#pipGold)" />
      <circle cx="32" cy="60" r="3" fill="url(#pipGold)" />
      <circle cx="48" cy="60" r="3" fill="url(#pipGold)" />
    </g>
    
    <defs>
      <linearGradient id="dominoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="hsl(220 30% 18%)" />
        <stop offset="50%" stopColor="hsl(220 25% 12%)" />
        <stop offset="100%" stopColor="hsl(220 20% 8%)" />
      </linearGradient>
      <linearGradient id="goldLineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="hsl(35 80% 35%)" />
        <stop offset="50%" stopColor="hsl(45 93% 54%)" />
        <stop offset="100%" stopColor="hsl(35 80% 35%)" />
      </linearGradient>
      <radialGradient id="pipGold" cx="30%" cy="30%" r="70%">
        <stop offset="0%" stopColor="hsl(45 93% 70%)" />
        <stop offset="50%" stopColor="hsl(45 93% 54%)" />
        <stop offset="100%" stopColor="hsl(35 80% 35%)" />
      </radialGradient>
    </defs>
  </svg>
);

export const BackgammonIcon = () => (
  <svg viewBox="0 0 80 80" className="w-full h-full drop-shadow-[0_4px_8px_rgba(0,0,0,0.4)]">
    {/* Dice 1 - larger, rotated */}
    <g transform="rotate(-15 30 45)">
      {/* Shadow */}
      <rect x="10" y="30" width="32" height="32" rx="5" fill="rgba(0,0,0,0.3)" transform="translate(3, 3)" />
      
      {/* Dice body */}
      <rect x="10" y="28" width="32" height="32" rx="5" fill="url(#diceGradient1)" stroke="hsl(45 93% 50%)" strokeWidth="1" />
      
      {/* Top face highlight */}
      <rect x="12" y="30" width="28" height="28" rx="4" fill="url(#diceFace)" opacity="0.3" />
      
      {/* Gold pips - showing 5 */}
      <circle cx="18" cy="36" r="2.5" fill="url(#dicePipGold)" />
      <circle cx="34" cy="36" r="2.5" fill="url(#dicePipGold)" />
      <circle cx="26" cy="44" r="2.5" fill="url(#dicePipGold)" />
      <circle cx="18" cy="52" r="2.5" fill="url(#dicePipGold)" />
      <circle cx="34" cy="52" r="2.5" fill="url(#dicePipGold)" />
    </g>
    
    {/* Dice 2 - smaller, different rotation */}
    <g transform="rotate(20 55 40)">
      {/* Shadow */}
      <rect x="42" y="22" width="26" height="26" rx="4" fill="rgba(0,0,0,0.3)" transform="translate(2, 2)" />
      
      {/* Dice body */}
      <rect x="42" y="20" width="26" height="26" rx="4" fill="url(#diceGradient2)" stroke="hsl(45 93% 50%)" strokeWidth="1" />
      
      {/* Top face highlight */}
      <rect x="44" y="22" width="22" height="22" rx="3" fill="url(#diceFace)" opacity="0.3" />
      
      {/* Gold pips - showing 6 */}
      <circle cx="50" cy="27" r="2" fill="url(#dicePipGold)" />
      <circle cx="60" cy="27" r="2" fill="url(#dicePipGold)" />
      <circle cx="50" cy="33" r="2" fill="url(#dicePipGold)" />
      <circle cx="60" cy="33" r="2" fill="url(#dicePipGold)" />
      <circle cx="50" cy="39" r="2" fill="url(#dicePipGold)" />
      <circle cx="60" cy="39" r="2" fill="url(#dicePipGold)" />
    </g>
    
    {/* Reflective shine */}
    <ellipse cx="26" cy="34" rx="8" ry="3" fill="hsl(45 93% 80% / 0.2)" transform="rotate(-15 26 34)" />
    <ellipse cx="55" cy="26" rx="6" ry="2" fill="hsl(45 93% 80% / 0.2)" transform="rotate(20 55 26)" />
    
    <defs>
      <linearGradient id="diceGradient1" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="hsl(0 0% 95%)" />
        <stop offset="50%" stopColor="hsl(45 10% 90%)" />
        <stop offset="100%" stopColor="hsl(40 15% 80%)" />
      </linearGradient>
      <linearGradient id="diceGradient2" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="hsl(0 0% 92%)" />
        <stop offset="50%" stopColor="hsl(45 10% 85%)" />
        <stop offset="100%" stopColor="hsl(40 15% 75%)" />
      </linearGradient>
      <linearGradient id="diceFace" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="white" />
        <stop offset="100%" stopColor="transparent" />
      </linearGradient>
      <radialGradient id="dicePipGold" cx="30%" cy="30%" r="70%">
        <stop offset="0%" stopColor="hsl(45 93% 70%)" />
        <stop offset="50%" stopColor="hsl(45 93% 54%)" />
        <stop offset="100%" stopColor="hsl(35 80% 35%)" />
      </radialGradient>
    </defs>
  </svg>
);
