# Spike #281: Device Search Improvements

**Date:** 2025-12-30
**Status:** Complete
**Parent Epic:** None

---

## Executive Summary

The device library search currently only matches the `model` field, causing users to miss devices when searching by manufacturer (e.g., "Dell" or "APC"). This spike investigated options for improving search to include additional fields.

**Recommendation:** Implement **multi-field search with scoring** (zero dependencies) as an MVP. This solves the primary pain point with minimal code change. Fuse.js can be added later if typo tolerance becomes important.

### Key Findings

1. **Current search is too narrow** - Only searches `model` field, ignoring `manufacturer`, `category`, and other fields
2. **Device data is ready** - 200+ branded devices already have `manufacturer` populated
3. **Architecture supports easy enhancement** - Single function to modify (`searchDevices()`)
4. **Zero-dependency solution is viable** - Multi-field substring search solves 80% of the problem
5. **Fuse.js is the best library option** - If fuzzy matching is needed, Fuse.js offers the best feature-to-size ratio

---

## Technical Findings

### Current Implementation

**Location:** `src/lib/utils/deviceFilters.ts`

```typescript
export function searchDevices(devices: DeviceType[], query: string): DeviceType[] {
  const normalizedQuery = query.toLowerCase().trim();
  return devices.filter((device) => {
    const name = device.model ?? device.slug;
    return name.toLowerCase().includes(normalizedQuery);
  });
}
```

**Limitations:**
- Only searches `model` (with `slug` fallback)
- Searching "Dell" returns no results
- No ranking/scoring of results
- No typo tolerance

### Available Search Fields

| Field | Populated | Search Value |
|-------|-----------|--------------|
| `model` | All devices | High (already searched) |
| `manufacturer` | Brand pack devices (200+) | **High (missing)** |
| `category` | All devices | Medium |
| `slug` | All devices | Low |
| `tags` | User-added only | Low |
| `part_number` | Some devices | Low |

### Performance Considerations

- **Dataset size:** ~250 devices (43 generic + 200+ branded)
- **Current approach:** O(n) linear scan per search
- **Debounce:** 150ms already implemented
- **Verdict:** Performance is not a concern at current scale

---

## External Research

### Library Options

| Library | Bundle Size | Typo Tolerance | Ranking |
|---------|-------------|----------------|---------|
| Fuse.js | ~6.7 kB | Yes | Yes |
| uFuzzy | ~4.2 kB | Yes | Limited |
| Zero-dep | 0 kB | No | With scoring |

### How Similar Tools Handle Search

- **NetBox:** Multi-field with weighted ranking
- **RackTables:** Tag-based filtering + search
- **Device42:** Full-text across all attributes

---

## Recommendations

### MVP: Multi-Field Search with Scoring

Extend `searchDevices()` to search `model`, `manufacturer`, and `category` with weighted scoring.

**Benefits:**
- Zero bundle impact
- Solves primary use case ("Dell" finds Dell devices)
- Results ranked by relevance
- Minimal code change (~30 lines)

**Code Example:**
```typescript
export function searchDevices(devices: DeviceType[], query: string): DeviceType[] {
  if (!query.trim()) return devices;

  const q = query.toLowerCase().trim();
  const results: { device: DeviceType; score: number }[] = [];

  for (const device of devices) {
    let score = 0;
    const name = (device.model ?? device.slug).toLowerCase();
    const manufacturer = (device.manufacturer ?? '').toLowerCase();
    const category = (device.category ?? '').toLowerCase();

    if (name.includes(q)) score += 3;
    if (manufacturer.includes(q)) score += 2;
    if (category.includes(q)) score += 1;

    if (score > 0) results.push({ device, score });
  }

  return results.sort((a, b) => b.score - a.score).map(r => r.device);
}
```

### Future Enhancement: Fuse.js

If typo tolerance becomes important, add Fuse.js:
- Handles "Deli" → "Dell", "Ubuiqiti" → "Ubiquiti"
- Provides match indices for better highlighting
- ~6.7 kB bundle cost

---

## Implementation Plan

### Phase 1: MVP (Multi-Field with Scoring)

| Task | Description | Estimate |
|------|-------------|----------|
| 1 | Update `searchDevices()` in `deviceFilters.ts` | 30 min |
| 2 | Add tests for manufacturer/category search | 30 min |
| 3 | Add tests for ranking behavior | 30 min |
| 4 | Manual testing with real device library | 15 min |

**Total: ~2 hours**

### Phase 2: Fuzzy Search (If Requested)

| Task | Description | Estimate |
|------|-------------|----------|
| 1 | Add Fuse.js dependency | 5 min |
| 2 | Replace `searchDevices()` with Fuse.js | 1 hour |
| 3 | Update highlighting to use match indices | 2 hours |
| 4 | Tune threshold and weights | 30 min |

**Total: ~4 hours**

---

## Test Requirements

### New Test Cases

1. **Manufacturer search:** "Dell" matches Dell devices
2. **Category search:** "server" matches server devices
3. **Ranking:** Model matches rank higher than category matches
4. **Multi-match scoring:** Device matching multiple fields ranks higher
5. **Case insensitivity:** "DELL", "dell", "Dell" all work

---

## Decision Log

| Decision | Rationale |
|----------|-----------|
| Start with zero-dependency approach | Minimal risk, solves primary use case |
| Use weighted scoring | Better UX than unranked results |
| Defer Fuse.js | Typo tolerance not explicitly requested |
| Skip tag search for MVP | Low signal-to-noise ratio |

---

## Appendix

### Research Files

- `docs/research/281-codebase.md` - Codebase analysis
- `docs/research/281-external.md` - Library comparison and best practices
- `docs/research/281-patterns.md` - Implementation approaches and trade-offs
