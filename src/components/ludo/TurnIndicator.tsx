import { memo } from "react";
import { useTranslation } from "react-i18next";
import { PlayerColor } from "./ludoTypes";

interface TurnIndicatorProps {
  currentPlayer: PlayerColor;
  isAI: boolean;
  isGameOver: boolean;
  winner: PlayerColor | null;
}

const PLAYER_COLORS: Record<PlayerColor, string> = {
  gold: "from-amber-400 to-yellow-600",
  ruby: "from-red-400 to-rose-600",
  emerald: "from-emerald-400 to-green-600",
  sapphire: "from-blue-400 to-indigo-600",
};

const PLAYER_ICONS: Record<PlayerColor, string> = {
  gold: "👑",
  ruby: "🐺",
  emerald: "🐱",
  sapphire: "🦅",
};

const TurnIndicator = memo(({ 
  currentPlayer, 
  isAI, 
  isGameOver, 
  winner 
}: TurnIndicatorProps) => {
  const { t } = useTranslation();

  const getPlayerName = (color: PlayerColor) => t(`gameAI.${color}Player`);
  const getDeityName = (color: PlayerColor) => t(`gameAI.${color}Deity`);

  if (isGameOver && winner) {
    return (
      <div className="flex items-center justify-center gap-3 py-3">
        {/* Scarab victory icon */}
        <div className="relative">
          <span className="text-2xl sm:text-3xl animate-bounce">🏆</span>
          <div className="absolute -inset-2 bg-primary/20 rounded-full blur-md animate-pulse" />
        </div>
        
        <div className="flex flex-col items-center">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">{t('game.victory')}</span>
          <div className="flex items-center gap-2">
            <span className="text-xl">{PLAYER_ICONS[winner]}</span>
            <span 
              className={`text-xl sm:text-2xl font-display font-bold bg-gradient-to-r ${PLAYER_COLORS[winner]} bg-clip-text text-transparent`}
            >
              {winner === "gold" ? t('gameAI.youWin') : `${getPlayerName(winner)} ${t('gameAI.wins')}`}
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
        <span className="text-lg">{PLAYER_ICONS[currentPlayer]}</span>
      </div>
      
      <div className="flex flex-col items-center">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
          {isAI ? t('gameAI.aiTurn') : t('game.yourTurn')}
        </span>
        <span 
          className={`text-sm font-display font-semibold bg-gradient-to-r ${PLAYER_COLORS[currentPlayer]} bg-clip-text text-transparent`}
        >
          {getDeityName(currentPlayer)}
        </span>
      </div>
    </div>
  );
});

TurnIndicator.displayName = 'TurnIndicator';

export default TurnIndicator;
