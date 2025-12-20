import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(
    Boolean
  ),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Stub out native modules that can't run in browser
      // These are pulled in by hardware wallet adapters but not needed for browser wallets
      "usb": path.resolve(__dirname, "./src/lib/empty-module.ts"),
      "node-hid": path.resolve(__dirname, "./src/lib/empty-module.ts"),
      // Stub out @coral-xyz/anchor to avoid native deps
      "@coral-xyz/anchor": path.resolve(__dirname, "./src/lib/empty-module.ts"),
    },
  },
  // Optimize deps to exclude problematic native modules
  optimizeDeps: {
    exclude: ['usb', 'node-hid', '@coral-xyz/anchor'],
    esbuildOptions: {
      define: {
        global: 'globalThis',
      },
    },
  },
  build: {
    rollupOptions: {
      external: ['usb', 'node-hid'],
    },
  },
}));
