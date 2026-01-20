# Share URL Strategy: Pattern Analysis and Recommendations

## Key Insights

- **Current implementation is elegantly designed** but hard-coded for single-rack layouts at line 42 of `share.ts`: `const rack = layout.racks[0]`
- **QR codes have a hard ceiling of 1,588 characters** (Version 24, EC-L) - this is a physical constraint, not configurable
- **Browser safe limit is 2,000 characters** - Edge is the bottleneck at 2,083 chars
- **lz-string outperforms pako** for URL encoding: ~88% compression vs ~82%, smaller bundle (1KB vs 26KB), native URL-safe output
- **Multi-rack layouts will exceed URL limits quickly** - projections show 2-rack layouts with moderate device counts are already at the limit
- **Hybrid approach is the pragmatic path** - URL-only for small layouts, shortener for large ones
- **Cloudflare Workers + KV is the clear winner** for serverless shortener: 100K reads/day free, no cold starts, simple implementation

---

## Size Projections

### Single Rack Baseline (Current Implementation)

From test data and codebase analysis:

| Configuration               | Estimated URL Size | QR Fit?    | Browser Safe? |
| --------------------------- | ------------------ | ---------- | ------------- |
| Empty rack                  | ~200 chars         | Yes        | Yes           |
| 1 device type, 5 devices    | ~400 chars         | Yes        | Yes           |
| 3 device types, 10 devices  | ~600 chars         | Yes        | Yes           |
| 5 device types, 20 devices  | ~1,200 chars       | Yes        | Yes           |
| 10 device types, 30 devices | ~1,500 chars       | Borderline | Yes           |

### Multi-Rack Projections

**Assumptions:**

- Base overhead per rack: ~100 chars (name, height, width, form_factor)
- Per-device overhead: ~40 chars (type slug, position, face, optional name)
- Per-device-type overhead: ~80 chars (slug, height, manufacturer, model, colour, category)
- Device types are deduplicated across racks (typical homelabber reuses same gear)

| Configuration       | Racks | Devices/Rack | Device Types | Estimated URL Size | QR Fit?    | Browser Safe?  |
| ------------------- | ----- | ------------ | ------------ | ------------------ | ---------- | -------------- |
| **Light 2-rack**    | 2     | 5            | 5            | ~900 chars         | Yes        | Yes            |
| **Medium 2-rack**   | 2     | 15           | 8            | ~1,600 chars       | Borderline | Yes            |
| **Dense 2-rack**    | 2     | 25           | 12           | ~2,400 chars       | **No**     | **No**         |
| **Light 3-rack**    | 3     | 5            | 6            | ~1,100 chars       | Yes        | Yes            |
| **Medium 3-rack**   | 3     | 15           | 10           | ~2,200 chars       | **No**     | **Borderline** |
| **Dense 3-rack**    | 3     | 25           | 15           | ~3,400 chars       | **No**     | **No**         |
| **5-rack homelab**  | 5     | 10           | 12           | ~2,800 chars       | **No**     | **No**         |
| **Enterprise (10)** | 10    | 20           | 20           | ~7,500 chars       | **No**     | **No**         |

### The "Cliff" Points

1. **QR code cliff: ~1,500 characters**
   - Beyond this, QR codes become impractical (too dense to scan reliably)
   - Hit with: 2 racks, 15 devices/rack, 8 device types

2. **Browser URL cliff: ~2,000 characters**
   - Beyond this, Edge and some proxies truncate URLs
   - Hit with: 2 racks, 20+ devices/rack, OR 3+ racks with moderate usage

3. **Bitly cliff: 2,048 characters**
   - Users cannot use third-party shorteners for large layouts
   - Need our own shortener solution

### Device Count Impact

The key insight is that **device types dominate URL size**, not device count. Once you've paid the cost for a device type's definition (~80 chars), each additional device of that type only adds ~40 chars.

**Scenario: 42U rack fully populated**

- 42 devices (all 1U), 1 device type: ~1,800 chars (manageable)
- 42 devices (all 1U), 10 device types: ~2,600 chars (problematic)

This means homelabbers with diverse gear (many device types) hit limits faster than data centers with homogeneous equipment.

---

## Implementation Approaches

### Option A: URL-Only with Better Compression (lz-string)

**Implementation:**

```typescript
// Replace pako with lz-string
import LZString from "lz-string";

export function encodeLayout(layout: Layout): string | null {
  const minimal = toMinimalLayout(layout);
  const json = JSON.stringify(minimal);
  return LZString.compressToEncodedURIComponent(json);
}

export function decodeLayout(encoded: string): Layout | null {
  const json = LZString.decompressFromEncodedURIComponent(encoded);
  if (!json) return null;
  const parsed = JSON.parse(json);
  return fromMinimalLayout(MinimalLayoutSchema.parse(parsed));
}
```

**Changes Required:**

