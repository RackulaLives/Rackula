import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vitest/config";
import { readFileSync } from "fs";
import { execSync } from "child_process";
import { cpus } from "os";

// Read version from package.json
const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));

// Git info helpers with graceful fallbacks (same as vite.config.ts)
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

// Compute maxForks: use VITEST_MAX_FORKS env var if set, otherwise use CPU count (capped at 4)
function getMaxForks(): number {
  const envValue = process.env.VITEST_MAX_FORKS;
  if (envValue) {
    const parsed = parseInt(envValue, 10);
    if (!isNaN(parsed) && parsed >= 1) {
      return Math.min(parsed, 16); // Cap at 16 to prevent resource exhaustion
    }
  }
  // Default: use half of available CPUs, minimum 2, maximum 4
  const cpuCount = cpus().length;
  return Math.max(2, Math.min(4, Math.floor(cpuCount / 2)));
}

const maxForks = getMaxForks();

export default defineConfig({
  plugins: [svelte({ hot: !process.env.VITEST })],
  define: {
    // Inject version at build time (same as vite.config.ts)
    __APP_VERSION__: JSON.stringify(pkg.version),
    // Inject build timestamp at test start (same as vite.config.ts)
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    // Git commit hash (short form, e.g., "e2bf857")
    __COMMIT_HASH__: JSON.stringify(gitInfo.commitHash),
    // Git branch name (e.g., "main", "feat/414-dev-build-info")
    __BRANCH_NAME__: JSON.stringify(gitInfo.branchName),
    // Git dirty state (true if uncommitted changes exist)
    __GIT_DIRTY__: JSON.stringify(gitInfo.isDirty),
    // Environment indicator
    __BUILD_ENV__: JSON.stringify(""),
  },
  test: {
    environment: "happy-dom",
    include: ["src/**/*.{test,spec}.{js,ts}"],
    globals: true,
    setupFiles: ["src/tests/setup.ts"],
    testTimeout: 10000, // 10 seconds per test (increase per-test for slow tests)
    // bits-ui cleanup errors handled in setup.ts via targeted suppression
    // Use forks pool for memory isolation between test file batches
    // Each fork is a separate process, so memory is fully released when recycled
    // Configure via VITEST_MAX_FORKS env var, defaults to CPU-aware value (2-4)
    pool: "forks",
    poolOptions: {
      forks: {
        maxForks,
      },
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      exclude: ["node_modules/", "src/tests/"],
      thresholds: {
        statements: 75,
        branches: 70,
        functions: 75,
        lines: 75,
      },
    },
    alias: {
      // Ensure Svelte uses the browser build in tests
      svelte: "svelte",
    },
  },
  resolve: {
    alias: {
      $lib: "/src/lib",
    },
    conditions: ["browser"],
  },
});
