import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";
import { existsSync, readFileSync } from "fs";
import { execFileSync } from "child_process";
import { resolve } from "path";

// Read version from package.json
const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));

// Git info helpers with graceful fallbacks
interface GitInfo {
  commitHash: string;
  branchName: string;
  isDirty: boolean;
}

const GIT_COMMAND_TIMEOUT_MS = 3000;

function getGitStderr(error: unknown): string {
  if (!error || typeof error !== "object") {
    return "";
  }

  const stderr = (error as { stderr?: string }).stderr;
  return typeof stderr === "string" ? stderr.trim() : "";
}

function isGitTimeoutError(error: unknown): boolean {
  const hasTimeoutMarker = (value: string): boolean =>
    value.includes("ETIMEDOUT") || value.toLowerCase().includes("timed out");

  if (!(error instanceof Error)) {
    return false;
  }

  if (hasTimeoutMarker(error.message)) {
    return true;
  }

  const cause = (error as Error & { cause?: unknown }).cause;
  if (cause instanceof Error && hasTimeoutMarker(cause.message)) {
    return true;
  }
  if (cause && typeof cause === "object") {
    return (cause as { code?: unknown }).code === "ETIMEDOUT";
  }

  return false;
}

function runGit(args: string[]): string {
  try {
    return execFileSync("git", args, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: GIT_COMMAND_TIMEOUT_MS,
    }).trim();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const stderr = getGitStderr(error);
    const message = stderr
      ? `Failed to run git ${args.join(" ")}: ${detail} | stderr: ${stderr}`
      : `Failed to run git ${args.join(" ")}: ${detail}`;
    throw new Error(message, {
      cause: error,
    });
  }
}

function tryRunGit(args: string[]): string | null {
  try {
    return runGit(args);
  } catch (error) {
    if (isGitTimeoutError(error)) {
      return null;
    }
    return "";
  }
}

function getGitInfo(): GitInfo {
  if (!existsSync(".git")) {
    return { commitHash: "", branchName: "", isDirty: false };
  }

  const commitHash = tryRunGit(["rev-parse", "--short", "HEAD"]) ?? "";
  const branchName = tryRunGit(["rev-parse", "--abbrev-ref", "HEAD"]) ?? "";
  // Intentionally include untracked files in dirtyOutput so isDirty reflects
  // any local workspace deviation, not only tracked-file modifications.
  const dirtyOutput = tryRunGit(["status", "--porcelain"]);
  if (dirtyOutput === null) {
    process.emitWarning(
      "[vite] git status timed out; treating dirty state as unknown and defaulting isDirty=true.",
    );
  }

  return {
    commitHash,
    branchName,
    isDirty: dirtyOutput === null || dirtyOutput !== "",
  };
}

const gitInfo = getGitInfo();

export default defineConfig(() => ({
  // VITE_BASE_PATH env var allows different base paths per deployment:
  // - GitHub Pages: /Rackula/ (set in workflow)
  // - Docker/local: / (default)
  base: process.env.VITE_BASE_PATH || "/",
  publicDir: "static",
  plugins: [svelte()],
  server: {
    watch: {
      // Ignore git worktrees and other development artifacts
      // Vite already ignores .git/, node_modules/, test-results/, cacheDir, build.outDir
      ignored: ["**/.worktree/**", "**/coverage/**", "**/playwright-report/**"],
    },
  },
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
    // Note: __PERSIST_ENABLED__ removed - API availability is now detected at runtime
    // See src/lib/stores/persistence.svelte.ts
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
      input: {
        main: resolve(__dirname, "index.html"),
        login: resolve(__dirname, "login.html"),
      },
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
