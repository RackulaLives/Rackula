import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";
import { readFileSync } from "fs";
import { execSync } from "child_process";

// Read version from package.json
const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));

// Git info helpers with graceful fallbacks
function getGitInfo() {
  try {
    const commitHash = execSync("git rev-parse --short HEAD", {
      encoding: "utf-8",
    }).trim();
    const branchName = execSync("git rev-parse --abbrev-ref HEAD", {
      encoding: "utf-8",
    }).trim();
    const isDirty =
      execSync("git status --porcelain", { encoding: "utf-8" }).trim() !== "";
    return { commitHash, branchName, isDirty };
  } catch {
    // Git not available or not a git repo
    return { commitHash: "", branchName: "", isDirty: false };
  }
}

const gitInfo = getGitInfo();

export default defineConfig(() => ({
  // VITE_BASE_PATH env var allows different base paths per deployment:
  // - GitHub Pages: /Rackula/ (set in workflow)
  // - Docker/local: / (default)
  base: process.env.VITE_BASE_PATH || "/",
  publicDir: "static",
  plugins: [svelte()],
  define: {
    // Inject version at build time
    __APP_VERSION__: JSON.stringify(pkg.version),
    // Inject build timestamp at build time (ISO 8601)
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    // Git commit hash (short form, e.g., "e2bf857")
    __COMMIT_HASH__: JSON.stringify(gitInfo.commitHash),
    // Git branch name (e.g., "main", "feat/414-dev-build-info")
    __BRANCH_NAME__: JSON.stringify(gitInfo.branchName),
    // Git dirty state (true if uncommitted changes exist)
    __GIT_DIRTY__: JSON.stringify(gitInfo.isDirty),
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
    // Don't inline any assets as base64 - always use file references
    // This prevents the data-images chunk from containing base64 data
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        // Manual chunks to reduce main bundle size below 500kB
        manualChunks(id: string): string | undefined {
          // Vendor libraries - split by functionality
          if (id.includes("node_modules")) {
            // Validation library
            if (id.includes("/zod/")) return "vendor-zod";
            // Svelte runtime + Svelte component libraries
            // bits-ui must be in same chunk as svelte for correct ESM initialization order
            if (id.includes("/svelte/") || id.includes("/bits-ui/"))
              return "vendor-svelte";
            // Pan/zoom functionality
            if (id.includes("/panzoom/")) return "vendor-panzoom";
            // Archive handling (save/load)
            if (id.includes("/jszip/") || id.includes("/js-yaml/"))
              return "vendor-archive";
            // Icon libraries
            if (
              id.includes("/@lucide/svelte/") ||
              id.includes("/simple-icons/")
            )
              return "vendor-icons";
            // Search library
            if (id.includes("/fuse.js/")) return "vendor-fuse";
            // Compression library (used by jszip)
            if (id.includes("/pako/")) return "vendor-pako";
          }
          // App data files - split for lazy loading potential
          // Guard against node_modules paths that might contain these strings
          if (
            !id.includes("node_modules") &&
            id.includes("/src/lib/data/brandPacks/")
          )
            return "data-brandpacks";
          if (
            !id.includes("node_modules") &&
            id.includes("/src/lib/data/bundledImages")
          )
            return "data-images";
        },
      },
    },
  },
}));