1. Replace `pako` dependency with `lz-string` (~25KB bundle reduction)
2. Remove base64url encoding step (lz-string handles it)
3. Update schema version for backward compatibility detection

**Estimated Improvement:**

- 5-10% better compression for typical layouts
- Simpler code, smaller bundle
- Still hits the same hard limits for large layouts

**Verdict:** Good first step, but insufficient for multi-rack.

### Option B: Cloudflare KV Shortener

**Implementation:**

```
URL: https://s.racku.la/{shortId}
API: POST https://api.racku.la/shorten
     Body: { layout: <encoded-string> }
     Response: { short: "https://s.racku.la/abc12345" }
```

**Worker Code (~30 lines):**

```javascript
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const slug = url.pathname.slice(1);

    // Redirect short URL to full URL
    if (slug && request.method === "GET") {
      const fullUrl = await env.LAYOUTS.get(slug);
      if (fullUrl) return Response.redirect(fullUrl, 301);
      return new Response("Not found", { status: 404 });
    }

    // Create short URL
    if (request.method === "POST") {
      const { layout } = await request.json();
      const slug = crypto.randomUUID().slice(0, 8);
      const fullUrl = `https://count.racku.la/?l=${layout}`;
      await env.LAYOUTS.put(slug, fullUrl, { expirationTtl: 31536000 }); // 1 year
      return Response.json({ short: `https://s.racku.la/${slug}` });
    }

    return new Response("Method not allowed", { status: 405 });
  },
};
```

**Infrastructure:**

- Domain: `s.racku.la` (or `l.racku.la` for "layouts")
- Worker: Cloudflare Workers (free tier: 100K requests/day)
- Storage: Cloudflare KV (free tier: 100K reads/day, 1K writes/day)
- Cost: $0 for hobby usage, ~$5/month at scale

**Verdict:** Simple, reliable, fits the project's self-hosted philosophy.

### Option C: Hybrid Approach (Recommended)

**Decision Tree:**

```
User clicks "Share"
    |
    v
Encode layout (lz-string)
    |
    v
URL length < 1,800 chars?
    |
   YES --> Use direct URL (no server dependency)
    |        - Show URL in text field
    |        - Generate QR code directly
    |
   NO --> Offer both options:
          1. "Copy short URL" (requires API call)
          2. "Download .rackula file" (offline alternative)
          3. Show warning about URL length
