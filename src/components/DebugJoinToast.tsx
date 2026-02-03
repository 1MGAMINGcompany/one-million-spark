// src/components/DebugJoinToast.tsx
/**
 * One-time toast for debug_join URL toggle.
 * Reads sessionStorage flag set by main.tsx before React rendered.
 */

import { useEffect } from "react";
import { toast } from "sonner";

export function DebugJoinToast() {
  useEffect(() => {
    const flag = sessionStorage.getItem("__debug_join_toast");
    if (!flag) return;
    
    // Clear immediately to prevent re-triggering
    sessionStorage.removeItem("__debug_join_toast");
    
    if (flag === "enabled") {
      toast.success("Join debug enabled", {
        description: "Bug icon panel will appear. Traces will be captured.",
        duration: 4000,
      });
    } else if (flag === "disabled") {
      toast.info("Join debug disabled", {
        description: "Traces cleared.",
        duration: 3000,
      });
    }
  }, []);
  
  return null;
}
