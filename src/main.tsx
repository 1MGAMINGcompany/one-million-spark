import "./polyfills"; // Must be first - Buffer/process polyfills for Solana
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n";

// Import build version to log on app start
import { BUILD_VERSION, BUILD_TIMESTAMP } from "./lib/buildVersion";
console.log(`[1MGAMING] App started | Build: ${BUILD_VERSION} | ${BUILD_TIMESTAMP}`);

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
