// src/components/JoinTraceDebugPanel.tsx
/**
 * Debug panel for join trace diagnostics.
 * Only visible when localStorage.debug_join === "1"
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Trash2, Bug } from "lucide-react";
import { toast } from "sonner";
import {
  isJoinTraceEnabled,
  getJoinTrace,
  clearJoinTrace,
} from "@/lib/joinTrace";

export function JoinTraceDebugPanel() {
  const [visible, setVisible] = useState(false);
  
  // Only render if debug mode is enabled
  if (!isJoinTraceEnabled()) {
    return null;
  }
  
  const handleCopyTrace = () => {
    const trace = getJoinTrace();
    if (!trace) {
      toast.info("No join trace available");
      return;
    }
    
    navigator.clipboard.writeText(trace)
      .then(() => {
        toast.success("Join trace copied to clipboard");
      })
      .catch(() => {
        toast.error("Failed to copy trace");
      });
  };
  
  const handleClearTrace = () => {
    clearJoinTrace();
    toast.info("Join trace cleared");
  };
  
  const traceData = getJoinTrace();
  const hasTrace = !!traceData;
  let entryCount = 0;
  try {
    const parsed = traceData ? JSON.parse(traceData) : null;
    entryCount = parsed?.entries?.length ?? 0;
  } catch {
    // ignore parse error
  }
  
  if (!visible) {
    return (
      <button
        onClick={() => setVisible(true)}
        className="fixed bottom-4 left-4 z-50 p-2 bg-yellow-500/20 border border-yellow-500/50 rounded-full text-yellow-500 hover:bg-yellow-500/30 transition-colors"
        title="Join Trace Debug"
      >
        <Bug className="h-4 w-4" />
      </button>
    );
  }
  
  return (
    <div className="fixed bottom-4 left-4 z-50 p-3 bg-background/95 border border-yellow-500/50 rounded-lg shadow-lg max-w-xs">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-yellow-500 flex items-center gap-1">
          <Bug className="h-3 w-3" />
          Join Trace Debug
        </span>
        <button 
          onClick={() => setVisible(false)}
          className="text-muted-foreground hover:text-foreground text-xs"
        >
          ✕
        </button>
      </div>
      
      <div className="text-xs text-muted-foreground mb-2">
        {hasTrace ? (
          <span>Trace available ({entryCount} entries)</span>
        ) : (
          <span>No trace captured</span>
        )}
      </div>
      
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopyTrace}
          disabled={!hasTrace}
          className="text-xs h-7"
        >
          <Copy className="h-3 w-3 mr-1" />
          Copy Trace
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleClearTrace}
          disabled={!hasTrace}
          className="text-xs h-7"
        >
          <Trash2 className="h-3 w-3 mr-1" />
          Clear
        </Button>
      </div>
    </div>
  );
}
