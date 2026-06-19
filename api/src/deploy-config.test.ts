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

/**
 * Query string preservation through the nginx API proxy (#1011).
 *
 * The /api/ prefix location strips the prefix with "rewrite ... break" and
 * forwards via a URI-less proxy_pass. nginx forwards the rewritten request URI,
 * including the original query string, so query params survive without explicit
 * $args handling. These guards fail if someone appends an explicit URI to that
 * proxy_pass (e.g. $uri$is_args$args), which would double-apply the path and can
 * drop or duplicate query parameters.
 *
 * docker compose + curl verification (not feasible in CI) is documented in the
 * issue Test Plan; these config guards cover the structural invariant instead.
 */
describe("nginx API proxy query string preservation", () => {
  const deployDir = join(import.meta.dir, "..", "..", "deploy");
  const configs = [
    ["Docker template", "nginx.conf.template"],
    ["LXC config", "lxc/nginx.conf"],
  ] as const;

  // Isolate the prefix "location /api/ { ... }" block (not the "= /api/"
  // exact-match error blocks, which have no proxy_pass). The block runs from
  // the location line to its error_page fallback; a missing anchor throws here
  // rather than silently slicing the wrong region.
  const extractApiPrefixBlock = (config: string): string => {
    const marker = config.indexOf("location /api/ {");
    expect(marker, "missing 'location /api/' prefix block").toBeGreaterThan(-1);
    const blockEnd = config.indexOf("error_page", marker);
    expect(
      blockEnd,
      "missing error_page fallback in /api/ block",
    ).toBeGreaterThan(marker);
    return config.slice(marker, blockEnd);
  };

  describe.each(configs)("%s", (_label, file) => {
    const block = extractApiPrefixBlock(
      readFileSync(join(deployDir, file), "utf-8"),
    );
    const proxyPassLine = block
      .split("\n")
      .find((line) => line.trim().startsWith("proxy_pass"));

    it("strips the /api prefix with rewrite ... break", () => {
      expect(block).toContain("rewrite ^/api(/.*)$ $1 break;");
    });

    it("uses a URI-less proxy_pass so the rewritten path and query survive", () => {
      // URI-less form ends at host:port (no path segment). An appended URI here
      // would re-apply the path on top of the rewrite and risk dropping the
      // query string, so the proxy_pass must stop at the first ";".
      expect(proxyPassLine, "missing proxy_pass in /api/ block").toMatch(
        /proxy_pass\s+http:\/\/[^/]+;/,
      );
    });

    it("carries the query string on the explicit /api/health upstream URI", () => {
      // Exact-match endpoints set an explicit upstream URI, so they must append
      // $is_args$args to forward the query string (the URI-less rule above does
      // not apply when proxy_pass includes a path).
      const config = readFileSync(join(deployDir, file), "utf-8");
      expect(config).toContain("/health$is_args$args;");
    });
  });
});
