import { describe, expect, it } from "bun:test";
import {
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWK,
  type JWTVerifyGetKey,
  type CryptoKey,
} from "jose";
import {
  CF_ACCESS_JWT_HEADER,
  createAccessJwtValidator,
  resolveAccessJwtConfig,
  type AccessJwtConfig,
} from "./access-jwt";

const ISSUER = "https://test-team.cloudflareaccess.com";
const AUD = "test-access-aud-tag";
const CONFIG: AccessJwtConfig = {
  jwksUrl: "https://test-team.cloudflareaccess.com/cdn-cgi/access/certs",
  issuer: ISSUER,
  audience: AUD,
};

interface TestKeys {
  privateKey: CryptoKey;
  jwk: JWK & { kid: string };
}

/** Mint an in-test RS256 keypair and a JWKS resolver the validator can read. */
async function makeKeys(): Promise<TestKeys> {
  const { publicKey, privateKey } = await generateKeyPair("RS256", {
    extractable: true,
  });
  const jwk = await exportJWK(publicKey);
  jwk.kid = "test-kid";
  jwk.alg = "RS256";
  jwk.use = "sig";
  return { privateKey, jwk: jwk as JWK & { kid: string } };
}

/** A local JWKS resolver standing in for createRemoteJWKSet (no network). */
function localJwks(jwk: JWK & { kid: string }): JWTVerifyGetKey {
  return async () => {
    const { importJWK } = await import("jose");
    return (await importJWK(jwk, "RS256")) as CryptoKey;
  };
}

async function mintToken(
  privateKey: CryptoKey,
  overrides: { issuer?: string; audience?: string; kid?: string } = {},
): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256", kid: overrides.kid ?? "test-kid" })
    .setIssuer(overrides.issuer ?? ISSUER)
    .setAudience(overrides.audience ?? AUD)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
}

function requestWithToken(token?: string): Request {
  const headers = new Headers();
  if (token !== undefined) {
    headers.set(CF_ACCESS_JWT_HEADER, token);
  }
  return new Request("https://worker.example/api/version", { headers });
}

describe("resolveAccessJwtConfig", () => {
  it("throws (fails closed) when no Access env vars are set and there is no explicit opt-out", () => {
    // A deployed Worker that forgot to configure Access must not fail open
    // (#2913).
    expect(() => resolveAccessJwtConfig({})).toThrow(/not configured/);
  });

  it("returns null when no Access env vars are set and CF_ACCESS_DISABLED=true is explicitly set", () => {
    // The local `wrangler dev` opt-out.
    expect(resolveAccessJwtConfig({ CF_ACCESS_DISABLED: "true" })).toBeNull();
  });

  it("throws (fails closed) when CF_ACCESS_DISABLED is set to anything other than 'true'", () => {
    expect(() => resolveAccessJwtConfig({ CF_ACCESS_DISABLED: "1" })).toThrow(
      /not configured/,
    );
  });

  it("throws (fails closed) when Access config is only partially set", () => {
    // An incomplete production config must not silently disable the auth gate.
    expect(() =>
      resolveAccessJwtConfig({
        CF_ACCESS_JWKS_URL: CONFIG.jwksUrl,
        CF_ACCESS_ISSUER: ISSUER,
        // CF_ACCESS_AUD missing
      }),
    ).toThrow(/partially configured/);
  });

  it("resolves config when all three Access env vars are set", () => {
    expect(
      resolveAccessJwtConfig({
        CF_ACCESS_JWKS_URL: CONFIG.jwksUrl,
        CF_ACCESS_ISSUER: ISSUER,
        CF_ACCESS_AUD: AUD,
      }),
    ).toEqual(CONFIG);
  });
});

describe("createAccessJwtValidator", () => {
  it("skips validation when config is null (unconfigured)", async () => {
    const validator = createAccessJwtValidator(null);
    expect(validator.enabled).toBe(false);
    const result = await validator.validate(requestWithToken());
    expect(result.status).toBe("skipped");
  });

  it("accepts a valid token", async () => {
    const { privateKey, jwk } = await makeKeys();
    const validator = createAccessJwtValidator(CONFIG, {
      jwks: localJwks(jwk),
    });
    expect(validator.enabled).toBe(true);
    const token = await mintToken(privateKey);
    const result = await validator.validate(requestWithToken(token));
    expect(result.status).toBe("valid");
  });

  it("rejects a missing token with status missing", async () => {
    const { jwk } = await makeKeys();
    const validator = createAccessJwtValidator(CONFIG, {
      jwks: localJwks(jwk),
    });
    const result = await validator.validate(requestWithToken());
    expect(result.status).toBe("missing");
  });

  it("rejects a token with the wrong issuer", async () => {
    const { privateKey, jwk } = await makeKeys();
    const validator = createAccessJwtValidator(CONFIG, {
      jwks: localJwks(jwk),
    });
    const token = await mintToken(privateKey, {
      issuer: "https://evil.example.com",
    });
    const result = await validator.validate(requestWithToken(token));
    expect(result.status).toBe("invalid");
  });

  it("rejects a token with the wrong audience", async () => {
    const { privateKey, jwk } = await makeKeys();
    const validator = createAccessJwtValidator(CONFIG, {
      jwks: localJwks(jwk),
    });
    const token = await mintToken(privateKey, { audience: "wrong-aud" });
    const result = await validator.validate(requestWithToken(token));
    expect(result.status).toBe("invalid");
  });

  it("fails closed (invalid) when the configured JWKS URL is malformed", async () => {
    // No `jwks` override, so the real default path runs and `new URL` throws on
    // the malformed value. The validator must deny (not throw, not skip).
    const validator = createAccessJwtValidator({
      jwksUrl: "not-a-url",
      issuer: ISSUER,
      audience: AUD,
    });
    expect(validator.enabled).toBe(true);
    const result = await validator.validate(
      requestWithToken("any.token.value"),
    );
    expect(result.status).toBe("invalid");
  });

  it("rejects a token signed by an unknown key", async () => {
    const trusted = await makeKeys();
    const attacker = await makeKeys();
    const validator = createAccessJwtValidator(CONFIG, {
      jwks: localJwks(trusted.jwk),
    });
    // Token signed by the attacker key, but validator only trusts `trusted`.
    const token = await mintToken(attacker.privateKey);
    const result = await validator.validate(requestWithToken(token));
    expect(result.status).toBe("invalid");
  });
});
