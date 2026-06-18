# Spike #2186: Share-link schema versioning and shortened-link compatibility

**Date:** 2026-06-15 **Milestone:** M03 -- Data Format & Interop **Parent policy:** [spike #1113](spike-1113-schema-versioning-policy.md), [docs/reference/SCHEMA.md](../reference/SCHEMA.md) **Related:** #2158 (carrier-first epic), #2205 (reject-newer-major gate), #571 (publish JSON Schema), #820 (M08 shortener) **Status:** Research deliverable. Contains points that need a maintainer decision (flagged inline).

---

## Executive summary

Share-link payloads are a schema read surface alongside file load, server GET, snapshot restore, and the localStorage working copy. They carry their own format marker (`fv`, the share-format version) but they do NOT carry `metadata.schema_version`, the field the #1113 policy makes authoritative for load/reject decisions. The carrier-first epic (#2158) has already classified its placement change as MAJOR (`schema_version` should go `1.0` -> `2.0`), but the literal bump is held pending the reject-newer-major gate (#2205); the string is still `"1.0"` everywhere and no reader gates on it yet.

The decisive finding for this spike is that the carrier-first import adapter (`src/lib/storage/adapt-legacy-layout.ts`) already sits on the share-link decode path. A shared URL decodes to a `Layout` in `App.svelte` and is handed to `layoutStore.loadLayout`, which runs `adaptLegacyLayout` at the single store ingress (epic decision D1). So a pre-bump share link is already transparently upgraded to the carrier-first model on open today; the mechanism that would handle an old shared URL after the `2.0` bump is in place and tested.

Two recommendations follow from that. First, for pre-bump share links once the format goes `2.0`: open them via the existing import adapter (transparent upgrade), do not reject or expire. Second, on whether the share payload should carry a `schema_version` field now: yes, it is cheap, and it should be added as an optional top-level `sv` field on the v2 minimal payload, defaulting to absent (treated as the current major) so existing URLs keep decoding. Both recommendations have a maintainer-decision component tied to the held `1.0` -> `2.0` bump, called out below.

---

## 1. How share links encode and decode today

`encodeLayout` (`src/lib/utils/share.ts:411`) converts a `Layout` to a `MinimalLayoutV2` (`toMinimalLayout`, share.ts:172), JSON-stringifies it, and compresses with `LZString.compressToEncodedURIComponent`. The URL is `?l=<compressed>` (`generateShareUrl`, share.ts:476).

`decodeLayout` (share.ts:433) decompresses (lz-string first, pako gzip fallback for pre-migration URLs), `JSON.parse`s, detects v1 vs v2 by field presence (`r` = v1 single rack, `rs` = v2 multi-rack), validates with the matching Zod schema (`MinimalLayoutV2Schema` / `MinimalLayoutSchema`), and rebuilds a full `Layout`.

The only version markers in the payload today are:

- `v` (`MinimalLayoutV2Schema.v`, share.ts schema line: `v: z.string()`): this is `layout.version`, the app provenance string (from `package.json`), copied verbatim. Per #1113 nothing keys off it for loadability; it is not `schema_version`.
- `fv` (`SHARE_FORMAT_VERSION`, currently `2`, schemas/share.ts:35): the share-format version, bumped to 2 when carrier-first container encoding (`ci`/`si`/`a`) was added in C2 (#2290). It is optional on the payload and absent is treated as 1. This versions the share encoding shape, not the layout data schema.

What is absent: there is no `metadata.schema_version` (the `1.0` / future `2.0` data-format major) anywhere in the encoded payload. The decode path never reads or asserts a data-schema version. This matches the #1113 enforcement note: "share-link payloads carry no version marker" and "do NOT apply the absent-version => 1.0 default to them."

## 2. The import adapter already sits on the decode path

The carrier-first adapter docstring (`adapt-legacy-layout.ts:1-21`) states it runs at the single store ingress (`loadLayout`), so "every load path (file, API, archive, share decode, browser restore, YAML editor) passes through it." The epic confirmed this as locked decision D1: the adapter sits at the store ingress specifically because browser-restore and share decode bypass the file/server load-pipeline.

Tracing the share path: `App.svelte:282` calls `decodeLayout(shareParam)`, then `App.svelte:284` calls `layoutStore.loadLayout(sharedLayout)`. `loadLayout` runs `adaptLegacyLayout`. The adapter is idempotent (already carrier-first input passes through unchanged) and treats its input as untrusted (a malformed device is left as-is, never throws). It also re-hydrates carrier device types whose slot grid did not survive the share encoding (`hydrateCarrierTypes`, adapt-legacy-layout.ts:303), which the docstring calls out as the share-link case ("a share link does not encode the slot grid; only the slug round-trips").

Consequence: a pre-bump (`1.0`-era) share link, including one that still encodes the old fractional/`slot_position` placement model, is already snapped and wrapped to carrier-first on open. The transparent-upgrade mechanism is live and covered by `src/tests/adapt-legacy-layout.test.ts`. This is the migration from the previous MAJOR that #1113 requires a MAJOR bump to ship; the epic recorded that the C2 adapter is exactly that migration.

## 3. Options for pre-bump share links once the format goes MAJOR "2.0"

The question: when `schema_version` becomes `2.0` (carrier-first), what should happen to a share link generated before the bump (a `1.0`-era URL, or a `1.0`-era full URL stored by the M08 shortener)?

### Option (a): open via the #2158 import adapter (transparent upgrade)

The shared URL decodes, the adapter snaps and wraps legacy placements to carrier-first, the layout opens. No version check rejects it.

- Interaction with the adapter: this is what happens today. No new code. The adapter is the migration from the previous MAJOR. Idempotent, so a `2.0`-era link also passes through cleanly.
- Interaction with the reject-newer-major gate (#2205): the gate rejects only documents with a major NEWER than the running app. A `1.0` link opened by a `2.0`-capable app is an OLDER major, which the #1113 reader rule says to "load and migrate," not reject. So (a) is consistent with the gate: old links migrate, they are never rejected.
- Interaction with the M08 shortener (#820): the shortener stores the full URL string verbatim with a one-year TTL and 301-redirects to it. It is an opaque key/value store; it does not parse or re-encode the payload. A shortened `1.0`-era link redirects to the same `?l=` payload, which the app then decodes and adapts exactly like a direct link. So (a) needs nothing from the shortener: persisted old links keep working as long as the adapter understands their placement model.

### Option (b): versioned error / reject

Decode detects a too-old (or unrecognized) data version and shows a versioned error instead of opening.

- Interaction with the adapter: this would mean deliberately NOT running the adapter for old links, i.e. throwing away a migration that already exists and works. It contradicts the #1113 reader rule, which rejects only NEWER majors and migrates older ones.
- Interaction with #2205: the gate's whole point is reject-NEWER, load-older. Rejecting an older link is the opposite of the policy and would be a second, inconsistent rule.
- Interaction with #820: every shortened URL created before the bump (one-year TTL) would start erroring mid-life. For a hobby-scale share/QR feature that is a poor outcome and generates support churn for no data-safety gain (the adapter can read these links safely).
- Where reject IS correct: a NEWER-major share link opened by an OLDER app. A `2.0` link shared to a user whose app only understands `1.0` should reject (loud, non-destructive), exactly as the file/server gate does. That is the forward direction and is covered by carrying a version marker (deliverable 2) plus the #2205 gate logic, not by rejecting old links.

### Option (c): expire

Old share links stop working after some date or version boundary.

- Interaction with the adapter: pointless to expire links the adapter can still read.
- Interaction with #820: the shortener already has a one-year TTL, so shortened links expire on their own as a storage-cost control. An additional schema-driven expiry is redundant and user-hostile (a printed QR code on a rack would silently die).
- This option has no upside over (a) given the adapter exists. Only consider expiry as a pure storage-cost policy on the shortener KV, unrelated to schema version.

### Recommendation for deliverable 1

Adopt option (a): pre-bump share links open via the import adapter (transparent upgrade). Rationale: the migration already exists on the decode path, it is idempotent and tested, and it matches the #1113 reader rule (migrate older major, reject only newer major). Reject (b) and expire (c) both discard a working migration and break persisted shortener links for no data-safety benefit. Reserve rejection strictly for the forward case (a NEWER-major link opened by an OLDER app), which is handled by deliverable 2 plus #2205, not by touching old links.

MAINTAINER DECISION: this recommendation assumes the carrier-first change ships as the single `1.0` -> `2.0` bump and that the C2 adapter remains the only migration needed to read `1.0`-era links. If a future `3.0` bump removes carrier-first fields the adapter cannot reconstruct, the "always migrate older" stance needs a chained migration or a floor version below which links do reject. That is not a concern for the `1.0` -> `2.0` step but should be recorded as the condition under which option (a) stops being sufficient.

## 4. Should the share payload carry a schema_version field now?

### Feasibility and cost

Adding a version marker to the share payload is cheap. The payload is a plain object built in `toMinimalLayout` (share.ts:262-269) and validated by `MinimalLayoutV2Schema` (schemas/share.ts:205). Adding one optional numeric (or string) top-level field is:

- one optional field on the Zod schema (`sv: z.number().int().optional()` or a `MAJOR.MINOR` string),
- one line in the `toMinimalLayout` return object,
- zero decode changes required for existing URLs, because absent is the legacy case.

There is precedent in the same file: `fv` (`SHARE_FORMAT_VERSION`) is exactly this pattern, an optional integer version added without breaking older payloads. The cost is a handful of characters in the compressed URL.

### Why do it now rather than wait for #2158's share-link format revision

The epic's "schema version bump and share-link format revision" item is still open, and the literal `schema_version` bump is held. Adding the marker now, before that revision lands, means that when the bump happens there is already a field to populate and a decode path that can branch on it. Without the marker, a `2.0` share link is indistinguishable from a `1.0` share link except by inferring the placement model, which is fragile (the adapter's co-location heuristics are recovery logic, not a version signal). The forward-compat case (a `2.0` link opened by a `1.0`-only app) cannot be detected at all without a marker: the old app would silently mis-adapt the payload instead of rejecting it per #1113.

### Recommendation for deliverable 2

Yes. Add an optional top-level data-schema-version field to the v2 minimal payload now.

Concrete placement: a new optional field on `MinimalLayoutV2Schema`, populated in `toMinimalLayout`'s return object next to `fv`. Suggested key `sv` (data-schema version), distinct from `fv` (share-encoding version) and `v` (app provenance). Keep it optional so every existing `?l=` URL still decodes (absent = current major). Two sub-decisions are for the maintainer:

MAINTAINER DECISION 2a (value to emit): the marker should carry the data-format MAJOR.MINOR (the same value as `metadata.schema_version`), not the share-encoding version. The open question is what value to emit before the held `1.0` -> `2.0` bump is ratified. Recommended: emit `sv` only once the bump lands, writing `2.0` at the same moment file/server writers start emitting `2.0` and the #2205 gate goes live, so writers and readers flip together (the same coordination the epic recommends for the file format). Until then, leave `sv` absent and let the adapter handle everything, exactly as today. Adding the schema field and the optional decode-side handling can land now; the value written flips with the bump.

MAINTAINER DECISION 2b (whether to add it before vs with the bump): adding the optional field and a decode-side "reject newer sv major" branch is safe to land now and is forward-looking insurance. Tying the actual emitted value to the held bump keeps writers honest. If the maintainer prefers to do nothing until #2158's format revision, the fallback is acceptable because the adapter covers the read direction; the only thing lost by waiting is the ability of a future old app to reject a future newer link, which only matters once `2.0` links exist in the wild. The recommendation is to add the field and the reject branch now (cheap, un-retrofittable later in the same sense #2205 is) and flip the emitted value with the bump.

## 5. Read-surface enumeration for #1113's compatibility matrix

Input for the compatibility matrix recorded on #1113. Every schema read surface and how it is gated:

| Read surface | Source | Carries data-schema version? | Gated today? | Notes |
| --- | --- | --- | --- | --- |
| File load (`.Rackula.zip`) | `archive.ts` -> `parseLayoutYaml` / `LayoutSchema` | Yes (`metadata.schema_version`, absent => 1.0) | Primary ingress; reject-newer-major gate lands here (#2205) | Authoritative path in #1113 |
| Server GET | `src/lib/storage/api.ts` -> `LayoutSchema` | Yes (same field) | Same shared gate as file load | Primary ingress |
| Snapshot restore (#2042) | `restoreFromSnapshot` -> `loadSnapshot` -> `finalizeLayoutLoad` | Yes (snapshot is layout YAML) | Routes through the validated pipeline | Same gate as file/server when restored |
| localStorage working copy | `src/lib/storage/working-copy.ts` | No version read; unvalidated | Not gated (open door, #2206) | Same-build session state; not a cross-version vector but real debt |
| Share link (`?l=`) | `src/lib/utils/share.ts` decode | No data-schema version (`fv` is share-encoding only) | Not gated; runs through the carrier-first adapter at store ingress | THIS spike: add `sv` (deliverable 2); rely on the adapter for old links (deliverable 1) |
| Shortened link (#820, M08) | Cloudflare Worker KV -> 301 redirect to `?l=` | No (opaque store of the full URL string) | Inherits the share-link surface after redirect | Persists `1.0`-era links for up to a year; depends on the adapter staying able to read them |

Where share links fit: they are a non-primary read surface that bypasses the file/server Zod ingress and instead reaches the store directly, where the carrier-first adapter normalizes them. They are the one read surface that both lacks a data-schema marker and is persisted externally (via the shortener), which is why this spike recommends adding the marker (so the forward-compat reject case is detectable) while keeping the adapter as the read path for old links (so persisted links keep working).

## 6. Decisions locked and maintainer-decision points

Locked by this spike (consistent with #1113 and #2158):

1. Pre-bump share links open via the import adapter (transparent upgrade), option (a). Do not reject or expire readable old links.
2. The share payload should gain an optional data-schema-version marker (`sv`), separate from `fv` and `v`, kept optional so existing URLs decode.
3. The reject case for share links is the forward direction only (a NEWER-major link opened by an OLDER app), handled by the `sv` marker plus the #2205 gate logic, never by rejecting older links.
4. The M08 shortener (#820) needs no schema awareness: it is an opaque URL store and inherits the share-link read behaviour after redirect. Its existing one-year TTL is the only expiry; no schema-driven expiry.

Maintainer-decision points (all coupled to the held `1.0` -> `2.0` bump):

- MD-1 (couples to #2158 / #2205): ratify the `1.0` -> `2.0` `schema_version` bump and flip all writers (file, server, and the new share `sv`) to emit `2.0` at the same moment the #2205 reject-newer-major gate goes live. This spike assumes that single coordinated flip.
- MD-2a: what value the share `sv` marker emits before the bump is ratified. Recommended: emit nothing (leave absent) until the bump, then emit `2.0` with the coordinated flip.
- MD-2b: whether to land the optional `sv` field and the decode-side reject-newer branch now (recommended) or defer the whole thing to #2158's share-link format revision (acceptable fallback because the adapter covers the read direction).
- MD-3: the condition under which option (a) stops being sufficient: a future MAJOR bump that removes carrier-first fields the adapter cannot reconstruct would need a chained migration or a floor version below which links reject. Not a concern for `1.0` -> `2.0`; recorded so the "always migrate older" stance is revisited if a `3.0` is ever scheduled.

## 7. Inputs handed to other issues

- To #1113: the read-surface table in section 5 (share link and shortened link rows, with gating status).
- To #2205: the share-link reject rule is forward-only (reject newer-major links, migrate older), and the share `sv` marker is the field the gate would consult on the share surface; the value flip is coordinated with the file/server flip (MD-1).
- To #820: no schema awareness required in the Worker; it stays an opaque URL store. Its one-year TTL is the only expiry. Persisted `1.0`-era links remain readable via the adapter, which is the constraint the shortener design should record (do not assume stored payloads are re-encodable; they are read back through the adapter).
- To #2158: the share-link format revision item can adopt the optional `sv` marker (section 4) and rely on the already-merged C2 adapter as the old-link read path (section 2).
