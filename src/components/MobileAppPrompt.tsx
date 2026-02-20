import { useState, useEffect, useRef } from 'react';
import { X, Download, Share } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useTranslation } from 'react-i18next';

const SESSION_KEY = 'app_prompt_dismissed';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function MobileAppPrompt() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [isVisible, setIsVisible] = useState(false);
  const [showIOSHint, setShowIOSHint] = useState(false);
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);
  const isIOSDevice = isIOS();

  // Capture the beforeinstallprompt event (Android/Chrome)
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      deferredPrompt.current = e as BeforeInstallPromptEvent;
    };
    window.addEventListener('beforeinstallprompt', handler);

    const installedHandler = () => {
      sessionStorage.setItem(SESSION_KEY, 'true');
      setIsVisible(false);
    };
    window.addEventListener('appinstalled', installedHandler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, []);

  // Show the banner after delay on mobile
  useEffect(() => {
    if (isMobile && !sessionStorage.getItem(SESSION_KEY)) {
      const timer = setTimeout(() => setIsVisible(true), 1000);
      return () => clearTimeout(timer);
    }
  }, [isMobile]);

  const handleDismiss = () => {
    sessionStorage.setItem(SESSION_KEY, 'true');
    setIsVisible(false);
  };

  const handleInstall = async () => {
    // Android/Chrome: trigger native install prompt
    if (deferredPrompt.current) {
      await deferredPrompt.current.prompt();
      const { outcome } = await deferredPrompt.current.userChoice;
      if (outcome === 'accepted') {
        handleDismiss();
      }
      deferredPrompt.current = null;
      return;
    }

    // iOS: show manual instructions
    if (isIOSDevice) {
      setShowIOSHint(true);
      return;
    }

    // Fallback: just dismiss
    handleDismiss();
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 animate-in slide-in-from-bottom-4 duration-300">
      <div className="bg-card border border-primary/30 rounded-xl p-4 shadow-lg shadow-primary/10">
        <button
          onClick={handleDismiss}
          className="absolute top-2 right-2 p-1 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-5 h-5" />
        </button>

        {showIOSHint ? (
          <div className="flex items-center gap-3 pr-6">
            <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
              <Share className="w-6 h-6 text-primary" />
            </div>
            <p className="text-xs text-muted-foreground">
              {t('mobilePrompt.iosInstructions')}
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-3 pr-6">
            <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
              <Download className="w-6 h-6 text-primary" />
            </div>

            <div className="flex-1 min-w-0">
              <h3 className="font-cinzel font-bold text-foreground text-sm">
                {t('mobilePrompt.getTheApp')}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t('mobilePrompt.downloadDesc')}
              </p>
            </div>

            <button
              onClick={handleInstall}
              className="px-3 py-1.5 bg-primary text-primary-foreground text-xs font-semibold rounded-lg hover:bg-primary/90 transition-colors whitespace-nowrap"
            >
              {t('mobilePrompt.install')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
