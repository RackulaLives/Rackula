import { describe, expect, it } from "bun:test";
import pkg from "../package.json";
import { createApp, resolveVersionInfo } from "./app";
import type { EnvMap } from "./security";

const TEST_AUTH_SECRET = "rackula-auth-session-secret-for-tests-0123456789";

function buildEnv(overrides: EnvMap = {}): EnvMap {
  return { NODE_ENV: "test", ...overrides };
}

describe("resolveVersionInfo", () => {
  it("reports the injected APP_VERSION build metadata", () => {
    const info = resolveVersionInfo(
      buildEnv({
        APP_VERSION: "0.9.5",
        APP_COMMIT: "abc1234",
        APP_BUILD_TIME: "2026-05-25T00:00:00.000Z",
      }),
    );

    expect(info.version).toBe("0.9.5");
    expect(info.commit).toBe("abc1234");
    expect(info.buildTime).toBe("2026-05-25T00:00:00.000Z");
  });

  it("falls back to the package.json version when APP_VERSION is unset", () => {
    expect(resolveVersionInfo(buildEnv()).version).toBe(pkg.version);
  });

  it("treats a blank APP_VERSION as unset and falls back to package.json", () => {
    expect(resolveVersionInfo(buildEnv({ APP_VERSION: "   " })).version).toBe(
      pkg.version,
    );
  });

  it("omits commit and buildTime when not injected", () => {
    const info = resolveVersionInfo(buildEnv());
    expect(info.commit).toBe("");
    expect(info.buildTime).toBe("");
  });
});

describe("version endpoint", () => {
  it("serves the full version contract at both /version and /api/version", async () => {
    const app = await createApp(
      buildEnv({
        APP_VERSION: "1.2.3",
        APP_COMMIT: "deadbee",
        APP_BUILD_TIME: "2026-05-25T12:00:00.000Z",
      }),
    );

    for (const path of ["/version", "/api/version"]) {
      const res = await app.request(path);
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        version: string;
        commit: string;
        buildTime: string;
      };
      expect(body.version).toBe("1.2.3");
      expect(body.commit).toBe("deadbee");
      expect(body.buildTime).toBe("2026-05-25T12:00:00.000Z");
    }
  });

  it("remains public when the authentication gate is enabled", async () => {
    const app = await createApp(
      buildEnv({
        APP_VERSION: "1.2.3",
        RACKULA_AUTH_MODE: "oidc",
        RACKULA_AUTH_SESSION_SECRET: TEST_AUTH_SECRET,
        CORS_ORIGIN: "https://rack.example.com",
      }),
    );

    const res = await app.request("/api/version");
    expect(res.status).toBe(200);
  });
});
