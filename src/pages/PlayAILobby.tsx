import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bot, ArrowLeft } from "lucide-react";

const aiGames = [
  { name: "Chess", emoji: "♟️", path: "/play-ai/chess", available: true },
  { name: "Dominos", emoji: "🁢", path: "#", available: false },
  { name: "Backgammon", emoji: "🎲", path: "#", available: false },
];

const PlayAILobby = () => {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center px-4 py-12">
      {/* Header */}
      <div className="w-full max-w-3xl mb-8">
        <Button asChild variant="ghost" size="sm">
          <Link to="/">
            <ArrowLeft size={18} />
            Back to Home
          </Link>
        </Button>
      </div>

      {/* Hero Section */}
      <div className="text-center max-w-2xl mb-12">
        <div className="flex items-center justify-center gap-3 mb-4">
          <Bot size={48} className="text-primary" />
          <h1 className="text-4xl md:text-5xl font-bold text-foreground">
            Play vs AI
          </h1>
        </div>
        <p className="text-lg text-muted-foreground">
          Practice your skills against our AI opponents. No wallet required, completely free!
        </p>
      </div>

      {/* Game Selection */}
      <div className="w-full max-w-3xl">
        <h2 className="text-2xl font-semibold text-foreground text-center mb-6">
          Choose a Game
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {aiGames.map((game) => (
            <Card 
              key={game.name} 
              className={`text-center ${!game.available ? 'opacity-60' : ''}`}
            >
              <CardContent className="pt-6 pb-4 flex flex-col items-center gap-3">
                <span className="text-5xl">{game.emoji}</span>
                <h3 className="text-xl font-medium text-foreground">{game.name}</h3>
                {game.available ? (
                  <Button asChild size="sm">
                    <Link to={game.path}>Play vs AI</Link>
                  </Button>
                ) : (
                  <Button size="sm" variant="secondary" disabled>
                    Coming Soon
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Info Note */}
      <div className="mt-12 text-center text-muted-foreground text-sm max-w-md">
        <p>
          AI mode is free and doesn't require a wallet connection. 
          Ready to compete for real? Check out our <Link to="/room-list" className="text-primary underline">public rooms</Link>.
        </p>
      </div>
    </div>
  );
};

export default PlayAILobby;
