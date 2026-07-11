import { hash, verify, Algorithm } from "@node-rs/argon2";
import { timingSafeEqual } from "node:crypto";
import type { EnvMap } from "./security";
import { createSemaphore } from "./security/semaphore";

export interface LocalCredentials {
  username: string;
  passwordHash: string;
}

// OWASP-recommended Argon2id parameters
const ARGON2_MEMORY_COST = 65536; // 64 MiB
const ARGON2_TIME_COST = 3;
const ARGON2_PARALLELISM = 4;
const MIN_PASSWORD_LENGTH = 12;

/**
 * Maximum Argon2id verifications allowed to run concurrently across the whole
 * process.
 *
 * Each verify() call allocates ARGON2_MEMORY_COST (64 MiB) regardless of the
 * caller's identity. The per-IP login limiter throttles a single source, but a
 * flood distributed across many source IPs can still drive unbounded concurrent
 * 64 MiB allocations. Capping concurrency bounds worst-case argon2 memory use
 * to this many * 64 MiB regardless of how the flood is spread across sources.
 */
export const ARGON2_MAX_CONCURRENT_VERIFICATIONS = 4;

/**
 * Maximum verifications allowed to wait for a concurrency slot before the gate
 * sheds load.
 *
 * Serializing argon2 lowers throughput, so under a sustained flood the wait
 * queue would otherwise grow without bound and re-introduce memory exhaustion
 * via parked login handlers. Once this many callers are queued, further
 * verifications are rejected immediately (surfaced as a failed login) instead
 * of being enqueued, keeping worst-case memory and latency bounded. The bound
 * is generous relative to any legitimate self-hosted concurrent-login load.
 */
export const ARGON2_MAX_QUEUED_VERIFICATIONS = 64;

/**
 * Global, IP-agnostic semaphore bounding concurrent Argon2id verifications and
 * shedding excess load. Shared by every password verification so the bound
 * holds regardless of how many distinct sources request verification.
 */
export const argon2VerificationGate = createSemaphore(
  ARGON2_MAX_CONCURRENT_VERIFICATIONS,
  ARGON2_MAX_QUEUED_VERIFICATIONS,
);
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
 *
 * Verification runs through {@link argon2VerificationGate}, a global concurrency
 * cap. When the gate is saturated (flood), the call is rejected without
 * allocating argon2 memory and is treated as a non-match, shedding load rather
 * than exhausting memory.
 * @param hashed - The stored Argon2id hash string.
 * @param password - The plaintext password to verify.
 * @returns `true` if the password matches; `false` otherwise (including invalid
 *   hashes and gate saturation).
 */
export async function verifyPasswordHash(
  hashed: string,
  password: string,
): Promise<boolean> {
  try {
    return await argon2VerificationGate.run(() => verify(hashed, password));
  } catch {
    // Invalid hash or gate saturation: treat as a non-match (load shedding).
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
