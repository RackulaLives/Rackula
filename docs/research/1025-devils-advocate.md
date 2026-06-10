# Spike #1025 - Devil's Advocate Review

Adversarial review of the #1025 recommendation (frontend -> Cloudflare Workers Static
Assets, three optional CF features) from two lenses: (1) real-world-behaviour-over-
elegance, (2) secure-coding. The goal here is to find what is wrong, weak, or
overstated, not to ratify the spike. Where the spike is right, it is conceded briefly so
the disagreements stand out.

Facts verified against the worktree (not assumed):

- CSP today is delivered by nginx (`deploy/security-headers.conf`, included at
  `deploy/nginx.conf.template:91,281`). It is NOT in the app bundle / HTML. Moving prod
  off nginx removes the CSP unless re-created on CF.
- The CSP carries TWO `script-src` SHA-256 hashes, one of which is the GitHub-Pages inline
  redirect script (`index.html:33-42`) the spike wants to delete. Deleting the script
  without updating the CSP, or porting the CSP without that hash, will break.
- The frontend has TWO `{@html}` sinks: markdown notes (`MarkdownPreview.svelte:25`, fed by
  `rackNotes`/`deviceNotes` -> `parseMarkdown` -> marked + DOMPurify) and the export SVG
  preview (`ExportDialog.svelte:548`, self-generated). The markdown one renders
  user-controlled text.
- The full Layout/save/API wire format DOES carry `notes` (markdown, `z.string().max(1000)`,
  `src/lib/schemas/index.ts:512,611,672,704`) and a layout `description`. The MINIMAL share
  format (`src/lib/schemas/share.ts`) does NOT carry notes. These are two different wire
  formats. This distinction is the crux of the KV-XSS argument below.
- Device custom names render via Svelte `{text}` interpolation (auto-escaped), e.g.
  `DeviceDetails.svelte:82`. Names are not an HTML sink. Notes/description are.

---

## Challenges (claim -> critique -> severity)

### 1. "Workers Static Assets is the right call" vs. the unspoken GitHub Pages comparison

claim: Approach C (GitHub Pages) is "Rejected" because GH Pages "404s on deep links,
needs a base path (`/Rackula/`), and cannot host the KV/R2 storage features."

critique: The rejection is partly a strawman. (a) The deep-link 404 problem is exactly the
`404.html` SPA-redirect shim that already exists and already works on GH Pages - the spike
treats a solved problem as a disqualifier. (b) The `/Rackula/` base path is a non-issue:
`VITE_BASE_PATH` is already an env var; a custom domain (`count.racku.la`) on GH Pages
serves at `/`, no subpath. (c) "Cannot host KV/R2" is true but irrelevant to the BASELINE
move, which is the only committed deliverable - the three storage features are explicitly
"optional, separable follow-ups" that "should NOT be bundled." So for the actual scoped
work (lift-and-shift a static `dist/`), GitHub Pages is a genuine $0, zero-new-platform,
zero-new-CI-secret option that the spike dismisses by importing the unbuilt features into
the decision. The honest framing is: "Workers is justified ONLY if you commit to at least
one storage feature; for static-only, it is heavier than GH Pages."

