import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createWorkerHandler, type WorkerEnv } from "./worker";
import type { R2BucketLike, R2ListResult } from "./storage/r2-driver";

// `import.meta.dir` (Bun) matches the sibling deploy-config.test.ts convention;
// these specs run only under `bun test`.
const THIS_DIR = import.meta.dir;

/**
 * A minimal in-memory R2 bucket stand-in. The tests below never touch storage
 * (the smoke endpoint is unauthenticated and storage-free), but `WorkerEnv`
 * requires a `LAYOUTS` binding to construct the app.
 */
function fakeBucket(): R2BucketLike {
  const empty: R2ListResult = {
    objects: [],
    truncated: false,
    delimitedPrefixes: [],
  };
  return {
    head: async () => null,
    get: async () => null,
    put: async () => null,
    delete: async () => {},
    list: async () => empty,
  };
}

/** Build a WorkerEnv with a fake LAYOUTS binding plus string env overrides. */
function buildEnv(overrides: Record<string, string> = {}): WorkerEnv {
  return {
    NODE_ENV: "test",
    LAYOUTS: fakeBucket(),
    ...overrides,
  };
}

function smokeRequest(headers: Record<string, string> = {}): Request {
  return new Request("https://worker.example/api/version", { headers });
}

describe("Worker fetch: Cloudflare Access gate", () => {
  it("denies the request (does not route to the app) when Access config is fully absent and no opt-out is set", async () => {
    const worker = createWorkerHandler();
    const env = buildEnv();

    const res = await worker.fetch(smokeRequest(), env);

    // Denied, not the version JSON the open app would have returned.
    expect(res.status).not.toBe(200);
    const body = await res.json();
    expect(body).not.toHaveProperty("version");
  });

  it("restores the skip path (200 on the smoke endpoint) when CF_ACCESS_DISABLED=true is explicitly set", async () => {
    const worker = createWorkerHandler();
    const env = buildEnv({ CF_ACCESS_DISABLED: "true" });

    const res = await worker.fetch(smokeRequest(), env);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("version");
  });

  it("still returns 503 (unchanged) when Access config is only partially set", async () => {
    const worker = createWorkerHandler();
    const env = buildEnv({
      CF_ACCESS_JWKS_URL:
        "https://team.cloudflareaccess.com/cdn-cgi/access/certs",
      CF_ACCESS_ISSUER: "https://team.cloudflareaccess.com",
      // CF_ACCESS_AUD intentionally missing
    });

    const res = await worker.fetch(smokeRequest(), env);

    expect(res.status).toBe(503);
  });

  it("still requires a token (401) when Access is fully configured", async () => {
    const worker = createWorkerHandler();
    const env = buildEnv({
      CF_ACCESS_JWKS_URL:
        "https://team.cloudflareaccess.com/cdn-cgi/access/certs",
      CF_ACCESS_ISSUER: "https://team.cloudflareaccess.com",
      CF_ACCESS_AUD: "test-aud",
    });

    const res = await worker.fetch(smokeRequest(), env);

    expect(res.status).toBe(401);
  });
});

describe("Worker fetch: API host lock", () => {
  // Version preview URLs (<id>-rackula-dev.<sub>.workers.dev) sit outside
  // Cloudflare Access and outlive the version they belong to. The host lock
  // keeps them from ever reaching the app or R2, whatever state that
  // version's Access validation was in.
  const lockedEnv = (): WorkerEnv =>
    buildEnv({ CF_ACCESS_DISABLED: "true", RACKULA_API_HOST: "d.racku.la" });

  it("answers 404 without reaching the app when the request host is not the locked host", async () => {
    const worker = createWorkerHandler();

    const res = await worker.fetch(
      new Request(
        "https://0123abcd-rackula-dev.example.workers.dev/api/version",
      ),
      lockedEnv(),
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).not.toHaveProperty("version");
  });

  it("serves the locked host normally", async () => {
    const worker = createWorkerHandler();

    const res = await worker.fetch(
      new Request("https://d.racku.la/api/version"),
      lockedEnv(),
    );

    expect(res.status).toBe(200);
  });

  it("applies no lock when RACKULA_API_HOST is unset or blank (local wrangler dev)", async () => {
    const worker = createWorkerHandler();
    const env = buildEnv({ CF_ACCESS_DISABLED: "true", RACKULA_API_HOST: "" });

    const res = await worker.fetch(smokeRequest(), env);

    expect(res.status).toBe(200);
  });
});

describe("wrangler.jsonc keeps the deployed Worker locked down", () => {
  it("never sets CF_ACCESS_DISABLED in wrangler.jsonc (the fail-closed default must ship to every deployed Worker)", () => {
    // The opt-out belongs only in api/.dev.vars, which `wrangler dev` reads
    // but `wrangler deploy` never bundles. If CF_ACCESS_DISABLED is ever
    // copied into wrangler.jsonc (e.g. into a "vars" block), it deploys with
    // every Worker and silently reopens #2913. Strip `//` comment lines first
    // so this only checks the actual JSONC content, not the doc comment that
    // explains the mechanism.
    const raw = readFileSync(join(THIS_DIR, "..", "wrangler.jsonc"), "utf-8");
    const jsoncOnly = raw
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    expect(jsoncOnly).not.toContain("CF_ACCESS_DISABLED");
  });

  it("locks the API to the host of its route (preview URLs must never reach R2)", () => {
    // If RACKULA_API_HOST is dropped or drifts from the route, every version
    // preview URL reaches the API with only the JWT check in front of it.
    const raw = readFileSync(join(THIS_DIR, "..", "wrangler.jsonc"), "utf-8");
    const routeHost = raw.match(/"pattern":\s*"([^"/]+)\/\*"/)?.[1];
    const lockHost = raw.match(/"RACKULA_API_HOST":\s*"([^"]*)"/)?.[1];
    expect(routeHost).toBeTruthy();
    expect(lockHost).toBe(routeHost);
  });
});
