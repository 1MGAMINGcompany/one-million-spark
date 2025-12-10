import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Home, Wallet, PlusCircle, LayoutList, Menu, X, Coins, Volume2, VolumeX } from "lucide-react";
import { WalletButton } from "./WalletButton";
import BrandLogo from "./BrandLogo";
import { useAudio } from "@/contexts/AudioContext";
import type { LucideIcon } from "lucide-react";

interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
}

const Navbar = () => {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const { isMuted, toggleMute, playClick } = useAudio();

  const handleToggleMute = () => {
    toggleMute();
  };

  const handleNavClick = () => {
    playClick();
  };

  const navItems: NavItem[] = [
    { path: "/", label: "Home", icon: Home },
    { path: "/add-funds", label: "Add Funds", icon: Coins },
    { path: "/create-room", label: "Create Room", icon: PlusCircle },
    { path: "/room-list", label: "Room List", icon: LayoutList },
  ];

  return (
    <nav className="sticky top-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-md border-b border-border shadow-lg">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <BrandLogo size="md" />

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={handleNavClick}
                  className={`group flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? "bg-primary text-primary-foreground shadow-gold"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary border border-transparent hover:border-primary/30"
                  }`}
                >
                  <Icon 
                    size={18} 
                    className={`transition-all duration-200 ${
                      isActive 
                        ? "text-primary-foreground" 
                        : "text-primary/70 group-hover:text-primary group-hover:drop-shadow-[0_0_4px_hsl(45_93%_54%_/_0.5)]"
                    }`}
                  />
                  <span>{item.label}</span>
                </Link>
              );
            })}
            
            {/* Sound Toggle Button */}
            <button
              onClick={handleToggleMute}
              className={`p-2 rounded-lg transition-all duration-200 ${
                isMuted
                  ? "text-muted-foreground/50 hover:text-muted-foreground hover:bg-secondary"
                  : "text-primary hover:text-primary/80 hover:bg-secondary drop-shadow-[0_0_6px_hsl(45_93%_54%_/_0.4)]"
              }`}
              aria-label={isMuted ? "Unmute sounds" : "Mute sounds"}
              title={isMuted ? "Sound OFF" : "Sound ON"}
            >
              {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>
            
            <WalletButton />
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="md:hidden p-2 rounded-lg text-primary/70 hover:text-primary hover:bg-secondary transition-colors"
            aria-label="Toggle menu"
          >
            {isOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile Navigation */}
        {isOpen && (
          <div className="md:hidden py-4 border-t border-border">
            <div className="flex flex-col gap-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => { setIsOpen(false); handleNavClick(); }}
                    className={`group flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                      isActive
                        ? "bg-primary text-primary-foreground shadow-gold"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary border border-transparent hover:border-primary/30"
                    }`}
                  >
                    <Icon 
                      size={20} 
                      className={`transition-all duration-200 ${
                        isActive 
                          ? "text-primary-foreground" 
                          : "text-primary/70 group-hover:text-primary"
                      }`}
                    />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
              
              {/* Sound Toggle (Mobile) */}
              <button
                onClick={handleToggleMute}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                  isMuted
                    ? "text-muted-foreground/50 hover:text-muted-foreground hover:bg-secondary"
                    : "text-primary hover:bg-secondary"
                }`}
              >
                {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                <span>{isMuted ? "Sound OFF" : "Sound ON"}</span>
              </button>
              
              {/* Wallet Button (Mobile) */}
              <div className="pt-2">
                <WalletButton />
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