The stronger point: the user already has a CI/CD release pipeline and a CF zone. Workers
adds a wrangler toolchain, two CF API secrets (least-privilege scoping is itself a task,
listed as Open Risk #4 - "the most likely deploy snag"), a `compatibility_date` you must
remember to bump (Open Risk #8), and a new vendor dependency for the one URL that matters
most (prod). That is a real maintenance and failure surface traded for "storage features we
might build." For a tool whose entire prod tenant is "serve a static bundle, no API," that
is arguably over-provisioning.

severity: medium

### 2. "Lift-and-shift, an afternoon, Small" understates the CSP loss

claim: Baseline move is "Small," "essentially lift-and-shift of a static bundle," CI is
"a clean swap," post-deploy smoke test "carries over verbatim."

critique: The smoke test (`curl version.json`) does carry over. The SECURITY POSTURE does
not. Today prod's CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, and
Permissions-Policy are ALL emitted by nginx (`security-headers.conf`). On Workers Static
Assets there is no nginx. Those headers must be re-created via a CF `_headers` file (or a
Worker), and the CSP must be rebuilt - including re-deriving the inline-script SHA-256
hashes (one of which the spike simultaneously wants to delete). NONE of the three research
docs mention re-homing the security headers. The external doc only mentions CSP in the
context of ADDING the analytics beacon source, not preserving the existing policy. This is
a silent regression: a "lift-and-shift" that drops the site's entire response-header
security baseline unless someone notices. That is not "Small / an afternoon"; it is
Small-plus-a-security-port-that-must-not-be-forgotten. At minimum the baseline-move
checklist must include "port `security-headers.conf` to CF `_headers` and re-verify CSP."

severity: high

### 3. "$0 forever" for KV is not defensible under adversarial load

claim: "Free plan ... comfortably covers all three optional features at Rackula's
traffic," and KV's 1,000 writes/day is framed as a "spike of >1,000 share creations" edge
case mitigated by dedupe + rate-limit.

critique: The honest number is right (1,000 writes/day) but the framing is optimistic in
exactly the wrong direction. This is an UNAUTHENTICATED public write endpoint. The binding
constraint is not organic usage; it is the cheapest possible denial-of-wallet / denial-of-
service: a single script POSTing 1,001 distinct valid-ish layouts exhausts the day's write
budget and takes the share feature offline for every real user until midnight UTC.
Content-hash dedupe does NOT help here - the attacker sends DISTINCT payloads, each a new
hash, each a write. The "mitigation" (WAF per-IP rate limit) is real but (a) the CF free
tier gives ONE custom rate-limit rule with coarse controls, and (b) per-IP limits are
trivially defeated by any botnet/proxy pool. So the truthful statement is: "KV share links
are $0 under honest use, but the free write cap is a hard, attacker-triggerable
availability cliff; staying free REQUIRES accepting that the feature can be DoS'd to a daily
outage, OR moving to Workers Paid ($5/mo) which raises limits but does NOT remove the
write-flood vector." The spike's Open Risk #1 names the flood but still files KV under
"$0 ... comfortably." Those two statements are in tension.

Also under-stated: "reads of non-existent keys are billed." A scanner walking `/s/<random>`
burns the 100k/day READ budget too, so an attacker can take down resolution (reads) as well
as creation (writes), and the per-IP WAF rule is the only thing standing between you and
both. One free rule, two abuse vectors.

severity: high

### 4. "API is out of scope" is not honest once the self-host rule is in force

claim: "`rackula-api` (backend) hosting is OUT of scope" - repeated as a guardrail
throughout.

critique: Hosting is out of scope; IMPLEMENTATION is dragged squarely in. The self-host
parity rule REQUIRES a new `rackula-api` route (`POST /share`, `GET /share/:id`) that does
not exist today (the spike admits "the parity route does not exist yet"). That is backend
route code, backend storage wiring, backend tests, backend security (the SAME unauthenticated-
write threat applies to the self-hoster's API, which the spike does not analyse), and
backend docs. Calling that "out of scope" because we are not MOVING the API is a
sleight-of-hand: the KV feature cannot ship "with parity" without shipping new backend
feature code. The honest decomposition:

- Deliverable with ZERO API work: baseline static move, CF dev/preview Worker, Web
  Analytics, codebase/doc cleanup, observability. (Web Analytics genuinely has no API
  coupling - conceded.)
- NOT deliverable without API work: KV share links (new route), and R2 images for the
  USER-UPLOAD path if you want parity beyond the existing filesystem store.

R2 is the one place the spike's "parity already exists" claim mostly holds: bundled images
are static, and user-upload parity is the existing `api/src/storage/assets.ts` filesystem
store. So R2 is genuinely light. KV is not - it is a backend feature wearing an "out of
scope" label.

severity: medium

### 5. "Dev also on CF" vs. "dev stays on the homelab" - the spike papers over a real contradiction

claim: Step 4 stands up a `rackula-dev` Worker as "the CF dev/preview environment to
replace the homelab-hosted dev FRONTEND," while the scope says "Dev currently runs on the
HOMELAB ... dev stays on the homelab" and "#1985 - move the dev `rackula-api` ... onto the
homelab."

critique: The reconciliation EXISTS but is buried and easy to misread: the dev FRONTEND
could move to a CF Worker while the dev API moves to the homelab (#1985). That split is
coherent, but it produces a cross-origin dev topology the spike under-specifies: a CF-hosted
dev frontend at some `*.workers.dev` (preview URLs are workers.dev-subdomain-only in beta,
per the external doc) calling a homelab `rackula-api` at `d.racku.la/api` is now CROSS-ORIGIN,
so it needs the API's Hono CORS to allow the CF origin AND it loses the same-origin
`/api` proxy that today makes CORS a non-issue. The codebase doc flags this ("Effort to wire
a CF dev to the homelab API (CORS + routing): Small") but the synthesis's Phase 2 quietly
drops it and just says "Effort: Small ... dev API -> homelab is #1985, separate." So the
contradiction is reconciled on paper but the resulting dev environment is more complex than
"Small" implies: it is either (a) a workers.dev frontend + CORS-opened homelab API (new
cross-origin surface), or (b) a CF Worker that REVERSE-PROXIES `/api` to the homelab (a real
Worker with a route to your house, new attack surface + a tunnel). Neither is "just a
separate Worker." Pick one and cost it honestly.

severity: medium

### 6. Effort estimates assume Claude-codegen erases the parts that actually cost

claim: Web Analytics "Trivial," R2 "Small," KV "Small-to-Medium," baseline "Small" - all
"Claude-assisted, human effort is lower than raw LOC implies."

critique: Codegen lowers the cost of WRITING code. It does not lower the cost of the things
that dominate this particular work: (a) provisioning + least-privilege-scoping CF API tokens
(a human, security-sensitive, dashboard task - the spike itself calls a mis-scoped token the
"most likely deploy snag"); (b) verifying the CSP/security-header port did not regress
(manual, can't be unit-tested away); (c) threat-testing an unauthenticated public write
endpoint (you cannot vibe-code your way past a denial-of-wallet review); (d) the DUAL
implementation + the self-host parity backend route + tests for BOTH paths; (e) operational
runbook for a new vendor (rollback via `wrangler versions deploy`, `compatibility_date`
hygiene, who has CF account access). "Small-to-Medium" for KV is probably "Medium" once the
backend parity route, its tests, its own abuse hardening, and the CF-side WAF rule are
counted. The estimates are defensible for the BASELINE (it really is small) and Web
Analytics (really trivial); they are optimistic for KV.

severity: low

### 7. login.html on static prod: "harmless, leave it shipped" is a UX/trust trap

claim: "Cleanest path: leave it shipped (harmless ...) or drop it." Routing analysis shows
`/login` -> real `login.html` (200) under `html_handling: auto-trailing-slash`.

critique: "Harmless" is wrong in the one case that matters. Under the recommended config,
`/login` returns 200 and renders a FULLY FUNCTIONAL-LOOKING login form on public prod. A
user (or a search crawler, or a security scanner) hitting `count.racku.la/login` sees a
real password form that POSTs to `/api/auth/login`, which returns the SPA-fallback
`index.html` (200) because there is no API and no nginx 404 rule. So the form does not even
fail cleanly with "server unreachable"; it may receive a 200 HTML body and behave
unpredictably (the runtime API-health check is hardened against this for the MAIN app, but
`LoginForm.svelte` POSTs directly). Shipping a live-looking, non-functional, unauthenticated
login form on a public domain is a phishing-template gift and a trust/credibility ding, not
"harmless." The correct call is unambiguous: DROP `login.html` from the prod build (it is
gated behind `AUTH_MODE=none` today by nginx; that gate vanishes on CF). The spike lists
this as Open Risk #9 but still presents "leave it shipped" as co-equal. It is not.

severity: medium

### 8. not_found_handling SPA fallback masks every routing/asset error as 200 index.html

claim: The two-entry routing "just works" and the only gotcha is a typo'd `/log-in`
silently serving the app.

critique: Correct that it works; understated that the failure mode is bad. `not_found_
handling: single-page-application` turns EVERY unmatched path - including a mistyped asset
URL, a deep link to content that no longer exists, a probe for `/version.json` after a
botched deploy, or a request for a deleted image - into `200 OK` + `index.html`. That breaks
the post-deploy smoke test's ability to detect a broken asset path (it would get a 200 HTML
page, not a 404), and it is the exact false-positive the codebase ALREADY had to harden
`/api/health` against. The recommendation should explicitly note: the `version.json` smoke
test still works (real file, exact match) but it is now the ONLY thing standing between you
and a silently-broken deploy that returns 200 for everything. Add a check that a known-absent
path returns the SPA shell AND that a couple of real hashed assets resolve, or you will not
notice a broken upload.

severity: low

---

## Security Findings (feature -> risk -> mitigation)

### A. Response-header / CSP regression on the baseline move (NEW, not in the spike)

- feature: Baseline prod move (Workers Static Assets) - the core, lowest-risk deliverable.
- risk: nginx emits the entire security-header set today (CSP, HSTS, X-Frame-Options,
  X-Content-Type-Options nosniff, Referrer-Policy, Permissions-Policy). Workers Static
  Assets has no nginx. If the headers are not re-homed, prod loses its CSP and clickjacking/
  MIME-sniffing/HSTS protections silently. The CSP also contains an inline-script SHA-256
  hash for the GH-Pages redirect script the spike wants to delete - delete-without-CSP-update
  (or port-without-rederiving-hashes) breaks script execution or weakens the policy.
- mitigation: Port `deploy/security-headers.conf` to a CF `_headers` file (or a Worker that
  sets headers) as a HARD requirement of the baseline PR, not a follow-up. Re-derive the
  remaining inline-script hash after deleting the GH-Pages shim; if the only remaining inline
  script is gone, tighten `script-src` to `'self'` (a security WIN the migration enables).
  Add an automated post-deploy assertion that `Content-Security-Policy` and
  `X-Frame-Options` are present on `count.racku.la` (extend the existing version.json smoke
  test). `_headers` is a plain file nginx ignores, so self-host portability is preserved.

### B. KV share endpoint - unauthenticated write -> denial-of-wallet / availability DoS

- feature: KV share links (`POST /s`).
- risk: Anyone can exhaust the 1,000 writes/day cap with 1,001 DISTINCT valid payloads,
  taking share-creation offline for all users daily. Content-hash dedupe does not stop
  distinct payloads. Reads of random keys burn the 100k/day read budget too, taking share-
  RESOLUTION offline. Per-IP WAF limits are bypassable by proxy pools; the CF free tier
  gives one rate-limit rule.
- mitigation: (1) Cloudflare Turnstile (free, privacy-friendly) on the create action from
  day one, not "if abuse appears" - an unauthenticated public write endpoint should never
  ship without a bot gate. (2) App-level body-size cap (<=256 KB, ideally tighter) before
  any KV op. (3) Cap KV value count via short `expirationTtl` so storage cannot grow
  unbounded. (4) Accept and DOCUMENT that on the free tier the feature has a daily
  availability ceiling, and treat Workers Paid ($5/mo) as the real cost of making it abuse-
  resistant - i.e. KV share links are NOT honestly a $0 feature. (5) Separate (lower) WAF
  limit on `GET /s/*` to protect the read budget. If even one paid feature is acceptable,
  this is the one to pay for.

### C. KV / API share content -> STORED XSS via the markdown notes sink

- feature: KV share links AND the self-host `rackula-api /share` parity route.
- risk: This is the subtle one the spike gets PARTLY right and PARTLY wrong. The spike's KV
  example stores "the serialized layout (YAML/JSON, same wire format the app already uses)"
  and validates it "against the existing Zod layout schema." But there are TWO wire formats:
  the MINIMAL share format (no `notes`) and the FULL save/API format (carries `notes`
  markdown + `description`). The full format's `notes` is rendered through a `{@html}` sink
  (`MarkdownPreview` -> marked -> DOMPurify). If the KV/API share blob is the FULL format
  (which is what `rackula-api` already persists via `serializeLayoutToYaml`), then a shared
  layout CAN carry attacker-controlled markdown that lands in an HTML sink on the victim's
  browser. Zod "validation" does NOT sanitize - `z.string().max(1000)` accepts
  `<img src=x onerror=...>` happily. The current defenses are DOMPurify + the CSP - and per
  finding A, the CSP is at risk of being dropped in the same migration. Lose the CSP and
  weaken/misconfigure DOMPurify and you have stored XSS delivered by a short, trustworthy-
  looking `count.racku.la/s/<id>` link.
- mitigation: (1) DECIDE and PIN the share wire format. Strongly prefer storing the MINIMAL
  share format (no notes/description) in KV/API shares, matching today's `?l=` behaviour, so
  notes are simply not shareable and the HTML sink is unreachable via shares. (2) If notes
  MUST be shareable, run the SAME `parseMarkdown`/DOMPurify sanitisation on render (it
  already does) AND re-validate server-side, and never trust Zod shape-validation as a
  safety control. (3) Keep the CSP (finding A) - it is the backstop that makes a DOMPurify
  miss non-catastrophic. (4) Serve resolved share values as `application/yaml`/`text/plain`,
  never `text/html` (spike already says this - good), so the blob itself cannot be navigated
  to as a page. (5) Apply the identical content rules to the `rackula-api` parity route - the
  self-hoster faces the same stored-XSS vector and the spike does not analyse it.

### D. R2 public bucket - enumeration, hotlinking, unbounded upload

- feature: R2 images (public bucket + custom domain).
- risk: For BUILT-IN device icons (public reference data, content-addressed keys) the risk
  is low and acceptable - conceded. The real risk is the USER-UPLOAD path: if user uploads
  land in the SAME public bucket, they become world-readable and enumerable by anyone with
  (or guessing) the key; predictable keys (`<layoutUuid>/<slug>/<face>`) are guessable given
  a UUID; uploads with no size cap exhaust the 10 GB free storage; a public custom domain
  invites hotlinking (egress is free so not a $ risk, but it is your brand serving other
  people's bandwidth). Content-type confusion (an uploaded "image" that is actually HTML/SVG
  with script) served from your zone is an XSS vector if not forced to a safe content-type.
- mitigation: (1) Keep built-in icons public (fine); do NOT co-mingle user uploads in a
  public bucket - either a private bucket fronted by a Worker/auth, or strictly server-set,
  non-executable `Content-Type` (`image/webp` etc., never `image/svg+xml` without
  sanitisation, never `text/html`). (2) Use unguessable, content-addressed keys for uploads,
  not `uuid/slug/face`. (3) Enforce a per-object size cap and a per-namespace quota
  (`quota.ts` exists for the filesystem store - mirror it for R2). (4) Set `X-Content-Type-
  Options: nosniff` (part of finding A's header port) so the browser cannot re-interpret an
  image as HTML. (5) For SVG specifically, sanitise or refuse - SVG is an XSS sink.

### E. Cloudflare Web Analytics beacon - third-party script + CSP/privacy

- feature: CF Web Analytics (`static.cloudflareinsights.com/beacon.min.js`).
- risk: Adds a third-party script origin to a project whose current CSP is `script-src
  'self' <hashes>`. The beacon needs `script-src https://static.cloudflareinsights.com` and
  `connect-src https://cloudflareinsights.com`, widening the policy. Auto/zone injection
  would inject into EVERY response including, potentially, self-host-adjacent paths, and is
  harder to keep out of self-host builds. Privacy claims ("no consent banner needed") are
  jurisdiction-dependent and stated as fact.
- mitigation: (1) Use the MANUAL, build-flag-gated snippet (`VITE_CF_ANALYTICS_TOKEN`) as
  the spike recommends - good - so self-host builds emit zero third-party calls. (2) Scope
  the CSP widening to ONLY the CF-hosted bundle's `_headers`/CSP, not the self-host nginx
  CSP, so self-hosters keep `script-src 'self'`. (3) Soften the GDPR claim to "cookieless,
  no persistent identifier; consult counsel on consent" - do not assert "no banner required"
  as settled. (4) Confirm the beacon does not undermine the value of having just tightened
  `script-src` to `'self'` after deleting the GH-Pages inline script - it reintroduces a
  third-party script origin, which is a deliberate tradeoff to make consciously.

---

## Strongest Counter-Option

Split the decision the spike fuses together.

For the COMMITTED, in-scope deliverable (retire the prod VPS tenant by hosting a static
`dist/`), the strongest counter to "Workers Static Assets" is: host prod on the SAME thing
prod already is - a static bundle - on the lowest-new-surface target, and only adopt Workers
IF AND WHEN a storage feature is actually green-lit.

Concretely, two defensible counter-options, in priority order:

1. Workers Static Assets for the baseline (as recommended) BUT explicitly de-scope all three
   storage features out of #1984, AND make the CSP/security-header port to a CF `_headers`
   file a hard acceptance criterion of the baseline PR, AND drop `login.html` from the prod
   build. This keeps the committed platform but fixes the three things the spike soft-pedals
   (header regression, live login form, KV-as-$0). This is the option that "holds" with
   adjustments.

2. GitHub Pages (or even staying on the VPS short-term) for static-only prod, deferring CF
   entirely until a storage feature is committed. GH Pages is genuinely $0, needs no new CF
   API tokens, no wrangler, no `compatibility_date`, and the deep-link/base-path objections
   are already-solved or non-issues at a custom domain. Its real disqualifier is ONLY the
   storage features - which are explicitly NOT in scope. If the storage features never ship
   (and the spike itself sequences them last and optional), Workers was over-provisioning.
   The catch GH Pages does NOT solve is the security-header set (GH Pages cannot send a
   custom CSP/HSTS either), so this counter-option trades one header problem for another and
   is weaker on exactly the dimension the spike ignores - which actually REINFORCES that the
   header port is the real work, regardless of host.

The single most important reframe: the hard part of this migration is not the host choice;
it is re-homing the security response headers (CSP/HSTS/etc.) that nginx provides today.
Whichever host wins, that work is mandatory and currently missing from the plan.

---

## Does The Recommendation Hold?

Mostly yes, with non-trivial required adjustments. The core call - Workers Static Assets for
a static `dist/`, baseline first, storage features separable and last - is sound and the
two-entry SPA routing analysis is correct and well-evidenced. The platform research is
accurate.

But the recommendation as written has three material gaps that must be closed before it is
safe to execute:

- It omits the security-header / CSP re-homing entirely (high). A "lift-and-shift" that
  drops the CSP and HSTS is a security regression hiding inside a "Small" estimate.
- It files KV share links as "$0 ... comfortably" while simultaneously admitting an
  attacker-triggerable daily-outage write-flood (high). The two are contradictory; KV share
  links are not honestly free once you require abuse resistance.
- It mislabels the share content-XSS surface by treating "Zod validation" as sanitisation
  and not distinguishing the minimal share format (safe) from the full save format (carries
  markdown notes that reach an `{@html}` sink) (high).

The "API out of scope" framing is also dishonest for KV specifically (a new backend route is
required for parity), and "leave login.html shipped" should be a firm "drop it." None of
these sink the recommendation; they tighten it.

recommendation_holds: true, conditional on the required adjustments below.

---

## Required Adjustments

1. BASELINE (mandatory): Port `deploy/security-headers.conf` (CSP, HSTS, X-Frame-Options,
   X-Content-Type-Options, Referrer-Policy, Permissions-Policy) to a CF `_headers` file as an
   acceptance criterion of #1984, NOT a follow-up. Re-derive or eliminate the inline-script
   CSP hashes after deleting the GH-Pages shim (deleting the shim lets you tighten
   `script-src` toward `'self'` - do it). Add a post-deploy assertion that CSP and
   X-Frame-Options are present on `count.racku.la`.

2. BASELINE (mandatory): Drop `login.html` from the prod build. Do not ship a live-looking,
   non-functional, unauthenticated login form on a public domain. "Leave it shipped" is not
   an acceptable co-equal option.

3. BASELINE: Strengthen the deploy smoke test beyond `version.json`: assert a known-absent
   path returns the SPA shell (expected) AND that at least one real hashed asset resolves, so
   SPA-fallback 200s do not mask a broken deploy.

4. KV (before shipping): Reclassify KV share links as a Workers-Paid-or-accept-daily-DoS
   feature, not "$0." Require Turnstile on create from day one, a tight body-size cap, a
   GET-side rate limit to protect the read budget, and explicit documentation of the free-
   tier availability ceiling.

5. SHARE FORMAT (before shipping KV or the API parity route): Pin the share wire format to
   the MINIMAL share schema (no `notes`/`description`) so the markdown `{@html}` sink is
   unreachable via shares. If notes must be shareable, mandate `parseMarkdown`/DOMPurify on
   render PLUS a live CSP, and never treat Zod shape-validation as a safety control. Apply
   identical content rules to the `rackula-api /share` parity route.

6. R2 (before shipping uploads): Do not co-mingle user uploads in a public bucket with
   built-in icons. Force non-executable content-types, refuse/sanitise SVG, use unguessable
   content-addressed keys, enforce per-object size + per-namespace quota (mirror `quota.ts`),
   and rely on `nosniff` from adjustment 1.

7. SCOPE HONESTY: Re-label "API out of scope" as "API HOSTING out of scope; API FEATURE work
   (new `/share` route + its abuse hardening + tests) is REQUIRED for KV parity and must be
   tracked as backend work." Move KV's effort to "Medium" accordingly.

8. DEV TOPOLOGY: Pick and cost ONE dev model explicitly - (a) workers.dev dev frontend +
   CORS-opened homelab API, or (b) a CF Worker reverse-proxying `/api` to the homelab. Note
   the new cross-origin / tunnel surface; "just a separate Worker, Small" undersells it.

9. ANALYTICS: Keep the manual, build-flag-gated beacon (self-host stays beacon-free), scope
   the CSP widening to the CF bundle only, and soften the GDPR/no-consent-banner claim to a
   "consult counsel" caveat.
