import { useParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { MessageSquare, Flag, Home } from "lucide-react";

const ChessGame = () => {
  const { roomId } = useParams<{ roomId: string }>();

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">
            Chess Game Room
          </h1>
          <p className="text-muted-foreground mt-1">Room ID: {roomId}</p>
        </div>

        {/* Main Layout */}
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Chess Board Placeholder */}
          <div className="flex-1">
            <div className="aspect-square bg-card border border-border rounded-lg flex items-center justify-center">
              <span className="text-muted-foreground text-lg">Chess Board</span>
            </div>
            {/* Board Action Buttons */}
            <div className="flex gap-3 mt-4">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => alert("Draw offer coming soon")}
              >
                Offer Draw
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => alert("Resign feature coming soon")}
              >
                Resign
              </Button>
            </div>
          </div>

          {/* Sidebar */}
          <div className="w-full lg:w-72 space-y-4">
            {/* Player 1 */}
            <div className="bg-card border border-border rounded-lg p-4">
              <p className="text-sm text-muted-foreground">Player 1</p>
              <p className="font-semibold text-foreground">Waiting...</p>
            </div>

            {/* Player 2 */}
            <div className="bg-card border border-border rounded-lg p-4">
              <p className="text-sm text-muted-foreground">Player 2</p>
              <p className="font-semibold text-foreground">Waiting...</p>
            </div>

            {/* Turn Indicator */}
            <div className="bg-card border border-border rounded-lg p-4 text-center">
              <p className="text-foreground font-medium">Turn: Player 1</p>
            </div>

            {/* Chat Placeholder */}
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <MessageSquare size={18} />
                <span className="text-sm">Chat (coming soon)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Buttons */}
        <div className="flex flex-col sm:flex-row justify-center gap-4 mt-8">
          <Button variant="destructive" size="lg">
            <Flag size={18} />
            Resign
          </Button>
          <Button variant="outline" size="lg" asChild>
            <Link to="/">
              <Home size={18} />
              Return to Lobby
            </Link>
          </Button>
        </div>

        {/* Game Info Box */}
        <div className="mt-10 bg-card border border-border rounded-lg p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">How It Works</h3>
          <ul className="space-y-2 text-muted-foreground text-sm">
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">•</span>
              Win by checkmate, opponent timeout, or resign.
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">•</span>
              Games can be drawn by stalemate or mutual draw agreement.
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">•</span>
              Entry fees are held in a smart contract until the result is confirmed.
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">•</span>
              Winner receives the prize pool minus a 5% platform fee.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default ChessGame;
