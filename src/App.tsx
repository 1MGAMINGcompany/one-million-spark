import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Web3Provider } from "./components/Web3Provider";
import { LoadingProvider } from "./contexts/LoadingContext";
import { AudioProvider } from "./contexts/AudioContext";
import { SoundProvider } from "./contexts/SoundContext";
import Navbar from "./components/Navbar";
import PyramidLoader from "./components/PyramidLoader";
import GoldenParticles from "./components/GoldenParticles";
import Home from "./pages/Home";
import AddFunds from "./pages/AddFunds";
import CreateRoom from "./pages/CreateRoom";
import RoomList from "./pages/RoomList";
import ChessGame from "./pages/ChessGame";
import DominosGame from "./pages/DominosGame";
import BackgammonGame from "./pages/BackgammonGame";
import PlayAILobby from "./pages/PlayAILobby";
import ChessAI from "./pages/ChessAI";
import DominosAI from "./pages/DominosAI";
import BackgammonAI from "./pages/BackgammonAI";
import Room from "./pages/Room";
import JoinRoom from "./pages/JoinRoom";
import NotFound from "./pages/NotFound";

const App = () => (
  <Web3Provider>
    <LoadingProvider>
      <AudioProvider>
        <SoundProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <PyramidLoader />
            <GoldenParticles />
            <BrowserRouter>
              <Navbar />
              <main className="pt-16 relative min-h-screen">
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
                  <Route path="/play-ai" element={<PlayAILobby />} />
                  <Route path="/play-ai/chess" element={<ChessAI />} />
                  <Route path="/play-ai/dominos" element={<DominosAI />} />
                  <Route path="/play-ai/backgammon" element={<BackgammonAI />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </main>
            </BrowserRouter>
          </TooltipProvider>
        </SoundProvider>
      </AudioProvider>
    </LoadingProvider>
  </Web3Provider>
);

export default App;
