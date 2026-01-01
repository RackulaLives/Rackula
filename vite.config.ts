import { svelte } from "@sveltejs/vite-plugin-svelte";
import { paraglideVitePlugin } from "@inlang/paraglide-js";
import { defineConfig } from "vite";
import { readFileSync } from "fs";

// Read version from package.json
const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));

export default defineConfig(() => ({
  // VITE_BASE_PATH env var allows different base paths per deployment:
  // - GitHub Pages: /Rackula/ (set in workflow)
  // - Docker/local: / (default)
  base: process.env.VITE_BASE_PATH || "/",
  publicDir: "static",
  plugins: [
    svelte(),
    paraglideVitePlugin({
      project: "./project.inlang",
      outdir: "./src/lib/i18n/paraglide",
    }),
  ],
  define: {
    // Inject version at build time
    __APP_VERSION__: JSON.stringify(pkg.version),
    // Inject build timestamp at build time (ISO 8601)
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    // Environment indicator (development, production, or empty for local detection)
    __BUILD_ENV__: JSON.stringify(process.env.VITE_ENV || ""),
    // Umami analytics configuration
    __UMAMI_ENABLED__: JSON.stringify(
      process.env.VITE_UMAMI_ENABLED === "true",
    ),
    __UMAMI_SCRIPT_URL__: JSON.stringify(
      process.env.VITE_UMAMI_SCRIPT_URL || "",
    ),
    __UMAMI_WEBSITE_ID__: JSON.stringify(
      process.env.VITE_UMAMI_WEBSITE_ID || "",
    ),
  },
  resolve: {
    alias: {
      $lib: "/src/lib",
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Manual chunks to reduce main bundle size
        manualChunks: {
          // Zod validation library
          zod: ["zod"],
          // UI component library
          "bits-ui": ["bits-ui"],
          // Pan/zoom functionality
          panzoom: ["panzoom"],
          // Archive handling (save/load)
          archive: ["jszip", "js-yaml"],
          // Icon libraries
          icons: ["@lucide/svelte", "simple-icons"],
        },
      },
    },
  },
}));
