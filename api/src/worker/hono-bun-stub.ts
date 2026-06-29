/**
 * Workers-only stub for `hono/bun` (#2626).
 *
 * `src/security/rate-limit-middleware.ts` imports `getConnInfo` from `hono/bun`
 * to resolve the socket peer address on the self-host Bun path. The `hono/bun`
 * adapter has a top-level `var { write } = Bun;` (its SSG helper), which throws
 * `ReferenceError: Bun is not defined` at module eval on workerd. Aliasing
 * `hono/bun` to this stub for the Worker bundle (wrangler.jsonc `alias`) swaps in
 * the Cloudflare Workers connInfo resolver, which reads the real client IP from
 * the `cf-connecting-ip` header. The Bun path keeps the real `hono/bun`.
 */
export { getConnInfo } from "hono/cloudflare-workers";
