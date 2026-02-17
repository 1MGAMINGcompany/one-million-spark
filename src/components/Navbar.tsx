import { useState, useEffect, useCallback } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useWallet } from "@solana/wallet-adapter-react";
import { Home, Wallet, PlusCircle, LayoutList, Menu, X, Coins, Volume2, VolumeX, Bell, BellOff, Trophy, User } from "lucide-react";
import { WalletButton } from "./WalletButton";
import { PrivyLoginButton } from "./PrivyLoginButton";
import BrandLogo from "./BrandLogo";
import LanguageSelector from "./LanguageSelector";
import { useSound } from "@/contexts/SoundContext";
import { requestNotificationPermission } from "@/lib/pushNotifications";
import type { LucideIcon } from "lucide-react";

interface NavItem {
  path: string;
  labelKey: string;
  icon: LucideIcon;
}

// Safe helper: wallet webviews may not define Notification
function getNotificationAPI(): any | null {
  if (typeof window === "undefined") return null;
  return (window as any).Notification ?? null;
}

const Navbar = () => {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const { soundEnabled, toggleSound, play } = useSound();
  const { t, i18n } = useTranslation();
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const { connected, publicKey } = useWallet();

  // Check notification permission on mount (safe for wallet webviews)
  useEffect(() => {
    try {
      const N = getNotificationAPI();
      setNotificationsEnabled(!!N && N.permission === "granted");
    } catch {
      setNotificationsEnabled(false);
    }
  }, []);

  // Set document direction based on language
  useEffect(() => {
    const lang = i18n.language;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [i18n.language]);

  const handleToggleSound = () => {
    play(soundEnabled ? 'system_toggle_off' : 'system_toggle_on');
    toggleSound();
  };

  const handleNavClick = () => {
    play('ui_click');
  };

  const handleToggleNotifications = useCallback(async () => {
    if (notificationsEnabled) {
      // Can't revoke programmatically, just inform user
      play('system_toggle_off');
      setNotificationsEnabled(false);
    } else {
      const granted = await requestNotificationPermission();
      if (granted) {
        play('system_toggle_on');
        setNotificationsEnabled(true);
      }
    }
  }, [notificationsEnabled, play]);

  const navItems: NavItem[] = [
    { path: "/", labelKey: "nav.home", icon: Home },
    { path: "/add-funds", labelKey: "nav.addFunds", icon: Coins },
    { path: "/create-room", labelKey: "nav.createRoom", icon: PlusCircle },
    { path: "/room-list", labelKey: "nav.roomList", icon: LayoutList },
    { path: "/leaderboard/chess", labelKey: "nav.leaderboard", icon: Trophy },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-md border-b border-border shadow-lg">
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
                  <span>{t(item.labelKey)}</span>
                </Link>
              );
            })}
            
            {/* Language Selector */}
            <LanguageSelector />
            
            {/* Sound Toggle Button */}
            <button
              onClick={handleToggleSound}
              className={`p-2 rounded-lg transition-all duration-200 ${
                !soundEnabled
                  ? "text-muted-foreground/50 hover:text-muted-foreground hover:bg-secondary"
                  : "text-primary hover:text-primary/80 hover:bg-secondary drop-shadow-[0_0_6px_hsl(45_93%_54%_/_0.4)]"
              }`}
              aria-label={soundEnabled ? t("nav.soundOn") : t("nav.soundOff")}
              title={soundEnabled ? t("nav.soundOn") : t("nav.soundOff")}
            >
              {soundEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
            </button>
            
            {/* Notification Toggle Button */}
            <button
              onClick={handleToggleNotifications}
              className={`p-2 rounded-lg transition-all duration-200 ${
                !notificationsEnabled
                  ? "text-muted-foreground/50 hover:text-muted-foreground hover:bg-secondary"
                  : "text-primary hover:text-primary/80 hover:bg-secondary drop-shadow-[0_0_6px_hsl(45_93%_54%_/_0.4)]"
              }`}
              aria-label={notificationsEnabled ? "Notifications on" : "Notifications off"}
              title={notificationsEnabled ? "Notifications on" : "Enable notifications"}
            >
              {notificationsEnabled ? <Bell size={20} /> : <BellOff size={20} />}
            </button>
            
            <PrivyLoginButton />
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
                    <span>{t(item.labelKey)}</span>
                  </Link>
                );
              })}
              
              {/* Language Selector (Mobile) */}
              <div className="flex items-center gap-3 px-4 py-3">
                <LanguageSelector />
                <span className="text-sm text-muted-foreground">{t("common.language")}</span>
              </div>
              
              {/* Sound Toggle (Mobile) */}
              <button
                onClick={handleToggleSound}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                  !soundEnabled
                    ? "text-muted-foreground/50 hover:text-muted-foreground hover:bg-secondary"
                    : "text-primary hover:bg-secondary"
                }`}
              >
                {soundEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
                <span>{soundEnabled ? t("nav.soundOn") : t("nav.soundOff")}</span>
              </button>
              
              {/* Notification Toggle (Mobile) */}
              <button
                onClick={handleToggleNotifications}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                  !notificationsEnabled
                    ? "text-muted-foreground/50 hover:text-muted-foreground hover:bg-secondary"
                    : "text-primary hover:bg-secondary"
                }`}
              >
                {notificationsEnabled ? <Bell size={20} /> : <BellOff size={20} />}
                <span>{notificationsEnabled ? "Notifications On" : "Notifications Off"}</span>
              </button>
              
              {/* My Profile (Mobile - only when connected) */}
              {connected && publicKey && (
                <Link
                  to={`/player/${publicKey.toBase58()}`}
                  onClick={() => { setIsOpen(false); handleNavClick(); }}
                  className="group flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 text-muted-foreground hover:text-foreground hover:bg-secondary border border-transparent hover:border-primary/30"
                >
                  <User size={20} className="text-primary/70 group-hover:text-primary" />
                  <span>{t("nav.myProfile")}</span>
                </Link>
              )}
              
              {/* Privy Login (Mobile) */}
              <div className="pt-2">
                <PrivyLoginButton />
              </div>
              
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
