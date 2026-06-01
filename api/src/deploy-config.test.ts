import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Regression tests for Docker/nginx deployment configuration.
 *
 * These tests validate that critical environment variables are included
 * in the nginx envsubst filter so they are actually substituted into
 * the template at container startup. Missing variables cause silent
 * failures (the template contains literal ${VAR} strings).
 */
describe("Dockerfile envsubst filter", () => {
  const dockerfilePath = join(
    import.meta.dir,
    "..",
    "..",
    "deploy",
    "Dockerfile",
  );
  const dockerfile = readFileSync(dockerfilePath, "utf-8");

  const filterLine = dockerfile
    .split("\n")
    .find((line) => line.startsWith("ENV NGINX_ENVSUBST_FILTER="));

  it("has NGINX_ENVSUBST_FILTER in Dockerfile", () => {
    expect(
      filterLine,
      "missing ENV NGINX_ENVSUBST_FILTER in Dockerfile",
    ).toBeDefined();
  });

  const requiredVars = [
    "API_HOST",
    "API_PORT",
    "API_WRITE_TOKEN",
    "RACKULA_AUTH_MODE",
    "AUTH_MODE",
    "RACKULA_LISTEN_PORT",
    "RACKULA_IPV6_LISTEN",
    "NGINX_RESOLVER",
    "RACKULA_TRUST_PROXY",
  ];

  it.each(requiredVars)(
    "includes %s in NGINX_ENVSUBST_FILTER",
    (varName: string) => {
      expect(filterLine).toContain(varName);
    },
  );
});

describe("nginx trust-proxy configuration", () => {
  const templatePath = join(
    import.meta.dir,
    "..",
    "..",
    "deploy",
    "nginx.conf.template",
  );
  const template = readFileSync(templatePath, "utf-8");

  it("uses $real_scheme for X-Forwarded-Proto in auth proxy snippet", () => {
    const snippetPath = join(
      import.meta.dir,
      "..",
      "..",
      "deploy",
      "nginx-auth-proxy.conf",
    );
    const snippet = readFileSync(snippetPath, "utf-8");
    expect(snippet).toContain("X-Forwarded-Proto $real_scheme");
  });

  it("defines the $real_scheme map with RACKULA_TRUST_PROXY", () => {
    expect(template).toContain('"${RACKULA_TRUST_PROXY}"');
    expect(template).toContain("$real_scheme");
    expect(template).toContain('"1:https"');
  });

  it("uses $real_scheme in auth login redirect", () => {
    expect(template).toMatch(
      /return\s+302\s+\$real_scheme:\/\/\$http_host\/auth\/login/,
    );
  });
});
