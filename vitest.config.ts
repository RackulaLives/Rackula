import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vitest/config";
import { readFileSync } from "fs";
import { execSync } from "child_process";

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
    testTimeout: 10000, // 10 seconds per test (App tests are slow due to complex component tree)
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
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
