import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Swords, Users, Bot, Trophy, Gem, Star, Shield, Zap, X, PlayCircle } from "lucide-react";
import FeaturedGameCard from "@/components/FeaturedGameCard";
import { ChessIcon, DominoIcon, BackgammonIcon, CheckersIcon, LudoIcon } from "@/components/GameIcons";
import PyramidLogo from "@/components/PyramidLogo";
import predictionsFighters from "@/assets/predictions-fighters.png";
import futbolBall from "@/assets/futbol.png";
// import { MobileAppPrompt } from "@/components/MobileAppPrompt"; // Temporarily disabled
import { usePrivyWallet } from "@/hooks/usePrivyWallet";
import { usePolygonUSDC } from "@/hooks/usePolygonUSDC";
import { WelcomeIntroModal } from "@/components/WelcomeIntroModal";
import { LiveActivityIndicator } from "@/components/LiveActivityIndicator";
import { getActiveAIGame, dismissActiveAIGame } from "@/hooks/useActiveAIGame";
import HomePredictionHighlights from "@/components/predictions/HomePredictionHighlights";
import type { PredictionEvent } from "@/components/predictions/PredictionHighlights";
import type { Fight } from "@/components/predictions/FightCard";
import { supabase } from "@/integrations/supabase/client";
import { useWallet } from "@/hooks/useWallet";
import { WalletGateModal } from "@/components/WalletGateModal";

