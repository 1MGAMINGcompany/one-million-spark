import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, List } from "lucide-react";

const featuredGames = [
  { name: "Chess", emoji: "♟️", path: "/create-room" },
  { name: "Dominos", emoji: "🁢", path: "/create-room" },
  { name: "Backgammon", emoji: "🎲", path: "/create-room" },
];

const Home = () => {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-12">
      {/* Hero Section */}
      <div className="text-center max-w-2xl mb-12">
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-4">
          Welcome to 1M GAMING
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground">
          Skill-based games. Real competition. Crypto-powered.
        </p>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16 w-full max-w-md">
        <Button asChild size="lg" className="w-full sm:w-auto text-lg px-8 py-6">
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

      {/* Featured Games Section */}
      <div className="w-full max-w-3xl">
        <h2 className="text-2xl font-semibold text-foreground text-center mb-6">
          Featured Games
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {featuredGames.map((game) => (
            <Card key={game.name} className="text-center">
              <CardContent className="pt-6 pb-4 flex flex-col items-center gap-3">
                <span className="text-5xl">{game.emoji}</span>
                <h3 className="text-xl font-medium text-foreground">{game.name}</h3>
                <Button asChild size="sm" variant="secondary">
                  <Link to={game.path}>Play</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Home;
