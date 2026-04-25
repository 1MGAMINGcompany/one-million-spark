// Application Entry Point — domain-aware async bootstrap.
// Platform/operator visitors (1mg.live) NEVER load polyfills, MWA, or flagship code.
// Flagship visitors (1mgaming.com / localhost / preview) load the full Solana/game stack.

import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./i18n"; // i18n must initialize on both paths
import { detectDomain } from "./lib/domainDetection";

// Import build version to log on app start
import { BUILD_VERSION, BUILD_TIMESTAMP } from "./lib/buildVersion";
console.log(`[1MGAMING] App started | Build: ${BUILD_VERSION} | ${BUILD_TIMESTAMP}`);

// Debug instrumentation: capture global errors
import { dbg } from "./lib/debugLog";

if (typeof window !== "undefined") {
  // Safety redirect: demo.1mg.live → 1mg.live/demo
  if (window.location.hostname === "demo.1mg.live") {
    window.location.replace("https://1mg.live/demo");
  }

  window.addEventListener("error", (e) => {
    dbg("window.error", {
      message: e.message,
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno,
    });
  });

  window.addEventListener("unhandledrejection", (e) => {
    const msg = String(e.reason);
    // Suppress MetaMask auto-connect failures — not our wallet stack
    if (msg.includes("MetaMask")) {
      e.preventDefault();
      console.info("[1MGAMING] Suppressed MetaMask rejection:", msg);
      return;
    }
    dbg("unhandledrejection", { reason: msg });
  });

  // Suppress native browser PWA install prompt (re-enable when ready)
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
  });
}

// Domain-aware bootstrap. detectDomain() reads window.location, available pre-React.
async function bootstrap() {
  const context = detectDomain();
  const rootEl = document.getElementById("root")!;

  if (context.type === "platform" || context.type === "operator") {
    // Platform/operator path — no Solana, no polyfills, no MWA, no games.
    const { default: AppPlatform } = await import("./AppPlatform");
    createRoot(rootEl).render(
      <React.StrictMode>
        <AppPlatform context={context} />
      </React.StrictMode>
    );
    return;
  }

  // Flagship path — load Buffer/process polyfills + Mobile Wallet Adapter
  // BEFORE the app module so Solana/Wallet Standard pick them up correctly.
  await import("./polyfills");
  const { registerMobileWalletAdapter } = await import("./lib/mobileWalletAdapter");
  registerMobileWalletAdapter();

  const { default: AppFlagship } = await import("./AppFlagship");
  createRoot(rootEl).render(
    <React.StrictMode>
      <AppFlagship />
    </React.StrictMode>
  );
}

bootstrap().catch((err) => {
  console.error("[1MGAMING] Bootstrap failed:", err);
  dbg("bootstrap.error", { message: String(err) });
});
