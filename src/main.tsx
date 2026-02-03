// Application Entry Point
import "./polyfills"; // Must be first - Buffer/process polyfills for Solana
import { registerMobileWalletAdapter } from "./lib/mobileWalletAdapter";

// Register MWA synchronously BEFORE React renders
// This ensures Wallet Standard picks up MWA before WalletProvider builds wallet list
registerMobileWalletAdapter();

// URL-based debug_join toggle - runs before React renders
// Supports: ?debug_join=1, ?debug_join=0, /debug_join=1, /debug_join/1, etc.
(function handleDebugJoinUrl() {
  if (typeof window === "undefined") return;
  
  const url = new URL(window.location.href);
  const searchParam = url.searchParams.get("debug_join");
  
  // Also check path-based forms: /debug_join=1, /debug_join/1
  const pathMatch = url.pathname.match(/\/debug_join[=/]([01])/);
  const pathValue = pathMatch?.[1];
  
  const value = searchParam ?? pathValue;
  
  if (value === "1") {
    localStorage.setItem("debug_join", "1");
    sessionStorage.setItem("__debug_join_toast", "enabled");
    console.log("[1MGAMING] Join debug enabled via URL");
  } else if (value === "0") {
    localStorage.removeItem("debug_join");
    localStorage.removeItem("join_trace_latest");
    sessionStorage.setItem("__debug_join_toast", "disabled");
    console.log("[1MGAMING] Join debug disabled via URL");
  }
  
  // Clean URL and redirect to /room-list if toggle was present
  if (value !== null && value !== undefined) {
    // Use replaceState to avoid triggering re-render loop
    window.history.replaceState({}, "", "/room-list");
  }
})();

import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n";

// Import build version to log on app start
import { BUILD_VERSION, BUILD_TIMESTAMP } from "./lib/buildVersion";
console.log(`[1MGAMING] App started | Build: ${BUILD_VERSION} | ${BUILD_TIMESTAMP}`);

// Debug instrumentation: capture global errors
import { dbg, isDebugEnabled } from "./lib/debugLog";

if (typeof window !== "undefined") {
  window.addEventListener("error", (e) => {
    if (!isDebugEnabled()) return;
    dbg("window.error", {
      message: e.message,
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno,
    });
  });

  window.addEventListener("unhandledrejection", (e) => {
    if (!isDebugEnabled()) return;
    dbg("unhandledrejection", {
      reason: String(e.reason),
    });
  });
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
