// App Root
import { useEffect } from "react";
import { usePresenceHeartbeat } from "@/hooks/usePresenceHeartbeat";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { SolanaProvider } from "./components/SolanaProvider";
import { PrivyProviderWrapper } from "./components/PrivyProviderWrapper";
import { LoadingProvider } from "./contexts/LoadingContext";
import { AudioProvider } from "./contexts/AudioContext";
import { SoundProvider } from "./contexts/SoundContext";
import { TxLockProvider } from "./contexts/TxLockContext";
import { GlobalBackgroundMusic } from "./components/GlobalBackgroundMusic";
import { GlobalActiveRoomBanner } from "./components/GlobalActiveRoomBanner";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import PyramidLoader from "./components/PyramidLoader";
import GoldenParticles from "./components/GoldenParticles";
import Home from "./pages/Home";
import AddFunds from "./pages/AddFunds";
import CreateRoom from "./pages/CreateRoom";
import RoomList from "./pages/RoomList";
import RoomRouter from "./pages/RoomRouter";
import PlayRoom from "./pages/PlayRoom";
import { GameRedirect } from "./components/GameRedirect";
import PlayAILobby from "./pages/PlayAILobby";
import QuickMatch from "./pages/QuickMatch";
import ChessAI from "./pages/ChessAI";
import DominosAI from "./pages/DominosAI";
import BackgammonAI from "./pages/BackgammonAI";
import CheckersAI from "./pages/CheckersAI";
import LudoAI from "./pages/LudoAI";
import JoinRoom from "./pages/JoinRoom";
import GameRules from "./pages/GameRules";
import Support from "./pages/Support";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";
import NotFound from "./pages/NotFound";
import PlayerProfile from "./pages/PlayerProfile";
import Leaderboard from "./pages/Leaderboard";
import MatchShareCard from "./pages/MatchShareCard";
import AgeConfirmation from "./components/AgeConfirmation";
import DebugJoinRoom from "./pages/DebugJoinRoom";
import HelpCenter from "./pages/HelpCenter";
import HelpArticle from "./pages/HelpArticle";
import DebugHUD from "./components/DebugHUD";
import AIAgentHelperOverlay from "./components/AIAgentHelperOverlay";
import { isDebugEnabled } from "@/lib/debugLog";

// DEV-ONLY: Import to auto-run config check on app load
import "./lib/devConfigCheck";

// Create QueryClient instance outside component to prevent recreation on re-renders
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      retry: 1,
    },
  },
});

// PART D: visualViewport fallback for mobile browsers
function useVisualViewportHeight() {
  useEffect(() => {
    function setVVH() {
      const h = window.visualViewport?.height || window.innerHeight;
      document.documentElement.style.setProperty('--vvh', `${h}px`);
    }
    window.visualViewport?.addEventListener('resize', setVVH);
    window.addEventListener('resize', setVVH);
    setVVH();
    return () => {
      window.visualViewport?.removeEventListener('resize', setVVH);
      window.removeEventListener('resize', setVVH);
    };
  }, []);
}

// PART E: App content with conditional footer
const AppContent = () => {
  const location = useLocation();
  useVisualViewportHeight();
  // Global presence heartbeat — fires for every visitor on every page.
  // AI game pages augment this with useAIGameTracker (same session_id, richer metadata).
  const page = location.pathname === "/"
    ? "home"
    : location.pathname.startsWith("/play-ai/")
    ? location.pathname.replace("/play-ai/", "ai-")
    : location.pathname.startsWith("/play/")
    ? "multiplayer"
    : location.pathname.startsWith("/room/")
    ? "room"
    : location.pathname.replace("/", "") || "home";
  usePresenceHeartbeat(page);
  
  // Hide footer on game/play routes to maximize vertical space
  const hideFooter = location.pathname.startsWith('/play/') || 
                     location.pathname.startsWith('/room/');

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <GlobalActiveRoomBanner />
      <main className="pt-16 relative flex-1 min-h-[calc(100dvh-4rem)]">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/add-funds" element={<AddFunds />} />
          <Route path="/create-room" element={<CreateRoom />} />
          <Route path="/room-list" element={<RoomList />} />
          {/* Canonical routes: PDA is the ONLY source of truth */}
          <Route path="/room/:roomPda" element={<RoomRouter />} />
          {/* Canonical play route - game type from on-chain data ONLY */}
          <Route path="/play/:roomPda" element={<PlayRoom />} />
          <Route path="/join" element={<JoinRoom />} />
          {/* Legacy routes redirect to canonical /room/:pda - slug is IGNORED */}
          <Route path="/game/:slug/:roomPda" element={<GameRedirect />} />
          <Route path="/play-ai" element={<PlayAILobby />} />
          <Route path="/quick-match" element={<QuickMatch />} />
          <Route path="/play-ai/chess" element={<ChessAI />} />
          <Route path="/play-ai/dominos" element={<DominosAI />} />
          <Route path="/play-ai/backgammon" element={<BackgammonAI />} />
          <Route path="/play-ai/checkers" element={<CheckersAI />} />
          <Route path="/play-ai/ludo" element={<LudoAI />} />
          <Route path="/game-rules" element={<GameRules />} />
          <Route path="/support" element={<Support />} />
          <Route path="/help" element={<HelpCenter />} />
          <Route path="/help/:slug" element={<HelpArticle />} />
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
          <Route path="/terms-of-service" element={<TermsOfService />} />
          <Route path="/terms" element={<Navigate to="/terms-of-service" replace />} />
          <Route path="/match/:roomPda" element={<MatchShareCard />} />
          <Route path="/player/:wallet" element={<PlayerProfile />} />
          <Route path="/leaderboard/:game" element={<Leaderboard />} />
          <Route path="/debug/join" element={isDebugEnabled() ? <DebugJoinRoom /> : <Navigate to="/" replace />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      {!hideFooter && <Footer />}
      <AIAgentHelperOverlay />
      {isDebugEnabled() && <DebugHUD />}
    </div>
  );
};

const App = () => (
  <AppErrorBoundary>
    <PrivyProviderWrapper>
      <QueryClientProvider client={queryClient}>
        <SolanaProvider>
          <TxLockProvider>
            <LoadingProvider>
              <AudioProvider>
                <SoundProvider>
                  <TooltipProvider>
                    <Toaster />
                    <Sonner />
                    <PyramidLoader />
                    <GoldenParticles />
                    <AgeConfirmation />
                    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                      <GlobalBackgroundMusic />
                      <AppContent />
                    </BrowserRouter>
                  </TooltipProvider>
                </SoundProvider>
              </AudioProvider>
            </LoadingProvider>
          </TxLockProvider>
        </SolanaProvider>
      </QueryClientProvider>
    </PrivyProviderWrapper>
  </AppErrorBoundary>
);

export default App;
