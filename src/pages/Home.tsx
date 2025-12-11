import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Swords, Users, Bot, Trophy, Gem, Star, Shield, Zap } from "lucide-react";
import FeaturedGameCard from "@/components/FeaturedGameCard";
import { ChessIcon, DominoIcon, BackgammonIcon } from "@/components/GameIcons";
import PyramidLogo from "@/components/PyramidLogo";

interface FeaturedGame {
  name: string;
  tagline: string;
  path: string;
  icon: React.ReactNode;
}

const featuredGames: FeaturedGame[] = [
  { name: "Chess", tagline: "Master the Temple of Strategy", path: "/create-room", icon: <ChessIcon /> },
  { name: "Dominos", tagline: "Rule the Pyramid of Tiles", path: "/create-room", icon: <DominoIcon /> },
  { name: "Backgammon", tagline: "Command the Board of Fate", path: "/create-room", icon: <BackgammonIcon /> },
];

const Home = () => {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative min-h-[90vh] flex items-center overflow-hidden">
        {/* Background Effects */}
        <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-midnight-light" />
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent/10 rounded-full blur-3xl" />
        </div>

        <div className="relative z-10 w-full max-w-7xl mx-auto px-4 py-12 lg:py-0">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">
            {/* Left Side - Content */}
            <div className="flex flex-col gap-6 text-center lg:text-left">
              {/* Premium Tagline Block */}
              <div className="flex flex-col items-center lg:items-start gap-4">
                {/* Badge with Pyramid Logo */}
                <div className="relative">
                  {/* Soft gold glow behind */}
                  <div className="absolute inset-0 -m-4 bg-primary/15 blur-xl rounded-full" />
                  <div className="relative inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/30">
                    <PyramidLogo size={24} />
                    <span className="text-sm font-medium bg-gradient-to-r from-primary via-gold-light to-primary bg-clip-text text-transparent">
                      PREMIUM SKILL GAMING
                    </span>
                  </div>
                </div>

                {/* Tagline with Shimmer */}
                <div className="relative text-center lg:text-left">
                  <div className="absolute inset-0 -m-2 bg-primary/10 blur-lg rounded-lg" />
                  <p className="relative text-lg md:text-xl font-display tracking-wide bg-gradient-to-r from-primary via-gold-light to-accent bg-clip-text text-transparent">
                    "Where strategy becomes{" "}
                    <span className="wealth-shimmer inline-block font-bold">WEALTH</span>."
                  </p>
                </div>
              </div>

              {/* Main Heading */}
              <h1 className="text-5xl md:text-6xl lg:text-7xl font-display font-bold tracking-wide">
                <span className="text-foreground">1M</span>{" "}
                <span className="text-primary">GAMING</span>
              </h1>

              {/* Subheading */}
              <p className="text-xl md:text-2xl font-medium leading-relaxed premium-shimmer">
                FROM $1 TO $1 MILLION WITH STRATEGY AND INTELLIGENCE
              </p>

              {/* CTA Buttons */}
              <div className="flex flex-col gap-4 mt-4">
                <Button asChild size="lg" variant="gold" className="group text-lg h-14 px-8 border border-transparent hover:border-primary/50 transition-all">
                  <Link to="/play-ai" className="flex items-center gap-2">
                    <Bot className="w-5 h-5 group-hover:drop-shadow-[0_0_6px_hsl(45_93%_54%_/_0.6)] transition-all" />
                    Play vs AI (Free)
                  </Link>
                </Button>
                <div className="flex flex-col sm:flex-row gap-4">
                  <Button asChild size="lg" variant="default" className="group text-lg h-14 px-8 flex-1 border border-transparent hover:border-primary/30 transition-all">
                    <Link to="/create-room" className="flex items-center gap-2">
                      <Swords className="w-5 h-5 group-hover:drop-shadow-[0_0_6px_hsl(45_93%_54%_/_0.6)] transition-all" />
                      Create Game Room
                    </Link>
                  </Button>
                  <Button asChild size="lg" variant="outline" className="group text-lg h-14 px-8 flex-1 border-primary/30 hover:border-primary/50 transition-all">
                    <Link to="/room-list" className="flex items-center gap-2">
                      <Users className="w-5 h-5 text-primary group-hover:drop-shadow-[0_0_6px_hsl(45_93%_54%_/_0.6)] transition-all" />
                      View Public Rooms
                    </Link>
                  </Button>
                </div>
              </div>

              {/* Stats/Trust indicators */}
              <div className="flex flex-wrap justify-center lg:justify-start gap-6 mt-6 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-primary" />
                  <span>Secure & Fair</span>
                </div>
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-primary" />
                  <span>Instant Matches</span>
                </div>
                <div className="flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-primary" />
                  <span>Skill-Based Only</span>
                </div>
              </div>
            </div>

            {/* Right Side - Decorative Pyramid Panel */}
            <div className="flex justify-center lg:justify-end">
              <div className="relative w-full max-w-md lg:max-w-lg aspect-square">
                {/* Outer glow */}
                <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-accent/10 to-transparent rounded-3xl blur-2xl" />
                
                {/* Main card */}
                <div className="relative h-full bg-gradient-to-br from-card via-midnight-light to-card border border-border rounded-3xl p-8 overflow-hidden">
                  {/* Layered pyramid triangles */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    {/* Large background pyramid */}
                    <div 
                      className="absolute w-[80%] h-[80%] opacity-10"
                      style={{
                        background: "linear-gradient(to top, hsl(45 93% 54% / 0.3) 0%, transparent 60%)",
                        clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)"
                      }}
                    />
                    
                    {/* Medium pyramid */}
                    <div 
                      className="absolute w-[60%] h-[60%] opacity-20"
                      style={{
                        background: "linear-gradient(to top, hsl(45 93% 54% / 0.5) 0%, hsl(35 80% 50% / 0.2) 50%, transparent 80%)",
                        clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)"
                      }}
                    />
                    
                    {/* Small foreground pyramid with glow */}
                    <div 
                      className="absolute w-[40%] h-[40%] shadow-gold-glow"
                      style={{
                        background: "linear-gradient(to top, hsl(45 93% 54%) 0%, hsl(45 90% 65%) 40%, hsl(35 80% 50%) 100%)",
                        clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)"
                      }}
                    />

                    {/* Eye of providence style element */}
                    <div className="absolute top-[22%] w-6 h-6 rounded-full bg-background border-2 border-primary shadow-gold-glow flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-primary" />
                    </div>
                  </div>

                  {/* Decorative corner elements */}
                  <div className="absolute top-4 left-4 w-8 h-8 border-l-2 border-t-2 border-primary/40 rounded-tl-lg" />
                  <div className="absolute top-4 right-4 w-8 h-8 border-r-2 border-t-2 border-primary/40 rounded-tr-lg" />
                  <div className="absolute bottom-4 left-4 w-8 h-8 border-l-2 border-b-2 border-primary/40 rounded-bl-lg" />
                  <div className="absolute bottom-4 right-4 w-8 h-8 border-r-2 border-b-2 border-primary/40 rounded-br-lg" />

                  {/* Floating decorative elements */}
                  <Star className="absolute top-8 right-12 w-5 h-5 text-primary/40 fill-primary/20 animate-pulse" />
                  <Gem className="absolute bottom-16 left-8 w-4 h-4 text-primary/30" />
                  <Star className="absolute top-20 left-10 w-3 h-3 text-primary/20 fill-primary/10" />

                  {/* Bottom text overlay */}
                  <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-background/90 via-background/60 to-transparent">
                    <div className="flex flex-col items-center gap-3">
                      <div className="flex items-center gap-2">
                        <div className="h-px w-8 bg-gradient-to-r from-transparent to-primary/50" />
                        <Gem className="w-4 h-4 text-primary" />
                        <div className="h-px w-8 bg-gradient-to-l from-transparent to-primary/50" />
                      </div>
                      <p className="text-center text-sm text-muted-foreground font-light tracking-wide">
                        100% Decentralized · Skill-Only · Crypto-Powered
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Games Section */}
      <section className="relative py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-center gap-4 mb-12">
            <div className="h-px flex-1 max-w-24 bg-gradient-to-r from-transparent to-border" />
            <div className="flex items-center gap-3">
              <Trophy className="w-5 h-5 text-primary" />
              <h2 className="text-3xl font-display font-semibold text-foreground text-center">
                Featured Games
              </h2>
              <Trophy className="w-5 h-5 text-primary" />
            </div>
            <div className="h-px flex-1 max-w-24 bg-gradient-to-l from-transparent to-border" />
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {featuredGames.map((game) => (
              <FeaturedGameCard
                key={game.name}
                name={game.name}
                tagline={game.tagline}
                path={game.path}
                icon={game.icon}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Bottom decorative element */}
      <div className="py-8 flex items-center justify-center gap-4 text-muted-foreground/40">
        <Star className="w-3 h-3 fill-current" />
        <Gem className="w-4 h-4" />
        <span className="text-xs font-light tracking-[0.3em] uppercase">Skill · Strategy · Success</span>
        <Gem className="w-4 h-4" />
        <Star className="w-3 h-3 fill-current" />
      </div>
    </div>
  );
};

export default Home;
