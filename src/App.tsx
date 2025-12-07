import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Web3Provider } from "./components/Web3Provider";
import Navbar from "./components/Navbar";
import Home from "./pages/Home";
import AddFunds from "./pages/AddFunds";
import CreateRoom from "./pages/CreateRoom";
import RoomList from "./pages/RoomList";
import ChessGame from "./pages/ChessGame";
import NotFound from "./pages/NotFound";

const App = () => (
  <Web3Provider>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Navbar />
        <div className="pt-16">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/add-funds" element={<AddFunds />} />
            <Route path="/create-room" element={<CreateRoom />} />
            <Route path="/room-list" element={<RoomList />} />
            <Route path="/game/chess/:roomId" element={<ChessGame />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </div>
      </BrowserRouter>
    </TooltipProvider>
  </Web3Provider>
);

export default App;
