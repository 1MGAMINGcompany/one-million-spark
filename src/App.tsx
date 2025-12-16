import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Web3Provider } from "./components/Web3Provider";
import { LoadingProvider } from "./contexts/LoadingContext";
import { AudioProvider } from "./contexts/AudioContext";
import { SoundProvider } from "./contexts/SoundContext";
import { useContractValidation, ROOMMANAGER_V7_ADDRESS } from "./hooks/useContractValidation";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import PyramidLoader from "./components/PyramidLoader";
import GoldenParticles from "./components/GoldenParticles";
import Home from "./pages/Home";
import AddFunds from "./pages/AddFunds";
import CreateRoom from "./pages/CreateRoom";
import RoomList from "./pages/RoomList";
import ChessGame from "./pages/ChessGame";
import DominosGame from "./pages/DominosGame";
import BackgammonGame from "./pages/BackgammonGame";
import CheckersGame from "./pages/CheckersGame";
import LudoGame from "./pages/LudoGame";
import PlayAILobby from "./pages/PlayAILobby";
import ChessAI from "./pages/ChessAI";
import DominosAI from "./pages/DominosAI";
import BackgammonAI from "./pages/BackgammonAI";
import CheckersAI from "./pages/CheckersAI";
import LudoAI from "./pages/LudoAI";
import Room from "./pages/Room";
import JoinRoom from "./pages/JoinRoom";
import GameRules from "./pages/GameRules";
import Support from "./pages/Support";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";
import NotFound from "./pages/NotFound";
import AgeConfirmation from "./components/AgeConfirmation";

// Log contract address on app start
console.log("RoomManager address:", ROOMMANAGER_V7_ADDRESS);

// Inner component that runs validation
const AppContent = () => {
  const { isValidContract, error } = useContractValidation();
  
  if (error) {
    return (
      <div className="min-h-screen bg-destructive/10 flex items-center justify-center p-4">
        <div className="bg-card border border-destructive rounded-lg p-8 max-w-lg text-center">
          <h1 className="text-2xl font-bold text-destructive mb-4">Fatal Error</h1>
          <p className="text-foreground">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Toaster />
      <Sonner />
      <PyramidLoader />
      <GoldenParticles />
      <AgeConfirmation />
      <BrowserRouter>
        <div className="flex flex-col min-h-screen">
          <Navbar />
          <main className="pt-16 relative flex-1">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/add-funds" element={<AddFunds />} />
              <Route path="/create-room" element={<CreateRoom />} />
              <Route path="/room-list" element={<RoomList />} />
              <Route path="/room/:roomId" element={<Room />} />
              <Route path="/join" element={<JoinRoom />} />
              <Route path="/game/chess/:roomId" element={<ChessGame />} />
              <Route path="/game/dominos/:roomId" element={<DominosGame />} />
              <Route path="/game/backgammon/:roomId" element={<BackgammonGame />} />
              <Route path="/game/checkers/:roomId" element={<CheckersGame />} />
              <Route path="/game/ludo/:roomId" element={<LudoGame />} />
              <Route path="/play-ai" element={<PlayAILobby />} />
              <Route path="/play-ai/chess" element={<ChessAI />} />
              <Route path="/play-ai/dominos" element={<DominosAI />} />
              <Route path="/play-ai/backgammon" element={<BackgammonAI />} />
              <Route path="/play-ai/checkers" element={<CheckersAI />} />
              <Route path="/play-ai/ludo" element={<LudoAI />} />
              <Route path="/game-rules" element={<GameRules />} />
              <Route path="/support" element={<Support />} />
              <Route path="/privacy-policy" element={<PrivacyPolicy />} />
              <Route path="/terms-of-service" element={<TermsOfService />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </main>
          <Footer />
        </div>
      </BrowserRouter>
    </>
  );
};
const App = () => (
  <Web3Provider>
    <LoadingProvider>
      <AudioProvider>
        <SoundProvider>
          <TooltipProvider>
            <AppContent />
          </TooltipProvider>
        </SoundProvider>
      </AudioProvider>
    </LoadingProvider>
  </Web3Provider>
);

export default App;
