# Alerts 122-127 (and 119-121): better-auth 1.6.33 advisories

Tool: Trivy (filesystem scan of `api/bun.lock`; the same package also appears in the api image, alerts 119-121).

| Alert(s) | Advisory | Severity | Fixed in |
| --- | --- | --- | --- |
| 122, 125 | CVE-2026-114607 (OAuth state redeemable as Magic Link token) | critical | 1.7.7 |
| 123, 126 | GHSA-q84f-53jg-9ppm (device login approval) | high | 1.7.0-rc.3 |
| 124, 127 | GHSA-r4xp-prcw-77qf (OAuth Proxy sign-in as another user) | high | 1.7.7 |

## Analysis

`api/src/auth/config.ts` only enables the `genericOAuth` plugin. It does not enable `magicLink`, `deviceAuthorization`, or `oauthProxy`, which each advisory requires. Rackula is therefore not currently exploitable through these. Confidence: high.

The package is still flagged, and the api image release gate (`scan-images`) reads only `.trivyignore`, so the gate will fail on the image findings until better-auth is upgraded or an entry is added.

## Why no code change was made

A trial bump of `"better-auth": "~1.6.33"` to `"~1.7.15"` (lockfile resolves cleanly) breaks `bunx tsc --noEmit` and 14 `bun test` cases:

- `src/auth/client.ts:2`: `genericOAuthClient` is no longer exported from `better-auth/client/plugins`.
- `src/auth/config.ts:489`: `getUserInfo` return type `VerifiedOidcUserInfo` is no longer assignable to `GenericOAuthUserInfo` (needs an index signature).

This is a minor-version migration of the auth layer, so it needs a human to move the imports, adjust the types, and re-run the auth tests.

## Suggested fix

```diff
-    "better-auth": "~1.6.33",
+    "better-auth": "~1.7.15",
```

Then `cd api && bun install`, fix the two type errors above (check the 1.7 migration notes for the new `genericOAuthClient` import path and `GenericOAuthUserInfo` shape), and run `bun run typecheck && bun test`.

The filesystem alerts clear on the next scan. The api image alerts (119-121) clear only after a release or the `Rebuild Images (OS patch)` workflow rebuilds the image. If the upgrade cannot land before the next release, add `.trivyignore` entries (with `exp:` 90 days out) for the three ids, citing the non-use of magicLink, deviceAuthorization, and oauthProxy.
