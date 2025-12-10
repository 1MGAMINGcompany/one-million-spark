// Premium 3D-style gold game icons for featured games
import { useState } from "react";

interface GameIconProps {
  className?: string;
}

export const ChessIcon = ({ className = "" }: GameIconProps) => (
  <div className={`relative group/icon ${className}`}>
    {/* Soft glow background */}
    <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl opacity-60 group-hover/icon:opacity-100 transition-opacity duration-300" />
    
    <svg 
      viewBox="0 0 100 100" 
      className="w-full h-full relative z-10 drop-shadow-[0_8px_16px_rgba(0,0,0,0.4)] transition-all duration-300 group-hover/icon:-translate-y-2 group-hover/icon:drop-shadow-[0_12px_24px_rgba(0,0,0,0.5)]"
    >
      {/* Pyramid-shaped pawn base */}
      <defs>
        <linearGradient id="chessGoldMain" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="hsl(45 93% 75%)" />
          <stop offset="30%" stopColor="hsl(45 93% 60%)" />
          <stop offset="70%" stopColor="hsl(45 93% 50%)" />
          <stop offset="100%" stopColor="hsl(35 80% 35%)" />
        </linearGradient>
        <linearGradient id="chessGoldHighlight" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="hsl(45 93% 85%)" />
          <stop offset="100%" stopColor="hsl(45 93% 60%)" />
        </linearGradient>
        <linearGradient id="chessGoldDark" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="hsl(35 80% 40%)" />
          <stop offset="100%" stopColor="hsl(35 70% 25%)" />
        </linearGradient>
        <radialGradient id="chessSphereGold" cx="35%" cy="30%" r="60%">
          <stop offset="0%" stopColor="hsl(45 93% 85%)" />
          <stop offset="40%" stopColor="hsl(45 93% 60%)" />
          <stop offset="100%" stopColor="hsl(35 80% 35%)" />
        </radialGradient>
        <linearGradient id="chessReflection" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="hsl(45 93% 95% / 0.8)" />
          <stop offset="50%" stopColor="hsl(45 93% 80% / 0.3)" />
          <stop offset="100%" stopColor="transparent" />
        </linearGradient>
        <filter id="chessGlow">
          <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      
      {/* Shadow */}
      <ellipse cx="50" cy="90" rx="22" ry="6" fill="rgba(0,0,0,0.4)" />
      
      {/* Base platform */}
      <ellipse cx="50" cy="82" rx="24" ry="7" fill="url(#chessGoldDark)" />
      <ellipse cx="50" cy="80" rx="24" ry="7" fill="url(#chessGoldMain)" />
      <ellipse cx="50" cy="80" rx="20" ry="5" fill="url(#chessGoldHighlight)" opacity="0.3" />
      
      {/* Pedestal */}
      <path d="M30 80 L35 70 L65 70 L70 80 Z" fill="url(#chessGoldMain)" />
      <rect x="33" y="65" width="34" height="5" rx="1" fill="url(#chessGoldHighlight)" />
      
      {/* Body - pyramid shape */}
      <path d="M35 65 L50 18 L65 65 Z" fill="url(#chessGoldMain)" stroke="hsl(45 93% 70%)" strokeWidth="0.5" />
      
      {/* Metallic reflection on body */}
      <path d="M42 60 L50 25 L50 60 Z" fill="url(#chessReflection)" />
      
      {/* Top sphere */}
      <circle cx="50" cy="14" r="8" fill="url(#chessSphereGold)" filter="url(#chessGlow)" />
      
      {/* Sphere highlight */}
      <ellipse cx="47" cy="11" rx="3" ry="2" fill="hsl(45 93% 90% / 0.7)" />
      
      {/* Collar ring */}
      <ellipse cx="50" cy="24" rx="6" ry="2" fill="url(#chessGoldDark)" />
      <ellipse cx="50" cy="23" rx="6" ry="2" fill="url(#chessGoldHighlight)" />

      {/* Shine animation overlay */}
      <path 
        d="M38 65 L50 20 L52 20 L40 65 Z" 
        fill="hsl(45 93% 95% / 0.15)"
        className="group-hover/icon:animate-pulse"
      />
    </svg>
  </div>
);

