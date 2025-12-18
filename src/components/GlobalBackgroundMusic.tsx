import { useLocation } from 'react-router-dom';
import { useBackgroundMusic } from '@/hooks/useBackgroundMusic';

// Routes where background music should NOT play (actual gameplay)
const GAME_ROUTES = [
  '/game/',
  '/play-ai/chess',
  '/play-ai/dominos',
  '/play-ai/backgammon',
  '/play-ai/checkers',
  '/play-ai/ludo',
];

export const GlobalBackgroundMusic = () => {
  const location = useLocation();
  
  // Check if current route is a game route
  const isGameRoute = GAME_ROUTES.some(route => 
    location.pathname.startsWith(route)
  );
  
  // Play background music on all pages except game pages
  useBackgroundMusic(!isGameRoute);
  
  return null;
};
