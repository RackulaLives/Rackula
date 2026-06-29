/**
 * Workers-only stub for `@node-rs/argon2` (#2626).
 *
 * `@node-rs/argon2` is a native `.node` addon that cannot be bundled for or run
 * on workerd, so the Worker build fails if it is reachable. Local auth (the only
 * argon2 caller) loads via dynamic import in app.ts and only when
 * AUTH_MODE=local; the Worker always runs AUTH_MODE=none, so argon2 is never
 * reached. This stub is aliased in its place (wrangler.jsonc `alias`) to keep
 * the addon out of the bundle. Every export throws, so any accidental call on
 * Workers fails loudly rather than silently degrading auth.
 */

const UNAVAILABLE =
  "argon2 is unavailable on Cloudflare Workers (AUTH_MODE=none)";

export const Algorithm = {
  Argon2d: 0,
  Argon2i: 1,
  Argon2id: 2,
} as const;

export function hash(): never {
  throw new Error(UNAVAILABLE);
}

export function verify(): never {
  throw new Error(UNAVAILABLE);
}
