# Hosted Cloud Sync and Auth (Multi-Tenant) Design

Date: 2026-06-17 Status: Approved (brainstorming complete) Branch: claude/rackula-cloudflare-auth-0a7397

## Purpose and honest framing

Add an optional, public-facing hosted version of Rackula that saves rack layouts per authenticated user, deployed on Cloudflare. The self-hosted app stays free and fully featured.

The primary goal is learning: how to run multi-tenant auth, multi-tenant data, and (later) billing on a system real enough to teach the hard parts. Recouping the time and tokens spent on the project is a welcome bonus, not a plan. This framing is deliberate, because the anti-enshittification invariants below cap revenue potential by design (every paid value has a free, one-click substitute), and we are choosing that trade knowingly.

### Why not bring-your-own-storage instead

A simpler design (save to the user's Google Drive / Dropbox / GitHub Gist, the draw.io model) would deliver "my layouts, anywhere" with no accounts, no stored PII, no multi-tenant ops, and maximal enshittification resistance. We are not choosing it for one reason only: it cannot provide a billing relationship, and learning commercialization requires something we host and could charge for. That single requirement, not technical necessity, justifies the heavier accounts-based design. If the learning-commercialization goal were ever dropped, bring-your-own-storage would be the better choice.

## Anti-enshittification invariants (binding)

These are non-negotiable constraints on every phase:

1. The app stays fully functional with no account. Cloud sync is additive.
2. Free, complete, one-click export at every tier. Export is never paywalled.
3. One-click real account and data deletion (`DELETE /api/me`). No dark patterns.
4. Self-hosted stays fully featured under MIT. The escape hatch is permanent.
5. Monetize storage and convenience only. Never ads, never selling layout data.
6. Grandfather existing users on price and quota changes. New terms apply to new signups; existing users keep the terms they joined under.

## Phasing

The two hardest pieces (multi-tenant data, and auth security) are sequenced rather than stacked.

- Phase 1a: Cloudflare Access on both environments. Zero custom auth code. Build and validate the per-user data stack (D1 scoping, R2 storage, consistency rule, quotas, sync, reconcile). Access injects a verified identity; the Worker reads it as `user_id`.
- Phase 1b: replace Access-on-prod with the app's own OAuth sessions (GitHub/Google) before any public launch. Access stays permanent on dev as a free perimeter. This is the real, permanent production shape.
- Phase 2 (sketched, not detailed here): paid tier via Stripe lifting quotas. The data model carries a `plan` column from day one so this is an extension, not a rewrite.

### Why Access on prod is temporary

Cloudflare Access is a Zero Trust team-gating product, not a consumer identity product. Its free tier covers roughly 50 seats, beyond which it is priced per user per month. That is fine for the dev perimeter (a few testers, free, forever) but financially nonviable for open public signup. So Access on prod is explicitly scaffolding for Phase 1a, removed in Phase 1b.

## Architecture

```
Browser (existing Svelte SPA, near-unchanged UI)
   |  fetch /api/layouts*  (+ identity: Access JWT in 1a, session cookie in 1b)
   v
Cloudflare Worker  "rackula-cloud-api"
   |- verifies identity, derives user_id
   |- scopes every query by user_id
   |- enforces quotas and concurrency
   |
   |--> D1  (SQLite)   users, sessions, layout metadata, plan/quota
   |--> R2  (objects)  layout bodies, images, snapshots
```

The Worker re-implements the existing `/api/layouts*` contract from `src/lib/storage/api.ts`, adding identity and `user_id` scoping. The static SPA is served from Cloudflare Pages or Workers static assets.

### Storage choice

D1 (metadata) + R2 (blobs). D1 powers the cheap list view via SQL and holds the `plan`/quota columns. R2 stores bodies and images with no egress fees, which matters because images are the real byte cost. Durable Objects were considered and deferred: there is no cross-user concurrency problem to solve yet, and DO is the upgrade path if real-time collaboration ever becomes a goal. Choosing D1 + R2 is a one-way door away from real-time multiplayer; accepted.

## Data model

D1 tables:

- `users(id, provider, provider_user_id, email, display_name, plan, created_at)`
- `sessions(id, user_id, expires_at, created_at)` (Phase 1b; 1a uses Access JWT)
- `layouts(id, user_id, name, version, updated_at, rack_count, device_count, byte_size, valid)`
- `images(id, user_id, layout_id, r2_key, byte_size, created_at)`
- `snapshots(id, layout_id, user_id, r2_key, created_at, byte_size)`

R2 objects:

- `users/{user_id}/layouts/{layout_id}.yaml` (layout body, images referenced not embedded; see image decision below)
- `users/{user_id}/layouts/{layout_id}/images/{image_id}`
- `users/{user_id}/layouts/{layout_id}/snapshots/{timestamp}.yaml`

`updated_at` in D1 is the optimistic-concurrency token, reusing the existing `X-Rackula-Updated-At` mechanism and the `reconcile` module in `$lib/storage`. Per-user storage usage is `SUM(byte_size)` across layouts, images, and snapshots; this is what quotas meter against.

### D1 + R2 consistency rule (decided, not deferred)

Writes touch two systems with no cross-system transaction. Rule:

- R2 is the source of truth for bytes. D1 is a derived index.
- On save: write R2 first, then upsert D1. If D1 fails after R2 succeeds, the body is safe and the list view is stale until repaired.
- Concurrency: writes to a layout are serialized by the existing optimistic concurrency contract. Every overwrite must carry a strictly newer `updated_at` than the stored value, and a mismatch is rejected and snapshotted rather than silently overwritten. This is the shared storage contract (#2091) already proven against the filesystem driver; the Worker's R2 driver (#2133) must uphold the same atomic snapshot-on-mismatch invariant. The serialization point is a compare-and-set on `updated_at` in D1: a stale or equal token returns a conflict, so no same-tick write races through, and layout ids are compared case-insensitively to match the contract's UUID-casing rule.
- Repair path: a list/get can reconcile a missing or stale D1 row from R2 metadata. `byte_size` usage counters may drift and need periodic truing-up.
- On delete: write a tombstone (mark the D1 row deleted) first, then delete the R2 object, then remove the D1 row. The tombstone is what stops the repair path from resurrecting a layout the user deleted in the window between the two deletes. An orphaned R2 object left by a failed delete is a cost leak, not a correctness bug, and is swept by a later cleanup pass that skips tombstoned ids.

### Images (decided, not deferred)

Images are stored as separate R2 objects, not embedded in the layout YAML. The current single-tenant API embeds images in YAML under a 1 MB per-layout cap; keeping that for cloud would make sync useless for anyone storing a photo of their real rack, and would rewrite every image on every save. Splitting images out enables per-image metering, cheaper saves, and a usable free tier. This is load-bearing for the feature to be worth shipping.

## API surface (Worker)

Maps to the current contract, now authenticated and user-scoped:

- `GET /api/layouts` -> `SELECT ... WHERE user_id = :me`
- `GET /api/layouts/:uuid` -> authz check, R2 read
- `PUT /api/layouts/:uuid` -> concurrency check, quota check, R2 write, D1 upsert
- `DELETE /api/layouts/:uuid` -> D1 delete then R2 delete
- `.../snapshots` GET/POST and snapshot load (as today)
- image upload/fetch/delete endpoints (new, per the image decision)
- `GET /api/health` (same payload shape)
- `GET /api/me` (current user, plan, usage)
- `DELETE /api/me` (account and all data deletion, invariant 3)
- Phase 1b only: `GET /api/auth/*` (OAuth start/callback), `POST /api/auth/logout`

The CRUD route signatures are unchanged, so `api.ts` keeps its existing method shapes. That is not the same as minimal integration effort: the semantics shift from single-tenant (all layouts on the instance) to per-user scoped (only the authenticated user's layouts). That shift adds real frontend work, auth state management, credentials on every request, 401/403 handling, account UI, and auth-conditional layout visibility, detailed under Frontend changes below.

## Auth flows

Phase 1a (both environments): Cloudflare Access handles login (social or one-time PIN). Cloudflare injects a signed `Cf-Access-Jwt-Assertion` header; the Worker verifies it against Access public keys and uses the verified email as the identity. No session code.

Phase 1b (prod): the Worker runs OAuth (GitHub/Google) via a Workers auth library (better-auth or openauth), minting an httpOnly, Secure, SameSite session cookie, sessions stored in D1. Dev keeps Access as a perimeter plus the same app OAuth inside, so the data-scoping code path matches prod. Note: dev is then prod-plus-a-perimeter, not a pure mirror; the auth-sensitive seams (redirect URLs, cookie domains, JWT presence) get explicit test coverage.

Contingency: if owning OAuth proves too costly, a managed provider (Clerk/Auth0) can be slotted in, since the Worker only consumes a verified identity.

## Quotas, abuse, and spend safety

- Per-user quotas enforced in the Worker on write: a layout count cap and a total-bytes cap (starting values to be set; tunable). The existing per-layout size cap is retained but raised to a value compatible with separate image storage.
- Cloudflare WAF plus rate limiting on auth and write endpoints.
- OAuth-only signup (no anonymous accounts) limits signup spam in Phase 1.
- Hard spend caps and billing alerts on Workers/D1/R2 so a bad actor or a viral spike cannot silently generate a large bill. This is a safety requirement, not optional.

## Privacy and legal baseline

Running a public service that stores emails and user layouts makes the operator a data controller. Minimum baseline, in scope for this work:

- Privacy policy and terms of service.
- Real data export and deletion (invariants 2 and 3), already endpoints.
- Documented data location and retention.
- No third-party analytics on user content.

## Frontend changes (additive, not trivial)

The editor, canvas, and archive format do not change, but adding authenticated per-user sync is real work, not a one-line tweak:

- `api.ts`: send credentials/cookie, add `/api/me`, surface auth state, handle 401/403. CRUD route signatures stay the same.
- Auth state machine: signed-out vs signed-in, conditional layout visibility.
- New thin UI: a sign-in entry point, an account/usage panel, a storage-usage indicator. Reuses existing storage-mode plumbing (`availability.svelte`, `manager.svelte`).
- No change to the layout editor, canvas, or on-disk archive format.

## Testing

Per the project's "test behavior, not structure" rules:

- Worker authz: no cross-user access (user A cannot read user B's UUID).
- Quota enforcement: write rejected past caps.
- Concurrency: stale or equal `updated_at` yields a conflict, snapshot-on- mismatch holds, and the R2 driver passes the shared storage contract (#2091).
- Consistency: R2-first ordering, repair path recovers a missing D1 row, and a tombstoned (deleted) layout is never resurrected by repair.

Auth seams differ by phase and need explicit per-phase coverage so Phase 1b does not regress what Phase 1a established:

- Phase 1a: a request with no valid `Cf-Access-Jwt-Assertion` is rejected; a valid header maps to the right `user_id`; `/api/auth/*` routes do not exist.
- Phase 1b: session cookie is validated; cookie carries httpOnly, Secure, and the intended SameSite; OAuth redirect/callback URLs are honored; logout invalidates the session server-side.
- Both: cross-user isolation holds under whichever mechanism is active.
- Reuse existing E2E persistence specs against the Worker contract.

## Deferred decisions (genuinely open)

- Exact free-tier quota numbers (layout count, total bytes, per-layout cap).
- Phase 1b: stateful D1 sessions vs stateless signed cookies.
- Domain/routing (subdomain vs path) for the cloud API.
- Phase 2 Stripe billing detail (Checkout, portal, webhook plan sync, grandfathering implementation).

## Out of scope

- Real-time collaboration / multiplayer (would require Durable Objects).
- Migration tooling (greenfield project policy).
- Team/org shared layouts (possible later, higher tier).