export const DominoIcon = ({ className = "" }: GameIconProps) => (
  <div className={`relative group/icon ${className}`}>
    {/* Soft glow background */}
    <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl opacity-60 group-hover/icon:opacity-100 transition-opacity duration-300" />
    
    <svg 
      viewBox="0 0 100 100" 
      className="w-full h-full relative z-10 drop-shadow-[0_8px_16px_rgba(0,0,0,0.4)] transition-all duration-300 group-hover/icon:-translate-y-2 group-hover/icon:drop-shadow-[0_12px_24px_rgba(0,0,0,0.5)]"
    >
      <defs>
        <linearGradient id="dominoBlackGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="hsl(220 20% 20%)" />
          <stop offset="30%" stopColor="hsl(220 25% 12%)" />
          <stop offset="100%" stopColor="hsl(220 20% 6%)" />
        </linearGradient>
        <linearGradient id="dominoBevel" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="hsl(220 15% 30%)" />
          <stop offset="10%" stopColor="hsl(220 20% 15%)" />
          <stop offset="90%" stopColor="hsl(220 20% 8%)" />
          <stop offset="100%" stopColor="hsl(220 15% 5%)" />
        </linearGradient>
        <linearGradient id="dominoGoldLine" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="hsl(35 80% 30%)" />
          <stop offset="50%" stopColor="hsl(45 93% 60%)" />
          <stop offset="100%" stopColor="hsl(35 80% 30%)" />
        </linearGradient>
        <radialGradient id="dominoPipGold" cx="30%" cy="30%" r="70%">
          <stop offset="0%" stopColor="hsl(45 93% 80%)" />
          <stop offset="50%" stopColor="hsl(45 93% 55%)" />
          <stop offset="100%" stopColor="hsl(35 80% 35%)" />
        </radialGradient>
        <linearGradient id="dominoGloss" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="hsl(0 0% 100% / 0.2)" />
          <stop offset="30%" stopColor="hsl(0 0% 100% / 0.05)" />
          <stop offset="100%" stopColor="transparent" />
        </linearGradient>
        <filter id="dominoGlow">
          <feGaussianBlur stdDeviation="1.5" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      
      <g transform="rotate(-8 50 50)">
        {/* Shadow */}
        <rect x="24" y="18" width="48" height="68" rx="6" fill="rgba(0,0,0,0.4)" transform="translate(4, 4)" />
        
        {/* Main tile body */}
        <rect x="24" y="16" width="48" height="68" rx="6" fill="url(#dominoBevel)" />
        <rect x="26" y="18" width="44" height="64" rx="5" fill="url(#dominoBlackGradient)" />
        
        {/* Glossy reflection */}
        <rect x="26" y="18" width="44" height="30" rx="5" fill="url(#dominoGloss)" />
        
        {/* Gold divider line */}
        <rect x="28" y="49" width="40" height="3" rx="1" fill="url(#dominoGoldLine)" filter="url(#dominoGlow)" />
        
        {/* Top section pips (4) */}
        <circle cx="36" cy="28" r="4" fill="url(#dominoPipGold)" filter="url(#dominoGlow)" />
        <circle cx="60" cy="28" r="4" fill="url(#dominoPipGold)" filter="url(#dominoGlow)" />
        <circle cx="36" cy="42" r="4" fill="url(#dominoPipGold)" filter="url(#dominoGlow)" />
        <circle cx="60" cy="42" r="4" fill="url(#dominoPipGold)" filter="url(#dominoGlow)" />
        
        {/* Bottom section pips (3) */}
        <circle cx="36" cy="62" r="4" fill="url(#dominoPipGold)" filter="url(#dominoGlow)" />
        <circle cx="48" cy="70" r="4" fill="url(#dominoPipGold)" filter="url(#dominoGlow)" />
        <circle cx="60" cy="62" r="4" fill="url(#dominoPipGold)" filter="url(#dominoGlow)" />
        
        {/* Pip highlights */}
        <circle cx="34" cy="26" r="1.5" fill="hsl(45 93% 90% / 0.6)" />
        <circle cx="58" cy="26" r="1.5" fill="hsl(45 93% 90% / 0.6)" />
        <circle cx="34" cy="40" r="1.5" fill="hsl(45 93% 90% / 0.6)" />
        <circle cx="58" cy="40" r="1.5" fill="hsl(45 93% 90% / 0.6)" />
        <circle cx="34" cy="60" r="1.5" fill="hsl(45 93% 90% / 0.6)" />
        <circle cx="46" cy="68" r="1.5" fill="hsl(45 93% 90% / 0.6)" />
        <circle cx="58" cy="60" r="1.5" fill="hsl(45 93% 90% / 0.6)" />
      </g>
    </svg>
  </div>
);

