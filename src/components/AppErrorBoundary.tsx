import React from "react";
import { getDbg, dbg } from "@/lib/debugLog";
import { reportClientError } from "@/lib/errorTelemetry";
import { BUILD_VERSION } from "@/lib/buildVersion";

/**
 * Global error listeners to capture crash stacks for debugging
 * Called once when AppErrorBoundary mounts
 */
let globalListenersInstalled = false;

function installGlobalCrashListeners() {
  if (globalListenersInstalled || typeof window === "undefined") return;
  globalListenersInstalled = true;

  // Capture uncaught errors
  window.addEventListener("error", (event) => {
    const { message, filename, lineno, colno, error } = event;
    const stack = error?.stack || "no stack";
    
    // Log to console so "Copy logs" captures it
    console.error("[GlobalCrash] Uncaught error:", message, "\nStack:", stack);
    
    // Log to dbg for structured capture
    try {
      dbg("crash", {
        type: "error",
        message,
        filename,
        lineno,
        colno,
        stack,
        build: BUILD_VERSION,
        route: window.location.pathname,
        time: new Date().toISOString(),
      });
    } catch {}
  });

  // Capture unhandled promise rejections
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message = reason?.message || String(reason);
    const stack = reason?.stack || "no stack";
    
    // Log to console so "Copy logs" captures it
    console.error("[GlobalCrash] Unhandled rejection:", message, "\nStack:", stack);
    
    // Log to dbg for structured capture
    try {
      dbg("crash", {
        type: "unhandledrejection",
        message,
        stack,
        build: BUILD_VERSION,
        route: window.location.pathname,
        time: new Date().toISOString(),
      });
    } catch {}
  });

  console.log("[GlobalCrash] Crash listeners installed");
}

export class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null; copied: string | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null, copied: null };
  }

  componentDidMount() {
    // Install global crash listeners once
    installGlobalCrashListeners();
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    const stack = error.stack || "no stack";
    
    // Log to console with full stack
    console.error("[AppErrorBoundary] Crash:", error.message, "\nStack:", stack, "\nComponent:", info.componentStack);
    
    // Log to dbg for structured capture
    try {
      dbg("crash", {
        type: "boundary",
        message: error.message,
        stack,
        componentStack: info.componentStack,
        build: BUILD_VERSION,
        route: window.location.pathname,
        time: new Date().toISOString(),
      });
    } catch {}
    
    // Report to telemetry - triple-wrapped so it can NEVER break rendering
    try {
      reportClientError(error).catch(() => {});
    } catch {}
  }

  copyError = async () => {
    const { error } = this.state;
    if (!error) return;
    try {
      const payload = JSON.stringify(
        {
          message: error.message,
          stack: error.stack,
          build: BUILD_VERSION,
          route: window.location.pathname,
          time: new Date().toISOString(),
        },
        null,
        2
      );
      await navigator.clipboard.writeText(payload);
      this.setState({ copied: "error" });
      setTimeout(() => this.setState({ copied: null }), 2000);
    } catch {}
  };

  copyLogs = async () => {
    try {
      const logs = getDbg();
      await navigator.clipboard.writeText(JSON.stringify(logs, null, 2));
      this.setState({ copied: "logs" });
      setTimeout(() => this.setState({ copied: null }), 2000);
    } catch {}
  };

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <div className="text-center max-w-md space-y-4">
            <h1 className="text-2xl font-bold text-foreground">
              Something went wrong
            </h1>
            <p className="text-muted-foreground">
              The app hit an error. Reload to recover.
            </p>
            <div className="flex gap-2 justify-center">
              <button
                className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-opacity"
                onClick={() => window.location.reload()}
              >
                Reload
              </button>
            </div>
            <div className="flex gap-2 justify-center">
              <button
                className="px-4 py-2 bg-muted text-muted-foreground rounded text-sm hover:bg-muted/80 transition-colors"
                onClick={this.copyError}
              >
                {this.state.copied === "error" ? "Copied!" : "Copy error"}
              </button>
              <button
                className="px-4 py-2 bg-muted text-muted-foreground rounded text-sm hover:bg-muted/80 transition-colors"
                onClick={this.copyLogs}
              >
                {this.state.copied === "logs" ? "Copied!" : "Copy logs"}
              </button>
            </div>
            <pre className="text-xs text-destructive mt-4 p-2 bg-muted rounded overflow-auto max-h-32 text-left">
              {String(this.state.error?.message || this.state.error)}
            </pre>
            <p className="text-xs text-muted-foreground/50">
              Build: {BUILD_VERSION}
            </p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
