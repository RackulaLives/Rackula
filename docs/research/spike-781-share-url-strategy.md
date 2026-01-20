# Spike #781: Share URL Strategy for Multi-Rack Layouts

**Date:** 2026-01-20
**Parent Epic:** #150 (Multi-rack support)
**Blocked Issue:** #780 (Multi-rack share/export implementation)

---

## Executive Summary

This spike investigated how to extend Rackula's share URL system to support multi-rack layouts while maintaining reliability, privacy, and offline capability.

**Key Findings:**

1. Multi-rack layouts will quickly exceed URL length limits (~2,000 chars)
2. Switching from pako to lz-string provides ~5-10% better compression and 25KB smaller bundle
3. A hybrid approach (direct URL for small layouts, shortener for large) balances simplicity with capability
4. Cloudflare Workers + KV is the recommended shortener infrastructure (free tier sufficient)

**Recommendation:** Implement hybrid approach in three phases:

- Phase 1: lz-string compression migration
- Phase 2: Multi-rack schema extension
- Phase 3: Cloudflare shortener for large layouts

---

## Investigation Results

### 1. URL Size Measurements & Projections

| Configuration     | Racks | Devices/Rack | Device Types | Est. URL Size    | QR Fit? | Browser Safe? |
| ----------------- | ----- | ------------ | ------------ | ---------------- | ------- | ------------- |
| Empty rack        | 1     | 0            | 0            | ~200 chars       | ✅      | ✅            |
| Typical homelab   | 1     | 15           | 5            | ~800 chars       | ✅      | ✅            |
| Dense single rack | 1     | 30           | 10           | ~1,500 chars     | ⚠️      | ✅            |
| Light 2-rack      | 2     | 5            | 5            | ~900 chars       | ✅      | ✅            |
| **Medium 2-rack** | **2** | **15**       | **8**        | **~1,600 chars** | **⚠️**  | **✅**        |
| Dense 2-rack      | 2     | 25           | 12           | ~2,400 chars     | ❌      | ❌            |
| Medium 3-rack     | 3     | 15           | 10           | ~2,200 chars     | ❌      | ⚠️            |
| 5-rack homelab    | 5     | 10           | 12           | ~2,800 chars     | ❌      | ❌            |

**Key Insight:** Device types dominate URL size (~80 chars each). Homelabbers with diverse gear hit limits faster than users with homogeneous equipment.

### 2. The "Cliff" Points

| Limit                          | Characters | Impact                                |
| ------------------------------ | ---------- | ------------------------------------- |
| **QR Code (Version 24, EC-L)** | 1,588      | QR codes become impractical to scan   |
| **Browser URL (Edge)**         | 2,083      | URLs truncated in address bar         |
| **Bitly input limit**          | 2,048      | Third-party shorteners refuse the URL |
| **nginx default**              | 4,096      | Server-side truncation risk           |

**Practical ceiling for URL-only sharing:** ~1,800 characters (with headroom)

### 3. Compression Options Evaluated

| Algorithm      | Compression Ratio | Bundle Size | URL-Safe Output    | Verdict         |
| -------------- | ----------------- | ----------- | ------------------ | --------------- |
| **lz-string**  | 88%               | ~1KB        | ✅ Native          | **Recommended** |
| pako (current) | 82%               | ~26KB       | ❌ Needs base64url | Replace         |
| LZMA-JS        | 85%+              | ~9KB        | ❌                 | Overkill        |
| Brotli WASM    | 90%+              | ~681KB      | ❌                 | Too heavy       |

**Migration benefit:** ~25KB bundle reduction + simpler code + better compression

### 4. Industry Practices

| Tool                   | Approach                             | URL Length            | Server Required |
| ---------------------- | ------------------------------------ | --------------------- | --------------- |
| draw.io                | Compressed XML in URL                | Variable (has limits) | No              |
| Excalidraw             | E2E encrypted server storage         | Short                 | Yes             |
| Figma                  | Server-stored with permissions       | Short                 | Yes             |
| Compiler Explorer      | Own shortener (after goo.gl sunset)  | Short                 | Yes             |
| **Rackula (proposed)** | **Hybrid: URL + optional shortener** | **Variable**          | **Optional**    |

