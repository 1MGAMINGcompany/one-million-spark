import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Play, Gem, Star } from "lucide-react";

type Difficulty = "easy" | "medium" | "hard";

interface GameConfig {
  name: string;
  emoji: string;
  path: string;
  description: string;
}

const aiGames: GameConfig[] = [
  { 
    name: "Chess", 
    emoji: "♟️", 
    path: "/play-ai/chess", 
    description: "Master the ancient art of strategy and tactical thinking.",
  },
  { 
    name: "Dominos", 
    emoji: "🁡", 
    path: "/play-ai/dominos", 
    description: "Perfect your tile-matching prowess and numerical mastery.",
  },
  { 
    name: "Backgammon", 
    emoji: "🎲", 
    path: "/play-ai/backgammon", 
    description: "Hone your skills in this timeless game of calculated moves.",
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
    "Chess": "medium",
    "Dominos": "medium",
    "Backgammon": "medium",
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
    <div className="min-h-screen bg-background">
      {/* Hero Section with Pyramid Background */}
      <section className="relative py-16 overflow-hidden">
        {/* Background gradient and pyramid silhouette */}
        <div className="absolute inset-0 bg-gradient-to-b from-midnight-light via-background to-background" />
        <div 
          className="absolute inset-0 opacity-10"
          style={{
            background: "linear-gradient(to top, hsl(45 93% 54% / 0.2) 0%, transparent 50%)",
          }}
        />
        {/* Decorative pyramid shapes */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div 
            className="absolute w-[400px] h-[300px] opacity-5"
            style={{
              background: "linear-gradient(to top, hsl(45 93% 54% / 0.3) 0%, transparent 70%)",
              clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)"
            }}
          />
        </div>
        
        <div className="relative z-10 max-w-4xl mx-auto px-4">
          {/* Back Button */}
          <div className="mb-8">
            <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-primary group">
              <Link to="/" className="flex items-center gap-2">
                <ArrowLeft size={18} className="group-hover:text-primary transition-colors" />
                Back to Home
              </Link>
            </Button>
          </div>

          {/* Title Area */}
          <div className="text-center">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="h-px w-12 bg-gradient-to-r from-transparent to-primary/50" />
              <Gem className="w-5 h-5 text-primary" />
              <div className="h-px w-12 bg-gradient-to-l from-transparent to-primary/50" />
            </div>
            
            <h1 className="text-4xl md:text-5xl font-display font-bold tracking-wide mb-4">
              <span 
                style={{
                  background: "linear-gradient(135deg, #FCE68A 0%, #FACC15 50%, #AB8215 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                Temple of Practice
              </span>
            </h1>
            
            <p className="text-lg md:text-xl text-muted-foreground max-w-xl mx-auto">
              Train your mind in the arts of strategy. No pressure, no stakes — pure skill refinement.
            </p>

            <div className="flex items-center justify-center gap-3 mt-6">
              <Star className="w-3 h-3 text-primary/40 fill-primary/20" />
              <span className="text-xs text-muted-foreground/60 uppercase tracking-[0.2em]">Free Practice Mode</span>
              <Star className="w-3 h-3 text-primary/40 fill-primary/20" />
            </div>
          </div>
        </div>
      </section>

      {/* Game Cards Section */}
      <section className="py-12 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {aiGames.map((game) => (
              <div 
                key={game.name} 
                className="group relative"
              >
                {/* Card glow effect on hover */}
                <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20 rounded-2xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                
                {/* Main Card */}
                <div 
                  className="relative bg-gradient-to-br from-midnight-light via-card to-background border border-primary/20 rounded-xl p-6 transition-all duration-300 group-hover:border-primary/40 group-hover:-translate-y-1 group-hover:shadow-[0_0_30px_-5px_hsl(45_93%_54%_/_0.3)]"
                >
                  {/* Corner accent */}
                  <div className="absolute top-3 right-3">
                    <div 
                      className="w-4 h-4 opacity-40 group-hover:opacity-70 transition-opacity"
                      style={{
                        background: "linear-gradient(to top, hsl(45 93% 54%) 0%, hsl(45 90% 65%) 100%)",
                        clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)"
                      }}
                    />
                  </div>

                  {/* Game emoji */}
                  <div className="text-center mb-4">
                    <span className="text-6xl drop-shadow-lg">{game.emoji}</span>
                  </div>

                  {/* Game name */}
                  <h2 
                    className="text-2xl font-display font-bold text-center mb-2"
                    style={{
                      background: "linear-gradient(135deg, #FCE68A 0%, #FACC15 50%, #AB8215 100%)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      backgroundClip: "text",
                    }}
                  >
                    {game.name}
                  </h2>

                  {/* Description */}
                  <p className="text-sm text-muted-foreground text-center mb-6">
                    {game.description}
                  </p>

                  {/* Difficulty Selector */}
                  <div className="space-y-2 mb-5">
                    <p className="text-xs text-primary/60 text-center uppercase tracking-wider font-medium">
                      Select Difficulty
                    </p>
                    <div className="flex gap-1 p-1 bg-background/50 rounded-lg border border-primary/20">
                      {difficultyLabels.map(({ value, label }) => (
                        <button
                          key={value}
                          onClick={() => handleDifficultyChange(game.name, value)}
                          className={`
                            flex-1 py-2.5 px-2 text-xs font-bold rounded-md transition-all duration-200
                            ${selectedDifficulties[game.name] === value
                              ? "bg-gradient-to-r from-primary to-gold text-primary-foreground shadow-[0_0_12px_-2px_hsl(45_93%_54%_/_0.5)]"
                              : "text-muted-foreground hover:text-primary hover:bg-primary/5"
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
                    className="w-full group/btn border border-primary/30 hover:border-primary/60 transition-all"
                    onClick={() => handlePlay(game)}
                  >
                    <Play size={18} className="group-hover/btn:drop-shadow-[0_0_6px_hsl(45_93%_54%_/_0.6)] transition-all" />
                    Enter Training
                  </Button>

                  {/* Bottom decorative line */}
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/2 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer Note */}
      <div className="py-8 flex flex-col items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="h-px w-16 bg-gradient-to-r from-transparent to-border" />
          <Gem className="w-4 h-4 text-primary/40" />
          <div className="h-px w-16 bg-gradient-to-l from-transparent to-border" />
        </div>
        <p className="text-sm text-muted-foreground/60 text-center">
          All training sessions are completely free. Master your craft at your own pace.
        </p>
      </div>
    </div>
  );
};

export default PlayAILobby;
