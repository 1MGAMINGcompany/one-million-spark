import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Bot, ArrowLeft, Play } from "lucide-react";

const aiGames = [
  { 
    name: "Chess vs AI", 
    emoji: "♟️", 
    path: "/play-ai/chess", 
    description: "Play Chess against a basic computer opponent. No crypto, no signup.",
    available: true 
  },
];

const PlayAILobby = () => {
  return (
    <div className="min-h-screen bg-background px-4 py-8">
      {/* Back Button */}
      <div className="max-w-4xl mx-auto mb-6">
        <Button asChild variant="ghost" size="sm">
          <Link to="/">
            <ArrowLeft size={18} />
            Back to Home
          </Link>
        </Button>
      </div>

      {/* Header */}
      <div className="text-center max-w-2xl mx-auto mb-12">
        <div className="flex items-center justify-center gap-3 mb-4">
          <Bot size={40} className="text-primary" />
          <h1 className="text-3xl md:text-4xl font-bold text-foreground">
            Play vs AI (Free Mode)
          </h1>
        </div>
        <p className="text-lg text-muted-foreground">
          Practice your skills with no wallet and no money required.
        </p>
      </div>

      {/* Game Cards Grid */}
      <div className="max-w-4xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {aiGames.map((game) => (
            <Card key={game.name} className="flex flex-col">
              <CardHeader className="text-center pb-2">
                <span className="text-5xl mb-2">{game.emoji}</span>
                <CardTitle className="text-xl">{game.name}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col flex-1 gap-4">
                <CardDescription className="text-center flex-1">
                  {game.description}
                </CardDescription>
                <Button asChild className="w-full">
                  <Link to={game.path}>
                    <Play size={18} />
                    Play
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PlayAILobby;
