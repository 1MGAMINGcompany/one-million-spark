import { memo } from "react";
import { PlayerColor } from "./ludoTypes";

interface TurnIndicatorProps {
  currentPlayer: PlayerColor;
  isAI: boolean;
  isGameOver: boolean;
  winner: PlayerColor | null;
}

const PLAYER_NAMES: Record<PlayerColor, { name: string; deity: string; icon: string }> = {
  gold: { name: "Gold", deity: "Pharaoh", icon: "👑" },
  ruby: { name: "Ruby", deity: "Anubis", icon: "🐺" },
  emerald: { name: "Emerald", deity: "Bastet", icon: "🐱" },
  sapphire: { name: "Sapphire", deity: "Horus", icon: "🦅" },
};

const PLAYER_COLORS: Record<PlayerColor, string> = {
  gold: "from-amber-400 to-yellow-600",
  ruby: "from-red-400 to-rose-600",
  emerald: "from-emerald-400 to-green-600",
  sapphire: "from-blue-400 to-indigo-600",
};

const TurnIndicator = memo(({ 
  currentPlayer, 
  isAI, 
  isGameOver, 
  winner 
}: TurnIndicatorProps) => {
  const playerInfo = PLAYER_NAMES[currentPlayer];
  const winnerInfo = winner ? PLAYER_NAMES[winner] : null;

  if (isGameOver && winnerInfo) {
    return (
      <div className="flex items-center justify-center gap-3 py-3">
        {/* Scarab victory icon */}
        <div className="relative">
          <span className="text-2xl sm:text-3xl animate-bounce">🏆</span>
          <div className="absolute -inset-2 bg-primary/20 rounded-full blur-md animate-pulse" />
        </div>
        
        <div className="flex flex-col items-center">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">Victory!</span>
          <div className="flex items-center gap-2">
            <span className="text-xl">{winnerInfo.icon}</span>
            <span 
              className={`text-xl sm:text-2xl font-display font-bold bg-gradient-to-r ${PLAYER_COLORS[winner!]} bg-clip-text text-transparent`}
            >
              {winner === "gold" ? "You Win!" : `${winnerInfo.name} Wins!`}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-col items-center justify-center gap-2 py-2">
      {/* Player icon */}
      <div 
        className={`
          w-10 h-10 rounded-full
          bg-gradient-to-br ${PLAYER_COLORS[currentPlayer]}
          flex items-center justify-center
          shadow-lg
          ${!isAI ? 'ring-2 ring-primary ring-offset-1 ring-offset-background' : ''}
        `}
      >
        <span className="text-lg">{playerInfo.icon}</span>
      </div>
      
      <div className="flex flex-col items-center">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
          {isAI ? "AI's Turn" : "Your Turn"}
        </span>
        <span 
          className={`text-sm font-display font-semibold bg-gradient-to-r ${PLAYER_COLORS[currentPlayer]} bg-clip-text text-transparent`}
        >
          {playerInfo.deity}
        </span>
      </div>
    </div>
  );
});

TurnIndicator.displayName = 'TurnIndicator';

export default TurnIndicator;
