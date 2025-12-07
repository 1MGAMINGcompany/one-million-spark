import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Plus, List } from "lucide-react";

const Home = () => {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="text-center max-w-xl">
        <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
          Welcome to 1M GAMING
        </h1>
        <p className="text-lg text-muted-foreground mb-8">
          Play skill-based games like Chess, Dominos, and Backgammon with crypto.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link to="/create-room">
              <Plus size={20} />
              Create Game Room
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
            <Link to="/room-list">
              <List size={20} />
              View Public Rooms
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Home;