**Lesson from Compiler Explorer:** "Never trust a third-party service with your core infrastructure"

### 5. Serverless Shortener Options

| Service           | Free Tier      | Cold Starts | Complexity | Verdict            |
| ----------------- | -------------- | ----------- | ---------- | ------------------ |
| **Cloudflare KV** | 100K reads/day | None        | Low        | **Recommended**    |
| Vercel KV         | 30K/month      | Minimal     | Low        | Viable alternative |
| Supabase          | 500MB (pauses) | Yes         | Medium     | Not suitable       |
| Firebase          | 1GB            | Minimal     | Medium     | Overkill           |

---

## Recommendation: Hybrid Approach

### Decision Flow

```
User clicks "Share"
    │
    ▼
Encode layout with lz-string
    │
    ▼
URL length < 1,800 chars?
    │
   YES ──► Use direct URL
    │       • Copy URL to clipboard
    │       • Generate QR code directly
    │       • No server dependency
    │
   NO ───► Offer options:
            • "Create short URL" (via Cloudflare)
            • "Download .rackula file" (offline)
            • Show length warning
```

### Implementation Phases

#### Phase 1: lz-string Migration (v0.7.0-alpha)

**Scope:**

- Replace pako with lz-string
- Add backward compatibility for existing share URLs (v1 format)
- Update ShareDialog to show URL length warning
- Add "Download layout file" as fallback

**Effort:** 2-4 hours

#### Phase 2: Multi-Rack Schema (v0.7.0-beta)

**Schema Change:**

```typescript
// v1 (current)
{ v: "1", n: "name", r: MinimalRack, dt: DeviceType[] }

// v2 (proposed)
{ v: "2", n: "name", rs: MinimalRack[], rg?: RackGroup[], dt: DeviceType[] }
```

**Scope:**

- Extend MinimalLayout for multiple racks
- Add rack groups encoding (bayed configurations)
- Handle container_id/slot_id for nested devices
- Maintain v1 backward compatibility

**Effort:** 4-8 hours

#### Phase 3: Cloudflare Shortener (v0.7.0)

**Infrastructure:**

- Domain: `s.racku.la` (or `l.racku.la`)
- Worker: Cloudflare Workers (free tier)
- Storage: Cloudflare KV (1-year TTL on short URLs)

**Scope:**

- Set up Cloudflare Worker
- Add shortener API call to ShareDialog
- Implement threshold-based decision (1,800 char cutoff)
- Generate QR codes from short URLs for large layouts

**Effort:** 8-16 hours

### Total Effort: 14-28 hours

---

## What to Defer (Future Work)

| Feature                            | Reason                        | When                |
| ---------------------------------- | ----------------------------- | ------------------- |
| Connections/cables in share format | Cable management not complete | After cable feature |
| E2E encrypted storage              | Only needed for collaboration | v1.0+               |
| API rate limiting                  | Only if abuse occurs          | As needed           |
| Settings preservation              | Low user impact               | If requested        |

---

## Trade-offs Accepted

1. **Privacy trade-off:** Large layouts stored in Cloudflare KV (not E2E encrypted)
   - Mitigation: Data not public, only accessible via short URL
   - Users wanting privacy can use file export

2. **Offline trade-off:** Large layouts require network for shortener
   - Mitigation: File export always works offline
   - Direct URLs work offline for small layouts

3. **Complexity trade-off:** Three-phase implementation adds code
   - Mitigation: Each phase is independently valuable
   - Phase 1 alone improves current experience

---

## Files Changed in This Spike

| File                                            | Purpose                              |
| ----------------------------------------------- | ------------------------------------ |
| `docs/research/781-codebase.md`                 | Current implementation analysis      |
| `docs/research/781-external.md`                 | External research findings           |
| `docs/research/781-patterns.md`                 | Pattern analysis and recommendations |
| `docs/research/spike-781-share-url-strategy.md` | This summary document                |

---

## Related Issues

- **#780** - Multi-rack share/export implementation (blocked by this spike)
- **#150** - Multi-rack epic
- **#770, #771, #772** - Multi-rack export features

---

## Next Steps

1. Create implementation issues from this spike (Phase 4)
2. Unblock #780 with specific implementation guidance
3. Add issues to v0.7.0 milestone
