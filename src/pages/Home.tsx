import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, List, Bot, Trophy, Gem, Star } from "lucide-react";

const featuredGames = [
  { name: "Chess", emoji: "♟️", path: "/create-room", icon: Trophy },
  { name: "Dominos", emoji: "🁢", path: "/create-room", icon: Gem },
  { name: "Backgammon", emoji: "🎲", path: "/create-room", icon: Star },
];

const Home = () => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 pyramid-bg">
      {/* Hero Section */}
      <div className="text-center max-w-3xl mb-12 relative">
        <div className="flex justify-center mb-6">
          <div className="flex items-center gap-2">
            <Star className="w-8 h-8 text-primary fill-primary animate-pulse-gold" />
            <Gem className="w-6 h-6 text-primary/80" />
            <Star className="w-8 h-8 text-primary fill-primary animate-pulse-gold" />
          </div>
        </div>
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-bold text-foreground mb-4 tracking-wide">
          Welcome to <span className="text-primary">1M GAMING</span>
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground font-light">
          Master the art of skill-based competition. Rise to glory.
        </p>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col items-center justify-center gap-4 mb-16 w-full max-w-lg">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full">
          <Button asChild size="lg" variant="gold" className="w-full sm:w-auto text-lg px-8 py-6">
            <Link to="/create-room">
              <Plus size={22} />
              Create Game Room
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="w-full sm:w-auto text-lg px-8 py-6">
            <Link to="/room-list">
              <List size={22} />
              View Public Rooms
            </Link>
          </Button>
        </div>
        <Button asChild variant="secondary" size="lg" className="w-full sm:w-auto text-lg px-8 py-6">
          <Link to="/play-ai">
            <Bot size={22} />
            Play vs AI (Free Practice)
          </Link>
        </Button>
      </div>

      {/* Featured Games Section */}
      <div className="w-full max-w-4xl">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
          <h2 className="text-2xl font-display font-semibold text-foreground text-center">
            Featured Games
          </h2>
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {featuredGames.map((game) => {
            const Icon = game.icon;
            return (
              <Card key={game.name} className="text-center group">
                <CardContent className="pt-8 pb-6 flex flex-col items-center gap-4">
                  <div className="relative">
                    <span className="text-5xl">{game.emoji}</span>
                    <Icon className="absolute -top-2 -right-2 w-5 h-5 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <h3 className="text-xl font-display font-medium text-foreground">{game.name}</h3>
                  <Button asChild size="sm" variant="default">
                    <Link to={game.path}>
                      <Trophy className="w-4 h-4" />
                      Play Now
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Bottom decorative element */}
      <div className="mt-16 flex items-center gap-4 text-muted-foreground/50">
        <Gem className="w-4 h-4" />
        <span className="text-sm font-light tracking-widest uppercase">Skill · Strategy · Success</span>
        <Gem className="w-4 h-4" />
      </div>
    </div>
  );
};

export default Home;