export const BackgammonIcon = ({ className = "" }: GameIconProps) => (
  <div className={`relative group/icon ${className}`}>
    {/* Soft glow background */}
    <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl opacity-60 group-hover/icon:opacity-100 transition-opacity duration-300" />
    
    <svg 
      viewBox="0 0 100 100" 
      className="w-full h-full relative z-10 drop-shadow-[0_8px_16px_rgba(0,0,0,0.4)] transition-all duration-300 group-hover/icon:-translate-y-2 group-hover/icon:drop-shadow-[0_12px_24px_rgba(0,0,0,0.5)]"
    >
      <defs>
        {/* Gold/Ivory dice gradient */}
        <linearGradient id="bgIvoryDice" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="hsl(45 50% 95%)" />
          <stop offset="30%" stopColor="hsl(45 40% 90%)" />
          <stop offset="100%" stopColor="hsl(40 30% 80%)" />
        </linearGradient>
        <linearGradient id="bgGoldTrim" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="hsl(45 93% 70%)" />
          <stop offset="50%" stopColor="hsl(45 93% 55%)" />
          <stop offset="100%" stopColor="hsl(35 80% 40%)" />
        </linearGradient>
        <radialGradient id="bgGoldPip" cx="30%" cy="30%" r="70%">
          <stop offset="0%" stopColor="hsl(45 93% 75%)" />
          <stop offset="50%" stopColor="hsl(45 93% 55%)" />
          <stop offset="100%" stopColor="hsl(35 80% 30%)" />
        </radialGradient>
        <linearGradient id="bgDiceGloss" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="hsl(0 0% 100% / 0.6)" />
          <stop offset="40%" stopColor="hsl(0 0% 100% / 0.1)" />
          <stop offset="100%" stopColor="transparent" />
        </linearGradient>
        {/* Black obsidian dice */}
        <linearGradient id="bgObsidianDice" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="hsl(220 15% 25%)" />
          <stop offset="50%" stopColor="hsl(220 20% 12%)" />
          <stop offset="100%" stopColor="hsl(220 20% 6%)" />
        </linearGradient>
        <filter id="bgSpecular">
          <feGaussianBlur stdDeviation="0.8" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
        <filter id="bgGlowStrong">
          <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      
      {/* Ivory/Gold Dice - front */}
      <g transform="rotate(-12 35 50)">
        {/* Shadow */}
        <rect x="12" y="32" width="40" height="40" rx="6" fill="rgba(0,0,0,0.35)" transform="translate(4, 4)" />
        
        {/* Dice body */}
        <rect x="12" y="30" width="40" height="40" rx="6" fill="url(#bgIvoryDice)" stroke="url(#bgGoldTrim)" strokeWidth="1.5" />
        
        {/* 3D edge effect */}
        <rect x="14" y="32" width="36" height="36" rx="5" fill="none" stroke="hsl(40 30% 75%)" strokeWidth="0.5" />
        
        {/* Glossy highlight */}
        <rect x="14" y="32" width="36" height="18" rx="5" fill="url(#bgDiceGloss)" />
        
        {/* Specular highlight */}
        <ellipse cx="22" cy="40" rx="8" ry="4" fill="hsl(0 0% 100% / 0.4)" />
        
        {/* Gold pips - showing 5 */}
        <circle cx="22" cy="40" r="3.5" fill="url(#bgGoldPip)" filter="url(#bgSpecular)" />
        <circle cx="42" cy="40" r="3.5" fill="url(#bgGoldPip)" filter="url(#bgSpecular)" />
        <circle cx="32" cy="50" r="3.5" fill="url(#bgGoldPip)" filter="url(#bgSpecular)" />
        <circle cx="22" cy="60" r="3.5" fill="url(#bgGoldPip)" filter="url(#bgSpecular)" />
        <circle cx="42" cy="60" r="3.5" fill="url(#bgGoldPip)" filter="url(#bgSpecular)" />
        
        {/* Pip highlights */}
        <circle cx="20" cy="38" r="1.2" fill="hsl(45 93% 90% / 0.8)" />
        <circle cx="40" cy="38" r="1.2" fill="hsl(45 93% 90% / 0.8)" />
        <circle cx="30" cy="48" r="1.2" fill="hsl(45 93% 90% / 0.8)" />
        <circle cx="20" cy="58" r="1.2" fill="hsl(45 93% 90% / 0.8)" />
        <circle cx="40" cy="58" r="1.2" fill="hsl(45 93% 90% / 0.8)" />
      </g>
      
      {/* Obsidian Dice - back */}
      <g transform="rotate(18 65 45)">
        {/* Shadow */}
        <rect x="48" y="22" width="34" height="34" rx="5" fill="rgba(0,0,0,0.4)" transform="translate(3, 3)" />
        
        {/* Dice body */}
        <rect x="48" y="20" width="34" height="34" rx="5" fill="url(#bgObsidianDice)" stroke="url(#bgGoldTrim)" strokeWidth="1" />
        
        {/* Glossy highlight */}
        <rect x="50" y="22" width="30" height="14" rx="4" fill="url(#bgDiceGloss)" opacity="0.5" />
        
        {/* Specular */}
        <ellipse cx="56" cy="28" rx="6" ry="3" fill="hsl(0 0% 100% / 0.2)" />
        
        {/* Gold pips - showing 6 */}
        <circle cx="56" cy="28" r="2.8" fill="url(#bgGoldPip)" filter="url(#bgGlowStrong)" />
        <circle cx="74" cy="28" r="2.8" fill="url(#bgGoldPip)" filter="url(#bgGlowStrong)" />
        <circle cx="56" cy="37" r="2.8" fill="url(#bgGoldPip)" filter="url(#bgGlowStrong)" />
        <circle cx="74" cy="37" r="2.8" fill="url(#bgGoldPip)" filter="url(#bgGlowStrong)" />
        <circle cx="56" cy="46" r="2.8" fill="url(#bgGoldPip)" filter="url(#bgGlowStrong)" />
        <circle cx="74" cy="46" r="2.8" fill="url(#bgGoldPip)" filter="url(#bgGlowStrong)" />
        
        {/* Pip highlights */}
        <circle cx="54" cy="26" r="1" fill="hsl(45 93% 85% / 0.7)" />
        <circle cx="72" cy="26" r="1" fill="hsl(45 93% 85% / 0.7)" />
        <circle cx="54" cy="35" r="1" fill="hsl(45 93% 85% / 0.7)" />
        <circle cx="72" cy="35" r="1" fill="hsl(45 93% 85% / 0.7)" />
        <circle cx="54" cy="44" r="1" fill="hsl(45 93% 85% / 0.7)" />
        <circle cx="72" cy="44" r="1" fill="hsl(45 93% 85% / 0.7)" />
      </g>
    </svg>
  </div>
);
