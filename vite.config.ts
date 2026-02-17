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
      "usb": path.resolve(__dirname, "./src/lib/empty-module.ts"),
      "node-hid": path.resolve(__dirname, "./src/lib/empty-module.ts"),
      // Stub out @coral-xyz/anchor to avoid native deps
      "@coral-xyz/anchor": path.resolve(__dirname, "./src/lib/empty-module.ts"),
    },
    // Dedupe wallet adapter packages to ensure single context
    dedupe: [
      "@solana/wallet-adapter-react",
      "@solana/wallet-adapter-react-ui", 
      "@solana/wallet-adapter-base",
      "@solana/web3.js",
      "react",
      "react-dom",
    ],
  },
  // Optimize deps to exclude problematic native modules
  optimizeDeps: {
    exclude: ['usb', 'node-hid', '@coral-xyz/anchor'],
    include: [
      'buffer',
      '@solana/wallet-adapter-react',
      '@solana/wallet-adapter-react-ui',
      '@solana/wallet-adapter-base',
      '@solana/web3.js',
      '@solana-program/memo',
      'react',
      'react-dom',
    ],
    esbuildOptions: {
      define: {
        global: 'globalThis',
      },
    },
  },
  build: {
    rollupOptions: {
      external: ['usb', 'node-hid'],
      onwarn(warning, warn) {
        // Suppress Privy's /*#__PURE__*/ annotation warnings
        if (warning.code === 'INVALID_ANNOTATION' && warning.message?.includes('#__PURE__')) return;
        warn(warning);
      },
      output: {
        // Add hash to all chunks for cache busting
        entryFileNames: `assets/[name]-[hash].js`,
        chunkFileNames: `assets/[name]-[hash].js`,
        assetFileNames: `assets/[name]-[hash].[ext]`,
      },
    },
  },
}));
