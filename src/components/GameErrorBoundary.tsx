import React from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface State {
  error: Error | null;
}

/**
 * Error boundary to catch and recover from runtime errors in game pages.
 * Prevents "black screen" crashes in mobile wallet browsers by showing
 * a recoverable UI instead.
 */
export class GameErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[GameErrorBoundary] Crash:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-[60vh] flex items-center justify-center p-6">
          <div className="max-w-md w-full space-y-4 rounded-xl border border-border bg-background/90 p-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-6 w-6 text-destructive" />
              <div className="text-lg font-semibold text-destructive">
                Something went wrong
              </div>
            </div>
            <div className="text-sm text-muted-foreground">
              The game UI crashed. This is common in mobile wallet browsers when RPC hiccups occur.
              Your game state is safe - just reload to continue.
            </div>
            <Button 
              variant="outline" 
              className="w-full gap-2"
              onClick={() => window.location.reload()}
            >
              <RefreshCw className="h-4 w-4" />
              Reload (recover)
            </Button>
            <pre className="text-xs opacity-60 overflow-auto max-h-32 bg-muted/50 p-2 rounded">
              {String(this.state.error?.message || this.state.error)}
            </pre>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
