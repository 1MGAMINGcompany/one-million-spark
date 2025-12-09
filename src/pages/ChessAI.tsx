import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bot, ArrowLeft, Send, RotateCcw, Flag } from "lucide-react";

const fakeMoves = [
  { number: 1, white: "e2 → e4", black: "e7 → e5" },
  { number: 2, white: "Ng1 → f3", black: "Nb8 → c6" },
  { number: 3, white: "Bf1 → b5", black: "..." },
];

const ChessAI = () => {
  const handleNewGame = () => {
    alert("New game coming soon");
  };

  const handleResign = () => {
    alert("Resign coming soon");
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header Bar */}
      <div className="bg-card border-b border-border px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button asChild variant="ghost" size="sm">
              <Link to="/play-ai">
                <ArrowLeft size={18} />
                Back
              </Link>
            </Button>
            <div className="flex items-center gap-2">
              <Bot size={20} className="text-primary" />
              <h1 className="text-lg font-semibold text-foreground">
                Chess vs AI
              </h1>
            </div>
          </div>
          <div className="text-muted-foreground text-sm">
            You (White) vs AI (Black)
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Chess Board */}
          <div className="lg:col-span-2 space-y-4">
            {/* Board Placeholder */}
            <div className="aspect-square bg-muted rounded-lg border border-border flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <span className="text-6xl mb-4 block">♟️</span>
                <p className="text-lg font-medium">Chess Board Placeholder</p>
                <p className="text-sm">AI opponent integration coming soon</p>
              </div>
            </div>

            {/* Turn Timer */}
            <div className="bg-card rounded-lg border border-border p-4 text-center">
              <p className="text-foreground font-medium">
                Your Turn – <span className="text-primary">No time limit</span>
              </p>
            </div>
          </div>

          {/* Right Column - Game Info */}
          <div className="space-y-4">
            {/* Turn Info */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Turn Info</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Turn: <span className="text-foreground font-medium">You (White)</span>
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  AI Difficulty: Medium
                </p>
              </CardContent>
            </Card>

            {/* Move List */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Move History</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-40 overflow-y-auto space-y-1 text-sm">
                  {fakeMoves.map((move) => (
                    <div key={move.number} className="flex gap-4 text-muted-foreground">
                      <span className="w-6 text-foreground font-medium">{move.number}.</span>
                      <span className="flex-1">{move.white}</span>
                      <span className="flex-1">{move.black}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Chat Section */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Bot size={16} />
                  AI Messages
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="bg-muted rounded-lg p-3 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground mb-1">AI:</p>
                  <p>Good luck! I'll try my best to challenge you.</p>
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  AI chat coming soon
                </p>
              </CardContent>
            </Card>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <Button 
                variant="outline" 
                className="flex-1"
                onClick={handleNewGame}
              >
                <RotateCcw size={16} />
                New Game
              </Button>
              <Button 
                variant="destructive" 
                className="flex-1"
                onClick={handleResign}
              >
                <Flag size={16} />
                Resign
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChessAI;