```

**Why 1,800 threshold?**

- Below QR code limit (1,588)
- Well below browser limit (2,000)
- Leaves headroom for base URL overhead (~100 chars)

**UI Changes to ShareDialog:**

```svelte
{#if urlLength < 1800}
  <!-- Current flow: direct URL, QR code -->
{:else}
  <div class="warning">
    This layout is too large for a direct URL ({urlLength} characters).
  </div>
  <button onclick={createShortUrl}>Create Short URL</button>
  <button onclick={downloadLayoutFile}>Download Layout File</button>
{/if}
```

**Offline Fallback:**
When shortener is unavailable or user prefers offline:

- Export as `.rackula` JSON file
- File can be imported via drag-drop or file picker
- No server dependency required

**Verdict:** Best balance of simplicity, reliability, and privacy.

### Option D: E2E Encrypted Server Storage

**Excalidraw-style Implementation:**

```
URL format: https://count.racku.la/#id={layoutId}&key={encryptionKey}
```

**Flow:**

1. Generate random 256-bit encryption key (client-side)
2. Encrypt layout JSON with AES-GCM
3. Upload encrypted blob to server (server cannot read content)
4. Server returns short ID
5. URL hash contains: `id={shortId}&key={base64Key}`
6. Key never sent to server (URL hash is client-side only)

**Pros:**

- Unlimited layout size (server stores encrypted blob)
- Privacy preserved (server stores only ciphertext)
- Enables future collaboration features (multiple users with same key)

**Cons:**

- Significantly more complex implementation
- Requires persistent storage (not just KV redirect)
- Key management UX is tricky (lose key = lose access)
- Overkill for current Rackula use case

**Verdict:** Save for v1.0 collaboration features. Not needed for multi-rack sharing.

---

## Trade-offs Matrix

| Approach                    | Complexity | Cost (Monthly) | Offline Support | Privacy  | Max Layout Size | QR Codes            |
| --------------------------- | ---------- | -------------- | --------------- | -------- | --------------- | ------------------- |
| **A: lz-string only**       | Low        | $0             | Full            | Full     | ~2,000 chars    | Limited             |
| **B: Cloudflare shortener** | Medium     | $0-5           | None            | Medium\* | Unlimited       | Yes (via short URL) |
| **C: Hybrid**               | Medium     | $0-5           | Partial         | High     | Unlimited       | Yes (with fallback) |
| **D: E2E encrypted**        | High       | $10-20         | None            | Full     | Unlimited       | Yes                 |

\*Medium privacy = Cloudflare can see layout data in KV. Data is not encrypted at rest but also not public.

### Detailed Trade-off Analysis

**Complexity:**

- A requires no infrastructure changes
- B/C require Cloudflare account, Workers setup, DNS config
- D requires encryption implementation, key management, persistent storage

**Offline Support:**

- A works fully offline (pure client-side)
- B/C degrade gracefully (file export fallback)
- D requires network for initial fetch

**Privacy:**

- A: Data never leaves browser (except in URL which user shares intentionally)
- B/C: Data stored in Cloudflare KV (not public but not E2E encrypted)
- D: Server never sees plaintext (true E2E encryption)

**Maintenance:**

- A: Zero maintenance
- B/C: Minimal (Cloudflare handles scaling, monitoring)
- D: Moderate (need to monitor storage costs, handle key recovery questions)

---

## Recommendation

### v0.7.0 Scope: Option C (Hybrid) with Phased Implementation

**Phase 1 (v0.7.0-alpha): lz-string Migration**

1. Replace pako with lz-string
2. Add backward compatibility for existing share URLs
3. Update ShareDialog to show URL length warning
4. Add "Download layout file" as fallback

**Phase 2 (v0.7.0-beta): Extend Schema for Multi-Rack**

1. Update MinimalLayout schema: `r: MinimalRack` -> `rs: MinimalRack[]`
2. Add rack groups encoding (for bayed configurations)
3. Update toMinimalLayout/fromMinimalLayout
4. Handle container_id/slot_id for nested devices

**Phase 3 (v0.7.0): Cloudflare Shortener**

1. Set up Cloudflare Worker at `s.racku.la`
2. Add shortener API call to ShareDialog
3. Implement threshold-based decision logic
4. Generate short-URL QR codes for large layouts

### Future Work (v1.0+)

**Connections/Cables:**

- Add `conns: MinimalConnection[]` to share schema
- Only needed when cable management feature is complete

**E2E Encryption:**

- Consider when adding real-time collaboration
- Use Excalidraw pattern: encryption key in URL hash
- Requires significant infrastructure investment

**API Rate Limiting:**

- Add if abuse becomes a problem
- Cloudflare has built-in rate limiting features

### Rationale

1. **Why not URL-only (Option A)?**
   - Multi-rack layouts will exceed 2,000 chars
   - Users expect to share via QR codes
   - Third-party shorteners don't work past 2,048 chars

2. **Why not E2E encrypted (Option D)?**
   - Overkill for current use case (sharing, not collaboration)
   - Significant complexity for marginal benefit
   - Users sharing layouts publicly don't need encryption

3. **Why Cloudflare over alternatives?**
   - Best free tier (100K reads/day vs Vercel's 30K/month)
   - No cold starts (edge deployment)
   - Simple KV API (no database overhead)
   - Rackula already uses GitHub Pages; CF Workers integrates cleanly

4. **Why hybrid over shortener-only?**
   - Small layouts should work offline (no server dependency)
   - Reduces API costs (only large layouts hit shortener)
   - Preserves privacy for simple shares
   - Users who prefer file-based sharing have an option

### Implementation Effort Estimate

| Phase                         | Effort     | Risk   |
| ----------------------------- | ---------- | ------ |
| Phase 1: lz-string migration  | 2-4 hours  | Low    |
| Phase 2: Multi-rack schema    | 4-8 hours  | Medium |
| Phase 3: Cloudflare shortener | 8-16 hours | Medium |

**Total:** 14-28 hours of development work

---

## Appendix: Schema Changes for Multi-Rack

### Current MinimalLayout (Single Rack)

```typescript
{
  v: string,          // version
  n: string,          // name
  r: MinimalRack,     // single rack
  dt: MinimalDeviceType[]
}
```

### Proposed MinimalLayout (Multi-Rack)

```typescript
{
  v: string,          // version (bump to "2")
  n: string,          // name
  rs: MinimalRack[],  // array of racks
  rg?: MinimalRackGroup[], // optional rack groups (bayed configs)
  dt: MinimalDeviceType[]
}

interface MinimalRack {
  id: string,         // short ID for rack reference
  n: string,          // name
  h: number,          // height
  w: 10 | 19,         // width
  d: MinimalDevice[]
}

interface MinimalRackGroup {
  rs: string[],       // rack IDs in group
  n?: string          // optional group name
}
```

### Backward Compatibility

```typescript
function decodeLayout(encoded: string): Layout | null {
  const json = LZString.decompressFromEncodedURIComponent(encoded);
  const parsed = JSON.parse(json);

  // Detect schema version
  if (parsed.r && !parsed.rs) {
    // v1 format: single rack
    return fromMinimalLayoutV1(parsed);
  } else {
    // v2 format: multi-rack
    return fromMinimalLayoutV2(parsed);
  }
}
```

This ensures existing share URLs continue to work while enabling new multi-rack capabilities.
