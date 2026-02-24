import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Swords, Users, Bot, Trophy, Gem, Star, Shield, Zap, X, PlayCircle } from "lucide-react";
import FeaturedGameCard from "@/components/FeaturedGameCard";
import { ChessIcon, DominoIcon, BackgammonIcon, CheckersIcon, LudoIcon } from "@/components/GameIcons";
import PyramidLogo from "@/components/PyramidLogo";
// import { MobileAppPrompt } from "@/components/MobileAppPrompt"; // Temporarily disabled
import { usePrivySolBalance } from "@/hooks/usePrivySolBalance";
import { AddSolCard } from "@/components/AddSolCard";
import { WelcomeIntroModal } from "@/components/WelcomeIntroModal";
import { LiveActivityIndicator } from "@/components/LiveActivityIndicator";
import { getActiveAIGame, dismissActiveAIGame } from "@/hooks/useActiveAIGame";

const Home = () => {
  const { t } = useTranslation();
  const { isPrivyUser, walletAddress, balanceSol, isLowBalance } = usePrivySolBalance();

  // Session continuity — check for abandoned AI game
  const [activeGame, setActiveGame] = useState<string | null>(() => getActiveAIGame());

  // Show funding card for Privy users with low/zero balance
  const showFundingCard = isPrivyUser && isLowBalance && walletAddress;

  const featuredGames = [
    { name: t("games.ludo"), tagline: t("games.ludoTagline"), path: "/create-room", aiPath: "/play-ai/ludo", icon: <LudoIcon /> },
    { name: t("games.dominos"), tagline: t("games.dominosTagline"), path: "/create-room", aiPath: "/play-ai/dominos", icon: <DominoIcon /> },
    { name: t("games.chess"), tagline: t("games.chessTagline"), path: "/create-room", aiPath: "/play-ai/chess", icon: <ChessIcon /> },
    { name: t("games.backgammon"), tagline: t("games.backgammonTagline"), path: "/create-room", aiPath: "/play-ai/backgammon", icon: <BackgammonIcon /> },
    { name: t("games.checkers"), tagline: t("games.checkersTagline"), path: "/create-room", aiPath: "/play-ai/checkers", icon: <CheckersIcon /> },
  ];

  return (
    <div className="min-h-screen">
      <WelcomeIntroModal isAuthenticated={isPrivyUser} />

      {/* Session continuity banner */}
      {activeGame && (
        <div className="sticky top-0 z-40 bg-primary/95 backdrop-blur-sm border-b border-primary-foreground/20">
          <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-primary-foreground text-sm font-medium">
              <PlayCircle className="w-4 h-4 shrink-0" />
              <span>You have an unfinished game</span>
            </div>
            <div className="flex items-center gap-2">
              <Button asChild size="sm" variant="secondary" className="h-7 text-xs px-3">
                <Link to={activeGame}>Resume</Link>
              </Button>
              <button
                onClick={() => { dismissActiveAIGame(); setActiveGame(null); }}
                className="p-1 text-primary-foreground/70 hover:text-primary-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

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
                  <div className="absolute inset-0 -m-4 bg-primary/15 blur-xl rounded-full" />
                  <div className="relative inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/30">
                    <PyramidLogo size={24} />
                    <span className="text-sm font-medium bg-gradient-to-r from-primary via-gold-light to-primary bg-clip-text text-transparent">
                      {t("hero.badge")}
                    </span>
                  </div>
                </div>

                {/* Tagline with Shimmer */}
                <div className="relative text-center lg:text-left">
                  <div className="absolute inset-0 -m-2 bg-primary/10 blur-lg rounded-lg" />
                  <p className="relative text-lg md:text-xl font-display tracking-wide bg-gradient-to-r from-primary via-gold-light to-accent bg-clip-text text-transparent">
                    "{t("hero.tagline")}{" "}
                    <span className="wealth-shimmer inline-block font-bold">{t("hero.wealth")}</span>."
                  </p>
                </div>
              </div>

              {/* Main Heading - Brand name stays in English */}
              <h1 className="text-5xl md:text-6xl lg:text-7xl font-display font-bold tracking-wide">
                <span className="text-foreground">1M</span>{" "}
                <span className="text-primary">GAMING</span>
              </h1>

              {/* Subheading */}
              <p className="text-xl md:text-2xl font-semibold tracking-wide leading-relaxed text-center lg:text-left premium-shimmer premium-fade-in">
                {t("hero.mainTagline")}
              </p>

              {/* Zero-balance funding card for Privy users */}
              {/* Funding hint for Privy users with zero balance */}
              {showFundingCard && (
                <AddSolCard walletAddress={walletAddress} balanceSol={balanceSol} />
              )}

              {/* CTA Buttons — always visible */}
              <div className="flex flex-col gap-4 mt-4">
                    <Button asChild size="lg" variant="gold" className="group text-lg h-auto py-4 px-8 transition-all shadow-[0_0_20px_-4px_hsl(45_93%_54%_/_0.4)]">
                      <Link to="/play-ai" className="flex flex-col items-center gap-0.5">
                        <span className="flex items-center gap-2 text-2xl md:text-3xl font-bold tracking-wide">
                          <Bot className="w-7 h-7 group-hover:drop-shadow-[0_0_6px_hsl(45_93%_54%_/_0.6)] transition-all" />
                          {t("home.playAiFree")}
                        </span>
                        <span className="text-xs font-normal text-background/70 tracking-wide">{t("home.playFreeSub")}</span>
                      </Link>
                    </Button>
                    <Button asChild size="lg" variant="gold" className="group text-lg h-auto py-3 px-8 transition-all">
                      <Link to="/quick-match" className="flex flex-col items-center gap-0.5">
                        <span className="flex items-center gap-2">
                          <Zap className="w-5 h-5 group-hover:drop-shadow-[0_0_6px_hsl(45_93%_54%_/_0.6)] transition-all" />
                          {t("home.quickMatchWinSol")}
                        </span>
                        <span className="text-xs font-normal text-primary-foreground tracking-wide">{t("home.quickMatchWinSolSub")}</span>
                      </Link>
                    </Button>
                    <div className="flex flex-col sm:flex-row gap-4">
                      <Button asChild size="lg" variant="outline" className="group text-lg h-auto py-3 px-8 flex-1 border-primary/30 hover:border-primary/50 transition-all">
                        <Link to="/create-room" className="flex flex-col items-center gap-0.5">
                          <span className="flex items-center gap-2">
                            <Swords className="w-5 h-5 text-primary group-hover:drop-shadow-[0_0_6px_hsl(45_93%_54%_/_0.6)] transition-all" />
                            {t("home.createGameRoom")}
                          </span>
                          <span className="text-xs font-normal text-primary/60 tracking-wide">{t("home.createRoomSub")}</span>
                        </Link>
                      </Button>
                      <Button asChild size="lg" variant="outline" className="group text-lg h-auto py-3 px-8 flex-1 border-primary/30 hover:border-primary/50 transition-all">
                        <Link to="/room-list" className="flex flex-col items-center gap-0.5">
                          <span className="flex items-center gap-2">
                            <Users className="w-5 h-5 text-primary group-hover:drop-shadow-[0_0_6px_hsl(45_93%_54%_/_0.6)] transition-all" />
                            {t("home.viewPublicRooms")}
                          </span>
                          <span className="text-xs font-normal text-primary/60 tracking-wide">{t("home.viewRoomsSub")}</span>
                        </Link>
                      </Button>
                    </div>
                  </div>

              {/* Stats/Trust indicators */}
              <div className="flex flex-wrap justify-center lg:justify-start gap-6 mt-6 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-primary" />
                      <span>{t("home.secureFair")}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-primary" />
                      <span>{t("home.instantMatches")}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Trophy className="w-4 h-4 text-primary" />
                      <span>{t("home.skillBasedOnly")}</span>
                    </div>
                  </div>

              {/* Live Activity */}
              <div className="mt-4">
                    <LiveActivityIndicator />
                  </div>
            </div>

            {/* Right Side - Decorative Pyramid Panel */}
            <div className="flex justify-center lg:justify-end">
              <div className="relative w-full max-w-md lg:max-w-lg aspect-square">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-accent/10 to-transparent rounded-3xl blur-2xl" />
                
                <div className="relative h-full bg-gradient-to-br from-card via-midnight-light to-card border border-border rounded-3xl p-8 overflow-hidden">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div 
                      className="absolute w-[80%] h-[80%] opacity-10"
                      style={{
                        background: "linear-gradient(to top, hsl(45 93% 54% / 0.3) 0%, transparent 60%)",
                        clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)"
                      }}
                    />
                    <div 
                      className="absolute w-[60%] h-[60%] opacity-20"
                      style={{
                        background: "linear-gradient(to top, hsl(45 93% 54% / 0.5) 0%, hsl(35 80% 50% / 0.2) 50%, transparent 80%)",
                        clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)"
                      }}
                    />
                    <div 
                      className="absolute w-[40%] h-[40%] shadow-gold-glow"
                      style={{
                        background: "linear-gradient(to top, hsl(45 93% 54%) 0%, hsl(45 90% 65%) 40%, hsl(35 80% 50%) 100%)",
                        clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)"
                      }}
                    />
                    <div className="absolute top-[22%] w-6 h-6 rounded-full bg-background border-2 border-primary shadow-gold-glow flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-primary" />
                    </div>
                  </div>

                  <div className="absolute top-4 left-4 w-8 h-8 border-l-2 border-t-2 border-primary/40 rounded-tl-lg" />
                  <div className="absolute top-4 right-4 w-8 h-8 border-r-2 border-t-2 border-primary/40 rounded-tr-lg" />
                  <div className="absolute bottom-4 left-4 w-8 h-8 border-l-2 border-b-2 border-primary/40 rounded-bl-lg" />
                  <div className="absolute bottom-4 right-4 w-8 h-8 border-r-2 border-b-2 border-primary/40 rounded-br-lg" />

                  <Star className="absolute top-8 right-12 w-5 h-5 text-primary/40 fill-primary/20 animate-pulse" />
                  <Gem className="absolute bottom-16 left-8 w-4 h-4 text-primary/30" />
                  <Star className="absolute top-20 left-10 w-3 h-3 text-primary/20 fill-primary/10" />

                  <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-background/90 via-background/60 to-transparent">
                    <div className="flex flex-col items-center gap-3">
                      <div className="flex items-center gap-2">
                        <div className="h-px w-8 bg-gradient-to-r from-transparent to-primary/50" />
                        <Gem className="w-4 h-4 text-primary" />
                        <div className="h-px w-8 bg-gradient-to-l from-transparent to-primary/50" />
                      </div>
                      <p className="text-center text-sm text-muted-foreground font-light tracking-wide">
                        {t("home.decentralized")}
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
      <section className="relative z-10 py-20 px-4">
        <div className="max-w-5xl mx-auto relative z-10">
          <div className="flex items-center justify-center gap-4 mb-12">
            <div className="h-px flex-1 max-w-24 bg-gradient-to-r from-transparent to-border" />
            <div className="flex items-center gap-3">
              <Trophy className="w-5 h-5 text-primary" />
              <h2 className="text-3xl font-display font-semibold text-foreground text-center">
                {t("home.featuredGames")}
              </h2>
              <Trophy className="w-5 h-5 text-primary" />
            </div>
            <div className="h-px flex-1 max-w-24 bg-gradient-to-l from-transparent to-border" />
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
            {featuredGames.map((game) => (
              <FeaturedGameCard
                key={game.name}
                name={game.name}
                tagline={game.tagline}
                path={game.path}
                aiPath={game.aiPath}
                icon={game.icon}
              />
            ))}
          </div>
        </div>
      </section>
      {/* Legal Clarification Section */}
      <section className="relative z-10 py-16 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl font-display font-semibold text-foreground mb-4">
            Skill-Based Competitive Gaming Platform
          </h2>
          <p className="text-muted-foreground leading-relaxed text-sm">
            1MGAMING is a skill-based competitive platform where players compete
            in strategy games such as chess, backgammon, checkers, dominos, and
            ludo. Outcomes are determined by player decisions and skill — not
            random number generators. 1MGAMING does not operate as a casino and
            does not offer games of chance. Users are responsible for ensuring
            compliance with their local laws before participating.
          </p>
        </div>
      </section>

      {/* <MobileAppPrompt /> — re-enable when PWA install is ready */}
    </div>
  );
};

export default Home;
