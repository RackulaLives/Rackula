import { describe, expect, it } from "bun:test";
import { normalizeNextPath } from "./app";
import { createAuth } from "./auth/config";
import type { EnvMap } from "./security";

const TEST_AUTH_SECRET = "rackula-auth-session-secret-for-tests-0123456789";

describe("normalizeNextPath CRLF injection (#1371)", () => {
  it("rejects paths containing carriage return", () => {
    expect(normalizeNextPath("/foo\rbar")).toBe("/");
  });

  it("rejects paths containing newline", () => {
    expect(normalizeNextPath("/foo\nbar")).toBe("/");
  });

  it("rejects paths containing null byte", () => {
    expect(normalizeNextPath("/foo\0bar")).toBe("/");
  });

  it("rejects CRLF sequence used for HTTP response splitting", () => {
    expect(normalizeNextPath("/foo\r\nSet-Cookie: evil=true")).toBe("/");
  });

  it("still allows valid paths", () => {
    expect(normalizeNextPath("/dashboard")).toBe("/dashboard");
    expect(normalizeNextPath("/settings/profile")).toBe("/settings/profile");
  });

  it("still rejects other invalid paths", () => {
    expect(normalizeNextPath(undefined)).toBe("/");
    expect(normalizeNextPath("")).toBe("/");
    expect(normalizeNextPath("http://evil.com")).toBe("/");
    expect(normalizeNextPath("//evil.com")).toBe("/");
  });
});

describe("OIDC issuer pinning validation (#1372)", () => {
  function buildOidcEnv(overrides: EnvMap = {}): EnvMap {
    return {
      NODE_ENV: "test",
      RACKULA_AUTH_MODE: "oidc",
      RACKULA_AUTH_SESSION_SECRET: TEST_AUTH_SECRET,
      CORS_ORIGIN: "https://rack.example.com",
      RACKULA_BASE_URL: "https://rack.example.com",
      RACKULA_OIDC_CLIENT_ID: "rackula-web",
      RACKULA_OIDC_CLIENT_SECRET: "oidc-client-secret",
      ...overrides,
    };
  }

  it("throws when RACKULA_OIDC_DISCOVERY_URL is set without RACKULA_OIDC_ISSUER", () => {
    const env = buildOidcEnv({
      RACKULA_OIDC_DISCOVERY_URL:
        "https://auth.example.com/.well-known/openid-configuration",
    });

    expect(() => createAuth(TEST_AUTH_SECRET, env)).toThrow(
      /RACKULA_OIDC_DISCOVERY_URL requires RACKULA_OIDC_ISSUER/,
    );
  });

  it("does not throw when both RACKULA_OIDC_DISCOVERY_URL and RACKULA_OIDC_ISSUER are set", () => {
    const env = buildOidcEnv({
      RACKULA_OIDC_DISCOVERY_URL:
        "https://auth.example.com/.well-known/openid-configuration",
      RACKULA_OIDC_ISSUER: "https://auth.example.com",
    });

    // Should not throw — createAuth will return without error
    // (it may fail later when fetching discovery, but config validation passes)
    expect(() => createAuth(TEST_AUTH_SECRET, env)).not.toThrow();
  });

  it("does not throw when only RACKULA_OIDC_ISSUER is set (discovery URL derived)", () => {
    const env = buildOidcEnv({
      RACKULA_OIDC_ISSUER: "https://auth.example.com",
    });

    expect(() => createAuth(TEST_AUTH_SECRET, env)).not.toThrow();
  });
});
