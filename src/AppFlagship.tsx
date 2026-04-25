// Flagship app shell — shipped to 1mgaming.com / localhost / preview only.
// Contains all Solana, game, audio, and multiplayer routing.
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
import PolymarketUpgradeBanner from "./components/PolymarketUpgradeBanner";
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
import FightPredictions from "./pages/FightPredictions";
import FightPredictionAdmin from "./pages/FightPredictionAdmin";
import MatchCenter from "./pages/MatchCenter";
import ReferralAdmin from "./pages/ReferralAdmin";
import PlatformAdminPage from "./pages/platform/PlatformAdmin";
import DebugHUD from "./components/DebugHUD";
import { isDebugEnabled } from "@/lib/debugLog";
import { useReferralCapture } from "@/hooks/useReferralCapture";
import { useWallet } from "@/hooks/useWallet";

// DEV-ONLY: Import to auto-run config check on app load
import "./lib/devConfigCheck";

/**
 * Catches Supabase auth hash on "/" (errors OR successful magic-link tokens)
 * and forwards to /predictions/admin so AdminAuth can pick up the session.
 */
function AuthHashRedirect({ children }: { children: React.ReactNode }) {
  const hash = typeof window !== "undefined" ? window.location.hash : "";
  const looksLikeAuthHash =
    hash &&
    (hash.includes("access_token=") ||
      hash.includes("error=") ||
      hash.includes("type=magiclink") ||
      hash.includes("type=recovery"));

  if (looksLikeAuthHash) {
    const adminPath = "/predictions/admin";
    if (!window.location.pathname.startsWith(adminPath)) {
      window.location.replace(`${adminPath}${hash}`);
      return null;
    }
  }
  return <>{children}</>;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 1,
    },
  },
});

// visualViewport fallback for mobile browsers
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

const AppContent = () => {
  const location = useLocation();
  const { address } = useWallet();
  useVisualViewportHeight();
  useReferralCapture(address);
  const page = location.pathname === "/"
    ? "home"
    : location.pathname.startsWith("/play-ai/")
    ? location.pathname.replace("/play-ai/", "ai-")
    : location.pathname.startsWith("/play/")
    ? "multiplayer"
    : location.pathname.startsWith("/room/")
    ? "room"
    : location.pathname.replace("/", "") || "home";
  const game = location.pathname.startsWith("/play-ai/")
    ? location.pathname.replace("/play-ai/", "")
    : undefined;
  usePresenceHeartbeat(page, game);

  const hideFooter = location.pathname.startsWith('/play/') ||
                     location.pathname.startsWith('/room/');

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <PolymarketUpgradeBanner />
      <GlobalActiveRoomBanner />
      <main className="pt-16 relative flex-1 min-h-[calc(100dvh-4rem)]">
        <Routes>
          <Route path="/" element={<AuthHashRedirect><Home /></AuthHashRedirect>} />
          <Route path="/add-funds" element={<AddFunds />} />
          <Route path="/create-room" element={<CreateRoom />} />
          <Route path="/room-list" element={<RoomList />} />
          <Route path="/room/:roomPda" element={<RoomRouter />} />
          <Route path="/play/:roomPda" element={<PlayRoom />} />
          <Route path="/join" element={<JoinRoom />} />
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
          <Route path="/predictions" element={<FightPredictions />} />
          <Route path="/predictions/:fightId" element={<MatchCenter />} />
          <Route path="/predictions/admin" element={<FightPredictionAdmin />} />
          <Route path="/referrals/admin" element={<ReferralAdmin />} />
          <Route path="/admin/platform" element={<PlatformAdminPage />} />
          <Route path="/debug/join" element={isDebugEnabled() ? <DebugJoinRoom /> : <Navigate to="/" replace />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      {!hideFooter && <Footer />}
      {isDebugEnabled() && <DebugHUD />}
    </div>
  );
};

export default function AppFlagship() {
  return (
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
}
