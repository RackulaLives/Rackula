#!/usr/bin/env node
// Shared Cloudflare `_headers` generator for the prod and dev CF surfaces.
//
// Every value below is transcribed BY VALUE from deploy/security-headers.conf
// (the nginx/self-host source of truth). Do not edit a value here without
// updating deploy/security-headers.conf (and deploy/lxc/security-headers.conf,
// its LXC variant) to match.
//
// Usage:
//   node scripts/gen-headers.mjs <prod|dev>              print _headers to stdout
//   node scripts/gen-headers.mjs <prod|dev> --out <file>  write _headers to a file
//   node scripts/gen-headers.mjs --assetsignore <file>    write the .assetsignore
//   node scripts/gen-headers.mjs --check                  verify values against
//                                                          deploy/security-headers.conf
//
// Consumers: the prod wrangler deploy step (.github/workflows/deploy-prod.yml,
// #2029) calls this to produce the CF `_headers` and `.assetsignore` artifacts;
// the dev cutover (#2134) will call it with the `dev` surface. `--check` runs in
// the validate job (.github/workflows/test.yml) so the generator cannot silently
// drift from deploy/security-headers.conf.
//
// Carved out of #2029 by #3092. No credentials required; independent of #2675.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const SOURCE_CONF = path.join(REPO_ROOT, "deploy", "security-headers.conf");

// Headers with a single value shared by every CF surface.
const X_FRAME_OPTIONS = "SAMEORIGIN";
const X_CONTENT_TYPE_OPTIONS = "nosniff";
const REFERRER_POLICY = "strict-origin-when-cross-origin";
const PERMISSIONS_POLICY = "geolocation=(), microphone=(), camera=()";
const CONTENT_SECURITY_POLICY =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob:; font-src 'self' https://fonts.gstatic.com; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'self';";

// Per-surface config. HSTS is declared per surface (not shared) because each
// CF surface binds to its own host (count.racku.la vs d.racku.la); today both
// values match deploy/security-headers.conf exactly, but keeping them
// independent means a future per-host HSTS change touches one entry, not the
// shared list. extraHeaders holds headers that must appear on that surface
// only, such as dev's X-Robots-Tag: noindex, which prod must never emit.
const SURFACES = {
  prod: {
    host: "count.racku.la",
    hsts: "max-age=31536000; includeSubDomains",
    extraHeaders: [],
  },
  dev: {
    host: "d.racku.la",
    hsts: "max-age=31536000; includeSubDomains",
    extraHeaders: [["X-Robots-Tag", "noindex"]],
  },
};

// Cache split, transcribed from deploy/nginx.conf.template (`location /assets/`
// sets `expires 1y` + `Cache-Control "public, immutable"`). These live OUTSIDE
// buildHeaders() on purpose: runCheck() diffs buildHeaders() against the
// add_header directives in deploy/security-headers.conf, and Cache-Control is
// not one of them. Putting cache rules in buildHeaders() would break that parity
// check in both directions.
//
// There is deliberately no Cache-Control on `/*`. Cloudflare's default for static
// assets is `public, max-age=0, must-revalidate` plus an ETag, which is already
// revalidate-on-every-request and therefore safe for the SPA shell and
// version.json. Emitting our own `/*` value would raise a precedence question
// against the `/assets/*` rule below (an open item in
// docs/research/spike-2620-static-assets.md) for no benefit.
const CACHE_RULES = [
  ["/assets/*", [["Cache-Control", "public, max-age=31536000, immutable"]]],
];

// Files that must exist in the assets directory so Workers parses them, but must
// never be fetchable. `_headers` and `.assetsignore` are Workers metadata.
// `.DS_Store` and `.claude/` are belt-and-braces: publicDir copies static/
// verbatim, and both are gitignored (`.claude/settings.local.json` via the
// user-global ignore file), so they are invisible to `git status` yet still reach
// dist/ in a hand-run build from a working tree.
const ASSETSIGNORE_ENTRIES = [
  "_headers",
  ".assetsignore",
  ".DS_Store",
  "**/.DS_Store",
  ".claude",
  ".claude/**",
];

function renderAssetsIgnore() {
  return ASSETSIGNORE_ENTRIES.join("\n") + "\n";
}

function buildHeaders(surfaceName) {
  const surface = SURFACES[surfaceName];
  if (!surface) {
    throw new Error(`unknown surface: ${surfaceName}`);
  }
  return [
    ["X-Frame-Options", X_FRAME_OPTIONS],
    ["X-Content-Type-Options", X_CONTENT_TYPE_OPTIONS],
    ["Strict-Transport-Security", surface.hsts],
    ["Referrer-Policy", REFERRER_POLICY],
    ["Permissions-Policy", PERMISSIONS_POLICY],
    ["Content-Security-Policy", CONTENT_SECURITY_POLICY],
    ...surface.extraHeaders,
  ];
}

