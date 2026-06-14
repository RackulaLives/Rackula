/**
 * Bundle budget CI gate (issue #2185).
 *
 * Measures the gzipped size of the initial-load graph in a production build and
 * compares it against the committed budget in performance-budget.json. Exits
 * non-zero when the build is over budget so shell-slice PRs (epic #2017) cannot
 * quietly regress the bundle the browser has to fetch on first paint.
 *
 * Why gzip: production is served gzip/brotli, so transfer size, not raw size,
 * is what users wait on. Why the initial-load graph specifically: it is the
 * critical path that blocks first render, and it is what the M14 shell grows.
 *
 * Usage:
 *   npm run build && npm run check:bundle-budget
 *   npm run check:bundle-budget -- --update   # rewrite the baseline from dist/
 *
 * The decision logic lives in src/lib/utils/bundle-budget.ts and is unit
 * tested. This script is the I/O shell around it.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ENTRIES,
  evaluateBudget,
  parseBudgetConfig,
  thresholdFor,
  type BudgetConfig,
  type Measurements,
} from "../src/lib/utils/bundle-budget";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, "..");
const DIST_DIR = join(ROOT, "dist");
const INDEX_HTML = join(DIST_DIR, "index.html");
const BUDGET_FILE = join(ROOT, "performance-budget.json");

/** gzip level 9 to match the static-asset compression production serves. */
function gzipSize(absPath: string): number {
  return gzipSync(readFileSync(absPath), { level: 9 }).length;
}

/** Extract a single HTML attribute value from a tag string, order-independent. */
function attr(tag: string, name: string): string | undefined {
  const match = new RegExp(`\\b${name}="([^"]*)"`, "i").exec(tag);
  return match ? match[1] : undefined;
}

/**
 * Only count hashed build output under /assets/. That excludes /config.js,
 * the per-deployment runtime config the container/LXC entrypoints overwrite,
 * which is not shell code and varies by environment.
 */
function isBundledAsset(href: string): boolean {
  return href.startsWith("/assets/");
}

/**
 * Read the initial-load asset graph straight from the built index.html. The
 * entry script, every modulepreloaded chunk, and every linked stylesheet are
 * what the browser fetches before first render. Reading the HTML keeps this
 * robust to content-hashed filenames and to chunking changes from the bundler.
 */
function collectInitialAssets(html: string): { js: string[]; css: string[] } {
  const js = new Set<string>();
  const css = new Set<string>();

  // Tokenise each script/link tag and inspect its attributes individually, so
  // matching does not depend on attribute order (the bundler interleaves
  // `crossorigin` and may reorder rel/href across versions).
  const tagRe = /<(script|link)\b[^>]*>/gi;
  let tag: RegExpExecArray | null;
  while ((tag = tagRe.exec(html)) !== null) {
    const raw = tag[0];
    const isScript = tag[1].toLowerCase() === "script";

    if (isScript) {
      const src = attr(raw, "src");
      if (src && src.endsWith(".js") && isBundledAsset(src)) js.add(src);
      continue;
    }

    const rel = attr(raw, "rel")?.toLowerCase();
    const href = attr(raw, "href");
    if (!href || !isBundledAsset(href)) continue;
    if (rel === "modulepreload" && href.endsWith(".js")) js.add(href);
    if (rel === "stylesheet" && href.endsWith(".css")) css.add(href);
  }

  return { js: [...js], css: [...css] };
}

/** Map an index.html asset href (e.g. "/assets/main-abc.js") to a dist path. */
function assetPath(href: string): string {
  const cleaned = href.replace(/^\//, "").split("?")[0];
  const resolved = resolve(DIST_DIR, cleaned);
  // index.html is project-built and trusted, but resolve any traversal defensively
  // so a stray "../" can never make the gate read or measure a file outside dist/.
  if (resolved !== DIST_DIR && !resolved.startsWith(DIST_DIR + sep)) {
    throw new Error(`Asset path escapes dist/: ${href}`);
  }
  return resolved;
}

function sumGzip(hrefs: string[]): number {
  let total = 0;
  for (const href of hrefs) {
    const path = assetPath(href);
    if (!existsSync(path)) {
      throw new Error(
        `Asset referenced by index.html is missing from dist/: ${href}`,
      );
    }
    total += gzipSize(path);
  }
  return total;
}

function measureInitialGraph(): Measurements {
  if (!existsSync(INDEX_HTML)) {
    throw new Error(
      `dist/index.html not found. Run "npm run build" before the budget check.`,
    );
  }

  const html = readFileSync(INDEX_HTML, "utf-8");
  const { js, css } = collectInitialAssets(html);

  if (js.length === 0) {
    throw new Error("No entry JS found in dist/index.html; build looks empty.");
  }

  const initialJs = sumGzip(js);
  const initialCss = sumGzip(css);

  return {
    initialJs,
    initialCss,
    initialTotal: initialJs + initialCss,
  };
}

function loadBudget(): BudgetConfig {
  if (!existsSync(BUDGET_FILE)) {
    throw new Error(`Budget file not found: ${BUDGET_FILE}`);
  }
  return parseBudgetConfig(JSON.parse(readFileSync(BUDGET_FILE, "utf-8")));
}

function kib(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

/** Rewrite only the baseline from the current build; keep headroom and tolerance. */
function updateBaseline(measured: Measurements, current: BudgetConfig): void {
  const updated: BudgetConfig = {
    toleranceBytes: current.toleranceBytes,
    baseline: {
      initialJs: measured.initialJs,
      initialCss: measured.initialCss,
      initialTotal: measured.initialTotal,
    },
    headroom: current.headroom,
  };
  writeFileSync(BUDGET_FILE, JSON.stringify(updated, null, 2) + "\n");
  console.log("Updated performance-budget.json baseline from current dist/:");
  for (const entry of ENTRIES) {
    console.log(
      `  ${entry}: baseline ${kib(updated.baseline[entry])}, ` +
        `budget ${kib(thresholdFor(updated, entry))}`,
    );
  }
}

function main(): void {
  const shouldUpdate = process.argv.includes("--update");
  const budget = loadBudget();
  const measured = measureInitialGraph();

  if (shouldUpdate) {
    updateBaseline(measured, budget);
    return;
  }

  const result = evaluateBudget(measured, budget);

  console.log("\nBundle budget (gzipped initial-load graph)\n");
  console.log(
    `  ${"entry".padEnd(14)}${"measured".padStart(12)}${"budget".padStart(12)}${"headroom".padStart(12)}`,
  );
  for (const row of result.rows) {
    const marker = row.breached ? "  OVER" : "";
    console.log(
      `  ${row.entry.padEnd(14)}${kib(row.measured).padStart(12)}${kib(
        row.threshold,
      ).padStart(12)}${kib(row.headroom).padStart(12)}${marker}`,
    );
  }
  console.log(`\n  tolerance: ${kib(budget.toleranceBytes)}`);

  if (!result.passed) {
    console.error("\nBundle budget exceeded:");
    for (const breach of result.breaches) {
      console.error(
        `  ${breach.entry} is ${kib(breach.overBy)} over the ${kib(
          breach.threshold,
        )} budget (measured ${kib(breach.measured)}).`,
      );
    }
    console.error(
      "\nIf this growth is intentional, justify it in the PR and rebaseline with:\n" +
        "  npm run build && npm run check:bundle-budget -- --update\n",
    );
    process.exit(1);
  }

  console.log("\nWithin budget.\n");
}

main();
