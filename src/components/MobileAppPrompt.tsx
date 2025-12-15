import { useState, useEffect } from 'react';
import { X, Download } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

const SESSION_KEY = 'app_prompt_dismissed';

export function MobileAppPrompt() {
  const isMobile = useIsMobile();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isMobile && !sessionStorage.getItem(SESSION_KEY)) {
      // Small delay before showing
      const timer = setTimeout(() => setIsVisible(true), 1000);
      return () => clearTimeout(timer);
    }
  }, [isMobile]);

  const handleDismiss = () => {
    sessionStorage.setItem(SESSION_KEY, 'true');
    setIsVisible(false);
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
        
        <div className="flex items-center gap-3 pr-6">
          <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
            <Download className="w-6 h-6 text-primary" />
          </div>
          
          <div className="flex-1 min-w-0">
            <h3 className="font-cinzel font-bold text-foreground text-sm">
              Get the App
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Download 1M Gaming for the best experience
            </p>
          </div>
          
          <a
            href="#" 
            onClick={(e) => {
              e.preventDefault();
              // TODO: Replace with actual app store links
              handleDismiss();
            }}
            className="px-3 py-1.5 bg-primary text-primary-foreground text-xs font-semibold rounded-lg hover:bg-primary/90 transition-colors whitespace-nowrap"
          >
            Download
          </a>
        </div>
      </div>
    </div>
  );
}
