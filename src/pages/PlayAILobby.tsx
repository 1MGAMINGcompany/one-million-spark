import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Play, Crown } from "lucide-react";

type Difficulty = "easy" | "medium" | "hard";

interface GameConfig {
  name: string;
  emoji: string;
  path: string;
  description: string;
}

const aiGames: GameConfig[] = [
  { 
    name: "Chess vs AI", 
    emoji: "♟️", 
    path: "/play-ai/chess", 
    description: "Challenge the computer in the classic game of strategy and tactics.",
  },
  { 
    name: "Dominos vs AI", 
    emoji: "🁡", 
    path: "/play-ai/dominos", 
    description: "Test your tile-matching skills against a clever AI opponent.",
  },
  { 
    name: "Backgammon vs AI", 
    emoji: "🎲", 
    path: "/play-ai/backgammon", 
    description: "Roll the dice and outmaneuver the AI in this ancient game of skill.",
  },
];

const difficultyLabels: { value: Difficulty; label: string }[] = [
  { value: "easy", label: "EASY" },
  { value: "medium", label: "MEDIUM" },
  { value: "hard", label: "HARD" },
];

const PlayAILobby = () => {
  const navigate = useNavigate();
  const [selectedDifficulties, setSelectedDifficulties] = useState<Record<string, Difficulty>>({
    "Chess vs AI": "medium",
    "Dominos vs AI": "medium",
    "Backgammon vs AI": "medium",
  });

  const handleDifficultyChange = (gameName: string, difficulty: Difficulty) => {
    setSelectedDifficulties(prev => ({
      ...prev,
      [gameName]: difficulty,
    }));
  };

  const handlePlay = (game: GameConfig) => {
    const difficulty = selectedDifficulties[game.name];
    navigate(`${game.path}?difficulty=${difficulty}`);
  };

  return (
    <div className="min-h-screen bg-background pyramid-bg px-4 py-8">
      {/* Back Button */}
      <div className="max-w-5xl mx-auto mb-6">
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-gold">
          <Link to="/">
            <ArrowLeft size={18} />
            Back to Home
          </Link>
        </Button>
      </div>

      {/* Header */}
      <div className="text-center max-w-2xl mx-auto mb-12">
        <div className="flex items-center justify-center gap-3 mb-4">
          <Crown size={40} className="text-gold" />
          <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground">
            Play vs AI <span className="text-gold">(Free Mode)</span>
          </h1>
        </div>
        <p className="text-lg text-muted-foreground">
          Practice your skills with no wallet and no money required.
        </p>
      </div>

      {/* Game Cards Grid */}
      <div className="max-w-5xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {aiGames.map((game) => (
            <Card key={game.name} className="flex flex-col border-gold/20 bg-card/80 backdrop-blur-sm">
              <CardHeader className="text-center pb-2">
                <span className="text-5xl mb-3">{game.emoji}</span>
                <CardTitle className="text-xl font-display text-foreground">{game.name}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col flex-1 gap-5">
                <CardDescription className="text-center text-muted-foreground flex-1">
                  {game.description}
                </CardDescription>

                {/* Difficulty Selector */}
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground text-center uppercase tracking-wider">
                    Select Difficulty
                  </p>
                  <div className="flex gap-1 p-1 bg-background/50 rounded-lg border border-border/50">
                    {difficultyLabels.map(({ value, label }) => (
                      <button
                        key={value}
                        onClick={() => handleDifficultyChange(game.name, value)}
                        className={`
                          flex-1 py-2 px-2 text-xs font-semibold rounded-md transition-all duration-200
                          ${selectedDifficulties[game.name] === value
                            ? "bg-gold text-primary-foreground shadow-gold"
                            : "text-muted-foreground hover:text-foreground hover:bg-background/80"
                          }
                        `}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Play Button */}
                <Button 
                  variant="gold" 
                  className="w-full"
                  onClick={() => handlePlay(game)}
                >
                  <Play size={18} />
                  Play
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Footer Note */}
      <div className="text-center mt-12">
        <p className="text-sm text-muted-foreground">
          All AI games are free to play. No sign-up or wallet connection required.
        </p>
      </div>
    </div>
  );
};

export default PlayAILobby;
