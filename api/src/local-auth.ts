import { hash, verify, Algorithm } from "@node-rs/argon2";
import { timingSafeEqual } from "node:crypto";
import type { EnvMap } from "./security";

export interface LocalCredentials {
  username: string;
  passwordHash: string;
}

// OWASP-recommended Argon2id parameters
const ARGON2_MEMORY_COST = 65536; // 64 MiB
const ARGON2_TIME_COST = 3;
const ARGON2_PARALLELISM = 4;
const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 1024;
const MAX_USERNAME_LENGTH = 255;

// Rate limiter defaults
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60_000; // 60 seconds
const CLEANUP_INTERVAL_MS = 5 * 60_000; // 5 minutes
const ENTRY_TTL_MS = 2 * 60_000; // 2 minutes

interface RateLimitEntry {
  attempts: number;
  firstAttemptAt: number;
  lastAttemptAt: number;
}

export interface LoginRateLimiter {
  check(ip: string): { allowed: boolean; retryAfterMs?: number };
  recordFailure(ip: string): void;
  recordSuccess(ip: string): void;
  stopCleanup(): void;
}

/**
 * Hash a password using Argon2id with OWASP-recommended parameters.
 * @param password - The plaintext password to hash.
 * @returns The Argon2id hash string.
 */
export async function hashPassword(password: string): Promise<string> {
  return hash(password, {
    algorithm: Algorithm.Argon2id,
    memoryCost: ARGON2_MEMORY_COST,
    timeCost: ARGON2_TIME_COST,
    parallelism: ARGON2_PARALLELISM,
  });
}

/**
 * Verify a plaintext password against an Argon2id hash.
 * @param hashed - The stored Argon2id hash string.
 * @param password - The plaintext password to verify.
 * @returns `true` if the password matches; `false` otherwise (including invalid hashes).
 */
export async function verifyPasswordHash(
  hashed: string,
  password: string,
): Promise<boolean> {
  try {
    return await verify(hashed, password);
  } catch {
    return false;
  }
}

export async function bootstrapLocalCredentials(
  env: EnvMap = process.env,
): Promise<LocalCredentials> {
  const username = (env.RACKULA_LOCAL_USERNAME ?? "").trim();
  if (!username) {
    throw new Error("RACKULA_LOCAL_USERNAME is required when AUTH_MODE=local.");
  }
  if (username.length > MAX_USERNAME_LENGTH) {
    throw new Error(
      `RACKULA_LOCAL_USERNAME must be at most ${MAX_USERNAME_LENGTH} characters.`,
    );
  }

  const password = env.RACKULA_LOCAL_PASSWORD ?? "";
  if (!password) {
    throw new Error("RACKULA_LOCAL_PASSWORD is required when AUTH_MODE=local.");
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `RACKULA_LOCAL_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    );
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new Error(
      `RACKULA_LOCAL_PASSWORD must be at most ${MAX_PASSWORD_LENGTH} characters.`,
    );
  }

  const passwordHash = await hashPassword(password);
  return { username, passwordHash };
}

export function createLoginRateLimiter(): LoginRateLimiter {
  const entries = new Map<string, RateLimitEntry>();

  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of entries) {
      if (now - entry.lastAttemptAt > ENTRY_TTL_MS) {
        entries.delete(ip);
      }
    }
  }, CLEANUP_INTERVAL_MS);

  // Allow cleanup timer to not prevent process exit
  if (typeof cleanup === "object" && "unref" in cleanup) {
    cleanup.unref();
  }

  return {
    check(ip: string): { allowed: boolean; retryAfterMs?: number } {
      const entry = entries.get(ip);
      if (!entry) {
        return { allowed: true };
      }

      const now = Date.now();
      const windowStart = now - WINDOW_MS;

      // Window expired — reset
      if (entry.firstAttemptAt < windowStart) {
        entries.delete(ip);
        return { allowed: true };
      }

      if (entry.attempts >= MAX_ATTEMPTS) {
        const retryAfterMs = entry.firstAttemptAt + WINDOW_MS - now;
        return { allowed: false, retryAfterMs: Math.max(0, retryAfterMs) };
      }

      return { allowed: true };
    },

    recordFailure(ip: string): void {
      const now = Date.now();
      const entry = entries.get(ip);

      if (!entry || entry.firstAttemptAt < now - WINDOW_MS) {
        entries.set(ip, {
          attempts: 1,
          firstAttemptAt: now,
          lastAttemptAt: now,
        });
        return;
      }

      entry.attempts += 1;
      entry.lastAttemptAt = now;
    },

    recordSuccess(ip: string): void {
      entries.delete(ip);
    },

    stopCleanup(): void {
      clearInterval(cleanup);
    },
  };
}

/**
 * Timing-safe credential verification.
 *
 * Compares username with constant-time buffer comparison (padded to equal length)
 * and verifies password with Argon2id. Never leaks which field failed.
 */
export async function verifyCredentials(
  username: string,
  password: string,
  credentials: LocalCredentials,
): Promise<boolean> {
  // Timing-safe username comparison using padded buffers
  const maxLen = Math.max(
    Buffer.byteLength(username, "utf-8"),
    Buffer.byteLength(credentials.username, "utf-8"),
    1,
  );
  const presentedBuf = Buffer.alloc(maxLen, 0);
  const expectedBuf = Buffer.alloc(maxLen, 0);
  presentedBuf.write(username, "utf-8");
  expectedBuf.write(credentials.username, "utf-8");

  const usernameMatch = timingSafeEqual(presentedBuf, expectedBuf);

  // Always verify password regardless of username result to prevent timing leaks
  const passwordMatch = await verifyPasswordHash(
    credentials.passwordHash,
    password,
  );

  return usernameMatch && passwordMatch;
}