// Cloudflare `_headers` file format: a URL path pattern line followed by
// indented "Header-Name: value" lines. All security headers apply to every
// path, matching deploy/security-headers.conf being included at server level.
function renderHeadersFile(surfaceName) {
  const lines = ["/*"];
  for (const [name, value] of buildHeaders(surfaceName)) {
    lines.push(`  ${name}: ${value}`);
  }
  for (const [pattern, headers] of CACHE_RULES) {
    lines.push("", pattern);
    for (const [name, value] of headers) {
      lines.push(`  ${name}: ${value}`);
    }
  }
  return lines.join("\n") + "\n";
}

// Parses `add_header <Name> "<value>" always;` lines out of an nginx headers
// conf. Values may contain internal semicolons (e.g. the CSP directive list),
// so the match is greedy up to the final quote before ` always;`.
function parseConfHeaders(confText) {
  const headers = new Map();
  const pattern = /^add_header\s+(\S+)\s+"(.*)"\s+always;\s*$/gm;
  let match;
  while ((match = pattern.exec(confText)) !== null) {
    headers.set(match[1], match[2]);
  }
  return headers;
}

// Verifies bidirectional parity between the generator and
// deploy/security-headers.conf: every shared header value must match, every
// generator-only header must be an explicitly declared surface extra header,
// and every conf header must appear somewhere in the generator's output.
// Returns an exit code (0 = all surfaces match, 1 = at least one mismatch).
function runCheck() {
  const confText = readFileSync(SOURCE_CONF, "utf8");
  const confHeaders = parseConfHeaders(confText);

  if (confHeaders.size === 0) {
    console.error(`no add_header directives parsed from ${SOURCE_CONF}`);
    return 1;
  }

  let failures = 0;
  for (const surfaceName of Object.keys(SURFACES)) {
    const surface = SURFACES[surfaceName];
    const extraHeaderNames = new Set(
      surface.extraHeaders.map(([name]) => name),
    );
    const generated = new Map(buildHeaders(surfaceName));

    console.log(`-- ${surfaceName} (${surface.host}) --`);
    for (const [name, value] of generated) {
      const confValue = confHeaders.get(name);
      if (confValue === undefined) {
        if (extraHeaderNames.has(name)) {
          // Declared surface-only headers (e.g. dev's X-Robots-Tag) have no
          // conf counterpart by design; nothing to diff.
          console.log(`  skip  ${name} (surface extra header)`);
        } else {
          failures += 1;
          console.log(`  FAIL  ${name}`);
          console.log(`        generator: ${value}`);
          console.log(`        conf:      (missing)`);
        }
        continue;
      }
      if (confValue === value) {
        console.log(`  ok    ${name}`);
      } else {
        failures += 1;
        console.log(`  FAIL  ${name}`);
        console.log(`        generator: ${value}`);
        console.log(`        conf:      ${confValue}`);
      }
    }

    // Reverse direction: a header added to security-headers.conf that the
    // generator has not been updated to emit.
    for (const [confName, confValue] of confHeaders) {
      if (!generated.has(confName)) {
        failures += 1;
        console.log(`  FAIL  ${confName}`);
        console.log(`        generator: (missing)`);
        console.log(`        conf:      ${confValue}`);
      }
    }
  }

  console.log();
  if (failures === 0) {
    console.log(
      "Header parity check passed: generator matches deploy/security-headers.conf by value.",
    );
    return 0;
  }
  console.error(`Header parity check FAILED: ${failures} mismatch(es).`);
  return 1;
}

function printUsage() {
  console.error(
    "usage: node scripts/gen-headers.mjs <prod|dev> [--out <file>]",
  );
  console.error("       node scripts/gen-headers.mjs --assetsignore <file>");
  console.error("       node scripts/gen-headers.mjs --check");
}

function main() {
  const args = process.argv.slice(2);

  if (args[0] === "--check") {
    process.exit(runCheck());
  }

  if (args[0] === "--assetsignore") {
    const target = args[1];
    if (!target) {
      console.error("error: --assetsignore requires a file path");
      printUsage();
      process.exit(2);
    }
    writeFileSync(target, renderAssetsIgnore());
    return;
  }

  const surfaceName = args[0];
  if (!surfaceName || !(surfaceName in SURFACES)) {
    printUsage();
    process.exit(2);
  }

  const outIndex = args.indexOf("--out");
  const outPath = outIndex !== -1 ? args[outIndex + 1] : null;
  if (outIndex !== -1 && !outPath) {
    console.error("error: --out requires a file path");
    printUsage();
    process.exit(2);
  }

  const content = renderHeadersFile(surfaceName);

  if (outPath) {
    writeFileSync(outPath, content);
  } else {
    process.stdout.write(content);
  }
}

main();
