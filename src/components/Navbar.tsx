import { useState, useEffect, useCallback } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useWallet } from "@/hooks/useWallet";
import { usePrivy } from "@privy-io/react-auth";
import { usePrivySolBalance } from "@/hooks/usePrivySolBalance";
import { Home, Wallet, PlusCircle, LayoutList, Menu, X, Coins, Volume2, VolumeX, Bell, BellOff, Trophy, ChevronDown, LogOut, ArrowRightLeft, Sparkles } from "lucide-react";
import { WalletButton } from "./WalletButton";
import { PrivyLoginButton } from "./PrivyLoginButton";
import { Button } from "@/components/ui/button";
import BrandLogo from "./BrandLogo";
import LanguageSelector from "./LanguageSelector";
import { useSound } from "@/contexts/SoundContext";
import { requestNotificationPermission } from "@/lib/pushNotifications";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
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
  const [showExternalWallet, setShowExternalWallet] = useState(false);
  const { soundEnabled, toggleSound, play } = useSound();
  const { t, i18n } = useTranslation();
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const { connected, publicKey } = useWallet();
  const { authenticated, login, logout } = usePrivy();
  const { isPrivyUser, walletAddress, balanceSol, loading: balanceLoading } = usePrivySolBalance();

  const shortAddress = walletAddress
    ? `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`
    : null;

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
    { path: "/leaderboard/ludo", labelKey: "nav.leaderboard", icon: Trophy },
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

            {/* Money AI Helper Button */}
            <button
              onClick={() => { play('ui_click'); window.dispatchEvent(new Event("aihelper-show")); }}
              className="p-2 rounded-lg text-primary hover:text-primary/80 hover:bg-secondary transition-all duration-200 drop-shadow-[0_0_6px_hsl(45_93%_54%_/_0.3)]"
              aria-label="Money AI Helper"
              title="Money AI Helper"
            >
              <Sparkles size={20} />
            </button>
            
            <PrivyLoginButton />
            <Collapsible>
              <CollapsibleTrigger className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                <Wallet size={14} />
                <span>{t("wallet.externalWallet")}</span>
                <ChevronDown size={12} />
              </CollapsibleTrigger>
              <CollapsibleContent className="absolute right-0 top-full mt-1 bg-background border border-border rounded-lg shadow-lg p-3 z-50 space-y-2">
                <p className="text-[11px] text-muted-foreground">{t("wallet.alreadyHavePhantom")}</p>
                <WalletButton />
              </CollapsibleContent>
            </Collapsible>
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

              {/* ── Account Card ── */}
              {isPrivyUser && shortAddress ? (
                <div className="rounded-xl border border-primary/30 bg-secondary/60 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Wallet size={14} className="text-primary" />
                    <span className="text-xs text-muted-foreground">{t("wallet.signedInAs")}</span>
                    <span className="font-mono text-xs text-foreground">{shortAddress}</span>
                  </div>

                  {/* Balance chip */}
                  <div className="flex items-center gap-2">
                    <Coins size={14} className="text-primary" />
                    {balanceLoading ? (
                      <Skeleton className="h-4 w-20" />
                    ) : (
                      <span className="text-sm font-semibold text-foreground">
                        {balanceSol !== null ? `${balanceSol.toFixed(4)} SOL` : "—"}
                      </span>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2">
                    <Link
                      to="/add-funds"
                      onClick={() => { setIsOpen(false); handleNavClick(); }}
                      className="flex-1 text-center text-xs font-medium py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                    >
                      {t("nav.addFunds")}
                    </Link>
                    <Link
                      to={`/player/${walletAddress}`}
                      onClick={() => { setIsOpen(false); handleNavClick(); }}
                      className="flex-1 text-center text-xs font-medium py-2 rounded-lg border border-border text-foreground hover:bg-secondary transition-colors"
                    >
                      {t("nav.myProfile")}
                    </Link>
                    <button
                      onClick={() => { logout(); setIsOpen(false); }}
                      className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-secondary transition-colors"
                      title={t("wallet.disconnect")}
                    >
                      <LogOut size={16} />
                    </button>
                  </div>

                  {/* Switch Wallet link */}
                  <button
                    onClick={() => { setShowExternalWallet(prev => !prev); }}
                    className="flex items-center justify-center gap-1.5 w-full text-[11px] text-muted-foreground hover:text-primary transition-colors pt-1"
                  >
                    <ArrowRightLeft size={12} />
                    {t("wallet.switchWallet")}
                  </button>
                  {showExternalWallet && (
                    <div className="pt-1">
                      <WalletButton />
                    </div>
                  )}
                </div>
              ) : (
                <div className="px-1 pt-1 pb-3 space-y-3">
                  {/* Primary: Sign In (Google / Email) */}
                  <Button
                    onClick={() => { login(); setIsOpen(false); }}
                    className="w-full"
                    size="lg"
                  >
                    <Wallet className="mr-2" size={18} />
                    {t("wallet.signInGoogleEmail")}
                  </Button>
                  <p className="text-[11px] text-muted-foreground text-center -mt-1">
                    {t("wallet.createWalletInstantly")}
                  </p>

                  {/* Secondary: Already have a crypto wallet? */}
                  <Button
                    onClick={() => { setShowExternalWallet(prev => !prev); }}
                    variant="outline"
                    size="sm"
                    className="w-full text-xs"
                  >
                    {t("wallet.alreadyHaveCryptoWallet")}
                  </Button>
                  {showExternalWallet && (
                    <div className="pt-1">
                      <WalletButton />
                    </div>
                  )}
                </div>
              )}

              {/* ── Nav Links (mobile excludes Add Funds — it's in the card) ── */}
              {navItems
                .filter((item) => item.path !== "/add-funds")
                .map((item) => {
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
              
              {/* ── Toggles ── */}
              <div className="flex items-center gap-3 px-4 py-3">
                <LanguageSelector />
                <span className="text-sm text-muted-foreground">{t("common.language")}</span>
              </div>
              
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

              {/* Money AI Helper */}
              <button
                onClick={() => { play('ui_click'); setIsOpen(false); window.dispatchEvent(new Event("aihelper-show")); }}
                className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-primary hover:bg-secondary transition-all duration-200"
              >
                <Sparkles size={20} />
                <span>Money AI Helper</span>
              </button>

            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