const Home = () => {
  const { t } = useTranslation();
  const { isPrivyUser, walletAddress } = usePrivyWallet();
  const { usdc_balance } = usePolygonUSDC();
  const isLowBalance = usdc_balance === null || usdc_balance <= 0.01;
  const { address, isConnected } = useWallet();

  // Session continuity — check for abandoned AI game
  const [activeGame, setActiveGame] = useState<string | null>(() => getActiveAIGame());

  // Prediction highlights data
  const [predFights, setPredFights] = useState<Fight[]>([]);
  const [predEvents, setPredEvents] = useState<PredictionEvent[]>([]);
  const [showWalletGate, setShowWalletGate] = useState(false);

  useEffect(() => {
    const load = async () => {
      const [fightsRes, eventsRes] = await Promise.all([
        supabase.from("prediction_fights").select("id,title,fighter_a_name,fighter_b_name,price_a,price_b,status,event_date,event_name,home_logo,away_logo,fighter_a_image,fighter_b_image,visibility,event_id").not("status", "eq", "draft").in("visibility", ["flagship", "all"]).is("operator_id", null).order("event_date", { ascending: true }).limit(20),
        supabase.from("prediction_events").select("*").eq("status", "approved").order("event_date", { ascending: true }).limit(20),
      ]);
      if (fightsRes.data) setPredFights(fightsRes.data as any);
      if (eventsRes.data) setPredEvents(eventsRes.data as any);
    };
    load();
  }, []);

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
    <div className="min-h-screen overflow-x-hidden">
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
        <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-muted" />
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-1/4 left-1/4 w-64 md:w-96 h-64 md:h-96 bg-primary/10 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-48 md:w-80 h-48 md:h-80 bg-accent/10 rounded-full blur-3xl" />
        </div>

        <div className="relative z-10 w-full max-w-7xl mx-auto px-4 py-12 lg:py-0">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">
            {/* Left Side - Content */}
            <div className="flex flex-col gap-6 text-center lg:text-left min-w-0">
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
              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-display font-bold tracking-wide">
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
                <div className="w-full max-w-md mx-auto bg-card border border-border rounded-xl p-4 text-center space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Add USDC to start making predictions
                  </p>
                  <Button asChild size="lg" variant="gold" className="w-full">
                    <Link to="/add-funds">Add Funds</Link>
                  </Button>
                  <p className="text-xs text-muted-foreground/60">Polygon USDC · Card, Apple Pay, Google Pay</p>
                </div>
              )}

              {/* CTA Buttons — always visible */}
              <div className="flex flex-col items-stretch gap-4 mt-4 min-w-0 w-full">
                    <Button asChild size="lg" variant="gold" className="flex w-full min-w-0 whitespace-normal group text-lg h-auto py-2 pl-2 pr-4 sm:pr-8 transition-all shadow-[0_0_20px_-4px_hsl(45_93%_54%_/_0.4)]">
                      <Link to="/predictions" className="w-full min-w-0 flex items-center gap-3">
                        <img src={predictionsFighters} alt="" className="h-14 sm:h-16 w-auto object-contain shrink-0" />
                        <span className="text-xl sm:text-2xl md:text-3xl font-bold tracking-wide leading-tight flex-1">{t("home.sportPredictions")}</span>
                        <img src={futbolBall} alt="" className="h-10 sm:h-14 w-auto object-contain shrink-0" />
                      </Link>
                    </Button>
                    <Button asChild size="lg" variant="gold" className="flex w-full min-w-0 whitespace-normal group text-lg h-auto py-5 px-4 sm:px-8 transition-all shadow-[0_0_20px_-4px_hsl(45_93%_54%_/_0.4)]">
                      <Link to="/play-ai" className="w-full min-w-0 flex flex-col items-center gap-2 text-center">
                        <span className="flex items-center gap-2 text-2xl sm:text-3xl md:text-4xl font-bold tracking-wide leading-tight">
                          <Bot className="w-7 h-7 sm:w-8 sm:h-8 shrink-0 group-hover:drop-shadow-[0_0_6px_hsl(45_93%_54%_/_0.6)] transition-all" />
                          {t("home.playAiFree")}
                        </span>
                        <span className="text-xs font-normal text-background/70 tracking-wide">{t("home.playFreeSub")}</span>
                        <span className="flex flex-wrap items-center justify-center gap-2 sm:gap-4 mt-1">
                          {[
                            { icon: <ChessIcon />, label: t("games.chess") },
                            { icon: <DominoIcon />, label: t("games.dominos") },
                            { icon: <BackgammonIcon />, label: t("games.backgammon") },
                            { icon: <CheckersIcon />, label: t("games.checkers") },
                            { icon: <LudoIcon />, label: t("games.ludo") },
                          ].map((g) => (
                            <span key={g.label} className="flex flex-col items-center gap-0.5">
                              <span className="w-7 h-7 [&_svg]:w-7 [&_svg]:h-7">{g.icon}</span>
                              <span className="text-[10px] font-medium text-background/60 leading-none">{g.label}</span>
                            </span>
                          ))}
                        </span>
                      </Link>
                    </Button>
                    <Button asChild size="lg" variant="gold" className="flex w-full min-w-0 whitespace-normal group text-lg h-auto py-4 px-4 sm:px-8 transition-all">
                      <Link to="/quick-match" className="w-full min-w-0 flex flex-col items-center gap-1 text-center">
                        <span className="flex items-center gap-2 text-xl sm:text-2xl md:text-3xl font-bold tracking-wide leading-tight">
                          <Zap className="w-6 h-6 sm:w-7 sm:h-7 shrink-0 group-hover:drop-shadow-[0_0_6px_hsl(45_93%_54%_/_0.6)] transition-all" />
                          {t("home.quickMatchWinSol")}
                        </span>
                        <span className="text-[11px] font-medium text-background/60 tracking-widest uppercase">Crypto</span>
                        <span className="text-xs font-normal text-primary-foreground tracking-wide">{t("home.quickMatchWinSolSub")}</span>
                      </Link>
                    </Button>
                    <div className="flex flex-col sm:flex-row gap-4 min-w-0">
                      <Button asChild size="lg" variant="outline" className="flex w-full min-w-0 whitespace-normal group text-lg h-auto py-3 px-4 sm:px-8 flex-1 border-primary/30 hover:border-primary/50 transition-all">
                        <Link to="/create-room" className="w-full min-w-0 flex flex-col items-center gap-0.5 text-center">
                          <span className="flex items-center gap-2">
                            <Swords className="w-5 h-5 shrink-0 text-primary group-hover:drop-shadow-[0_0_6px_hsl(45_93%_54%_/_0.6)] transition-all" />
                            {t("home.createGameRoom")}
                          </span>
                          <span className="text-xs font-normal text-primary/60 tracking-wide">{t("home.createRoomSub")}</span>
                        </Link>
                      </Button>
                      <Button asChild size="lg" variant="outline" className="flex w-full min-w-0 whitespace-normal group text-lg h-auto py-3 px-4 sm:px-8 flex-1 border-primary/30 hover:border-primary/50 transition-all">
                        <Link to="/room-list" className="w-full min-w-0 flex flex-col items-center gap-0.5 text-center">
                          <span className="flex items-center gap-2">
                            <Users className="w-5 h-5 shrink-0 text-primary group-hover:drop-shadow-[0_0_6px_hsl(45_93%_54%_/_0.6)] transition-all" />
                            {t("home.viewPublicRooms")}
                          </span>
                          <span className="text-xs font-normal text-primary/60 tracking-wide">{t("home.viewRoomsSub")}</span>
                        </Link>
                      </Button>
                    </div>
                  </div>

              {/* Stats/Trust indicators */}
              <div className="flex flex-wrap justify-center lg:justify-start gap-6 mt-6 text-sm text-foreground/70">
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
            <div className="hidden lg:flex justify-center lg:justify-end">
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

      {/* Prediction Highlights */}
      {(predFights.length > 0) && (
        <section className="relative z-10 py-12 px-4">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-center gap-4 mb-6">
              <div className="h-px flex-1 max-w-24 bg-gradient-to-r from-transparent to-border" />
              <h2 className="text-2xl font-display font-semibold text-foreground text-center">
                🔥 Predictions
              </h2>
              <div className="h-px flex-1 max-w-24 bg-gradient-to-l from-transparent to-border" />
            </div>
            <HomePredictionHighlights
              fights={predFights}
              events={predEvents}
              showViewAll
              wallet={address}
              onWalletRequired={() => setShowWalletGate(true)}
            />
          </div>
        </section>
      )}

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

      <WalletGateModal
        isOpen={showWalletGate}
        onClose={() => setShowWalletGate(false)}
        title="Connect to Predict"
        description="You need a wallet to place predictions and earn rewards."
      />
    </div>
  );
};

export default Home;
