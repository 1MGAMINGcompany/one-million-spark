// Application Entry Point
import "./polyfills"; // Must be first - Buffer/process polyfills for Solana
import { registerMobileWalletAdapter } from "./lib/mobileWalletAdapter";

// Register MWA synchronously BEFORE React renders
// This ensures Wallet Standard picks up MWA before WalletProvider builds wallet list
registerMobileWalletAdapter();

import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n";

// Import build version to log on app start
import { BUILD_VERSION, BUILD_TIMESTAMP } from "./lib/buildVersion";
console.log(`[1MGAMING] App started | Build: ${BUILD_VERSION} | ${BUILD_TIMESTAMP}`);

// Debug instrumentation: capture global errors
import { dbg } from "./lib/debugLog";

if (typeof window !== "undefined") {
  window.addEventListener("error", (e) => {
    dbg("window.error", {
      message: e.message,
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno,
    });
  });

  window.addEventListener("unhandledrejection", (e) => {
    dbg("unhandledrejection", {
      reason: String(e.reason),
    });
  });


  // Suppress native browser PWA install prompt (re-enable when ready)
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
  });
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
