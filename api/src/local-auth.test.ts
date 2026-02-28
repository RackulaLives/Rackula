import { afterEach, describe, expect, it } from "bun:test";
import {
  bootstrapLocalCredentials,
  createLoginRateLimiter,
  hashPassword,
  verifyCredentials,
  verifyPasswordHash,
  type LocalCredentials,
  type LoginRateLimiter,
} from "./local-auth";
import type { EnvMap } from "./security";

function buildLocalEnv(overrides: EnvMap = {}): EnvMap {
  return {
    RACKULA_LOCAL_USERNAME: "admin",
    RACKULA_LOCAL_PASSWORD: "secure-password-12chars-min",
    ...overrides,
  };
}

describe("bootstrapLocalCredentials", () => {
  it("returns username and argon2id hash for valid input", async () => {
    const creds = await bootstrapLocalCredentials(buildLocalEnv());
    expect(creds.username).toBe("admin");
    expect(creds.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it("trims whitespace from username", async () => {
    const creds = await bootstrapLocalCredentials(
      buildLocalEnv({ RACKULA_LOCAL_USERNAME: "  admin  " }),
    );
    expect(creds.username).toBe("admin");
  });

  it("throws when RACKULA_LOCAL_USERNAME is missing", async () => {
    await expect(
      bootstrapLocalCredentials(
        buildLocalEnv({ RACKULA_LOCAL_USERNAME: undefined }),
      ),
    ).rejects.toThrow(
      "RACKULA_LOCAL_USERNAME is required when AUTH_MODE=local",
    );
  });

  it("throws when RACKULA_LOCAL_USERNAME is empty", async () => {
    await expect(
      bootstrapLocalCredentials(buildLocalEnv({ RACKULA_LOCAL_USERNAME: "" })),
    ).rejects.toThrow(
      "RACKULA_LOCAL_USERNAME is required when AUTH_MODE=local",
    );
  });

  it("throws when RACKULA_LOCAL_USERNAME is whitespace-only", async () => {
    await expect(
      bootstrapLocalCredentials(
        buildLocalEnv({ RACKULA_LOCAL_USERNAME: "   " }),
      ),
    ).rejects.toThrow(
      "RACKULA_LOCAL_USERNAME is required when AUTH_MODE=local",
    );
  });

  it("throws when RACKULA_LOCAL_USERNAME exceeds 255 characters", async () => {
    await expect(
      bootstrapLocalCredentials(
        buildLocalEnv({ RACKULA_LOCAL_USERNAME: "a".repeat(256) }),
      ),
    ).rejects.toThrow("at most 255 characters");
  });

  it("throws when RACKULA_LOCAL_PASSWORD is missing", async () => {
    await expect(
      bootstrapLocalCredentials(
        buildLocalEnv({ RACKULA_LOCAL_PASSWORD: undefined }),
      ),
    ).rejects.toThrow(
      "RACKULA_LOCAL_PASSWORD is required when AUTH_MODE=local",
    );
  });

  it("throws when RACKULA_LOCAL_PASSWORD is empty", async () => {
    await expect(
      bootstrapLocalCredentials(buildLocalEnv({ RACKULA_LOCAL_PASSWORD: "" })),
    ).rejects.toThrow(
      "RACKULA_LOCAL_PASSWORD is required when AUTH_MODE=local",
    );
  });

  it("throws when password is shorter than 12 characters", async () => {
    await expect(
      bootstrapLocalCredentials(
        buildLocalEnv({ RACKULA_LOCAL_PASSWORD: "short-pass" }),
      ),
    ).rejects.toThrow("at least 12 characters");
  });

  it("accepts password exactly 12 characters long", async () => {
    const creds = await bootstrapLocalCredentials(
      buildLocalEnv({ RACKULA_LOCAL_PASSWORD: "exactly12chr" }),
    );
    expect(creds.passwordHash).toMatch(/^\$argon2id\$/);
  });
});

describe("hashPassword / verifyPasswordHash", () => {
  it("round-trips: hash then verify returns true", async () => {
    const password = "test-password-12chars";
    const hashed = await hashPassword(password);
    expect(hashed).toMatch(/^\$argon2id\$/);
    expect(await verifyPasswordHash(hashed, password)).toBe(true);
  });

  it("rejects wrong password", async () => {
    const hashed = await hashPassword("correct-password-123");
    expect(await verifyPasswordHash(hashed, "wrong-password-1234")).toBe(false);
  });

  it("returns false for malformed hash", async () => {
    expect(await verifyPasswordHash("not-a-hash", "anything")).toBe(false);
  });
});

describe("createLoginRateLimiter", () => {
  let limiter: LoginRateLimiter;

  afterEach(() => {
    limiter?.stopCleanup();
  });

  it("allows a fresh IP", () => {
    limiter = createLoginRateLimiter();
    expect(limiter.check("1.2.3.4")).toEqual({ allowed: true });
  });

  it("blocks at exactly 5 failures", () => {
    limiter = createLoginRateLimiter();
    const ip = "10.0.0.1";
    for (let i = 0; i < 4; i++) {
      limiter.recordFailure(ip);
    }
    expect(limiter.check(ip).allowed).toBe(true);
    limiter.recordFailure(ip);
    expect(limiter.check(ip).allowed).toBe(false);
  });

  it("provides retryAfterMs when blocked", () => {
    limiter = createLoginRateLimiter();
    const ip = "10.0.0.2";
    for (let i = 0; i < 5; i++) {
      limiter.recordFailure(ip);
    }
    const result = limiter.check(ip);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("resets counter on success", () => {
    limiter = createLoginRateLimiter();
    const ip = "10.0.0.3";
    for (let i = 0; i < 4; i++) {
      limiter.recordFailure(ip);
    }
    limiter.recordSuccess(ip);
    expect(limiter.check(ip).allowed).toBe(true);
  });

  it("tracks different IPs independently", () => {
    limiter = createLoginRateLimiter();
    for (let i = 0; i < 5; i++) {
      limiter.recordFailure("blocked-ip");
    }
    expect(limiter.check("blocked-ip").allowed).toBe(false);
    expect(limiter.check("other-ip").allowed).toBe(true);
  });
});

describe("verifyCredentials", () => {
  let credentials: LocalCredentials;

  // Hash once for all tests in this describe block
  const setup = async () => {
    const passwordHash = await hashPassword("correct-password-12");
    return { username: "admin", passwordHash };
  };

  it("returns true for correct username and password", async () => {
    credentials = await setup();
    expect(
      await verifyCredentials("admin", "correct-password-12", credentials),
    ).toBe(true);
  });

  it("returns false for wrong password", async () => {
    credentials = await setup();
    expect(
      await verifyCredentials("admin", "wrong-password-1234", credentials),
    ).toBe(false);
  });

  it("returns false for wrong username", async () => {
    credentials = await setup();
    expect(
      await verifyCredentials("notadmin", "correct-password-12", credentials),
    ).toBe(false);
  });

  it("returns false when both username and password are wrong", async () => {
    credentials = await setup();
    expect(
      await verifyCredentials("notadmin", "wrong-password-1234", credentials),
    ).toBe(false);
  });
});
