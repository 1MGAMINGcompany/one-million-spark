import { useParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Home } from "lucide-react";

const fakeMoves = [
  { move: 1, white: "e2 → e4", black: "e7 → e5" },
  { move: 2, white: "Ng1 → f3", black: "Nb8 → c6" },
  { move: 3, white: "Bf1 → c4", black: "..." },
];

const ChessGame = () => {
  const { roomId } = useParams<{ roomId: string }>();

  return (
    <div className="min-h-screen bg-background px-4 py-6">
      <div className="max-w-6xl mx-auto">
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6 bg-card border border-border rounded-lg p-4">
          <h1 className="text-xl font-bold text-foreground">
            Chess – Room #{roomId}
          </h1>
          <p className="text-muted-foreground text-sm">
            Player A vs Player B
          </p>
        </div>

        {/* Main Layout */}
        <div className="flex flex-col lg:flex-row gap-6">
          {/* LEFT COLUMN - Chess Board */}
          <div className="flex-1">
            <div className="aspect-square bg-card border border-border rounded-lg flex items-center justify-center">
              <span className="text-muted-foreground text-lg">Chess Board Placeholder</span>
            </div>
            <div className="mt-3 text-center">
              <p className="text-foreground font-medium">Your Turn – 15s remaining</p>
            </div>
          </div>

          {/* RIGHT COLUMN - Info Panels */}
          <div className="w-full lg:w-80 space-y-4">
            {/* Turn Info */}
            <div className="bg-card border border-border rounded-lg p-4">
              <h3 className="text-sm font-semibold text-muted-foreground mb-2">Turn Info</h3>
              <p className="text-foreground font-medium">Turn: Player X (White)</p>
            </div>

            {/* Move List */}
            <div className="bg-card border border-border rounded-lg p-4">
              <h3 className="text-sm font-semibold text-muted-foreground mb-2">Move List</h3>
              <div className="h-32 overflow-y-auto space-y-1 text-sm">
                {fakeMoves.map((m) => (
                  <div key={m.move} className="flex gap-2 text-foreground">
                    <span className="text-muted-foreground w-6">{m.move}.</span>
                    <span className="flex-1">{m.white}</span>
                    <span className="flex-1">{m.black}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Chat */}
            <div className="bg-card border border-border rounded-lg p-4">
              <h3 className="text-sm font-semibold text-muted-foreground mb-2">Chat (coming soon)</h3>
              <div className="h-20 bg-muted/30 rounded mb-2"></div>
              <div className="flex gap-2">
                <Textarea
                  placeholder="Type a message..."
                  className="resize-none h-10 min-h-0"
                  disabled
                />
                <Button size="sm" disabled>Send</Button>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
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
                onClick={() => alert("Resign coming soon")}
              >
                Resign
              </Button>
            </div>
          </div>
        </div>

        {/* Back to Lobby */}
        <div className="flex justify-center mt-8">
          <Button variant="outline" size="lg" asChild>
            <Link to="/">
              <Home size={18} />
              Return to Lobby
            </Link>
          </Button>
        </div>

        {/* Game Info Box */}
        <div className="mt-8 bg-card border border-border rounded-lg p-6">
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
