import React from "react";
import { getDbg } from "@/lib/debugLog";
import { reportClientError } from "@/lib/errorTelemetry";
import { BUILD_VERSION } from "@/lib/buildVersion";

export class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null; copied: string | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null, copied: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[AppErrorBoundary] Crash:", error, info);
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
