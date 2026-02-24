import { Link } from "react-router-dom";
import { useSound } from "@/contexts/SoundContext";
import { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Bot } from "lucide-react";

interface FeaturedGameCardProps {
  name: string;
  tagline: string;
  path: string;
  aiPath: string;
  icon: React.ReactNode;
}

const FeaturedGameCard = ({ name, tagline, path, aiPath, icon }: FeaturedGameCardProps) => {
  const { t } = useTranslation();
  const { play } = useSound();
  const hasPlayedRef = useRef(false);

  // Play sound on hover (desktop) - only once per hover session
  const handleMouseEnter = useCallback(() => {
    if (!hasPlayedRef.current) {
      play('ui_litewoosh');
      hasPlayedRef.current = true;
    }
  }, [play]);

  const handleMouseLeave = useCallback(() => {
    hasPlayedRef.current = false;
  }, []);

  // Play sound on touch/click (mobile)
  const handleTouchStart = useCallback(() => {
    play('ui_litewoosh');
  }, [play]);

  return (
    <div 
      className="group relative z-10"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
    >
      {/* Outer glow ring with pulse animation */}
      <div className="absolute -inset-0.5 bg-gradient-to-r from-primary via-gold-light to-primary rounded-2xl opacity-75 blur-sm animate-pulse-gold group-hover:opacity-100 group-hover:blur-md transition-all duration-500" />
      
      {/* Main card */}
      <div className="relative bg-gradient-to-br from-midnight-light via-background to-midnight rounded-2xl p-6 overflow-hidden transform transition-all duration-300 group-hover:scale-[1.03]">
        {/* Animated gradient background with sparkles */}
        <div className="absolute inset-0 bg-gradient-to-br from-midnight via-background to-midnight-light opacity-90" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent" />
        
        {/* Sparkle overlay pattern */}
        <div className="absolute inset-0 opacity-30 group-hover:opacity-50 transition-opacity duration-500">
          <div className="absolute top-4 left-8 w-1 h-1 bg-primary rounded-full animate-pulse" />
          <div className="absolute top-12 right-6 w-0.5 h-0.5 bg-gold-light rounded-full animate-pulse delay-100" />
          <div className="absolute bottom-16 left-12 w-1 h-1 bg-primary rounded-full animate-pulse delay-200" />
          <div className="absolute bottom-8 right-10 w-0.5 h-0.5 bg-gold-light rounded-full animate-pulse delay-300" />
          <div className="absolute top-1/2 left-4 w-0.5 h-0.5 bg-primary rounded-full animate-pulse delay-150" />
        </div>

        {/* Embossed texture overlay */}
        <div 
          className="absolute inset-0 opacity-[0.03] mix-blend-overlay"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center gap-5 py-4">
          {/* 3D Icon Container */}
          <div className="relative transform transition-transform duration-300 group-hover:-translate-y-2">
            {/* Icon glow background */}
            <div className="absolute inset-0 -m-4 bg-gradient-to-b from-primary/20 to-primary/5 rounded-full blur-xl group-hover:from-primary/30 group-hover:to-primary/10 transition-all duration-300" />
            <div className="relative w-24 h-24 flex items-center justify-center">
              {icon}
            </div>
          </div>

          {/* Title with gold embossed effect */}
          <div className="text-center">
            <h3 
              className="text-2xl font-display font-bold text-primary"
              style={{
                textShadow: "0 2px 4px rgba(0,0,0,0.5), 0 0 20px hsl(45 93% 54% / 0.3)"
              }}
            >
              {name}
            </h3>
            <p className="text-sm text-muted-foreground mt-2 font-light tracking-wide">
              {tagline}
            </p>
          </div>

          {/* Play Free Button - Primary */}
          <Link to={aiPath} className="w-full mt-2">
            <button className="relative w-full group/btn">
              {/* Button glow */}
              <div className="absolute inset-0 bg-gradient-to-r from-primary via-gold-light to-primary rounded-xl blur opacity-0 group-hover/btn:opacity-75 transition-opacity duration-300" />
              
              {/* Button body */}
              <div className="relative bg-gradient-to-b from-primary via-primary to-gold-dark rounded-xl px-6 py-3 border border-gold-light/30 shadow-[inset_0_1px_0_0_hsl(45_93%_70%/0.5),0_4px_12px_-2px_hsl(45_93%_30%/0.5)] transform transition-all duration-200 group-hover/btn:shadow-[inset_0_1px_0_0_hsl(45_93%_70%/0.5),0_6px_20px_-2px_hsl(45_93%_54%/0.6)] group-hover/btn:-translate-y-0.5">
                <div className="flex items-center justify-center gap-2">
                  <Bot className="w-4 h-4 text-background" />
                  <span className="font-display font-semibold text-background tracking-wide">
                    {t("home.playAiFree")}
                  </span>
                </div>
              </div>
            </button>
          </Link>

          {/* Play for SOL Button - Secondary */}
          <Link to={path} className="w-full">
            <button className="relative w-full group/sol border border-primary/40 hover:border-primary/70 rounded-xl px-6 py-2.5 transition-all duration-200 hover:bg-primary/10">
              <div className="flex flex-col items-center gap-0.5">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2L2 22h20L12 2zm0 4.5L18.5 20h-13L12 6.5z"/>
                  </svg>
                  <span className="font-display font-medium text-primary tracking-wide text-sm">
                    {t("home.playForSol")}
                  </span>
                </div>
                <span className="text-xs text-primary/60 font-normal tracking-wide">
                  {t("home.skillBasedMatch")}
                </span>
              </div>
            </button>
          </Link>
        </div>

        {/* Corner decorations */}
        <div className="absolute top-2 left-2 w-4 h-4 border-l-2 border-t-2 border-primary/40 rounded-tl-md" />
        <div className="absolute top-2 right-2 w-4 h-4 border-r-2 border-t-2 border-primary/40 rounded-tr-md" />
        <div className="absolute bottom-2 left-2 w-4 h-4 border-l-2 border-b-2 border-primary/40 rounded-bl-md" />
        <div className="absolute bottom-2 right-2 w-4 h-4 border-r-2 border-b-2 border-primary/40 rounded-br-md" />
      </div>
    </div>
  );
};

export default FeaturedGameCard;
