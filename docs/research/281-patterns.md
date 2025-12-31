# Pattern Analysis: Device Search Improvements

**Research Spike:** #281
**Date:** 2025-12-30

---

## Key Insights

### 1. Current Implementation is Minimal but Extensible
The existing `searchDevices()` function in `deviceFilters.ts` is a single point of modification. It currently:
- Searches only `model` field (with `slug` fallback)
- Uses simple substring matching
- Runs O(n) on each query (acceptable for ~250 devices)
- Already integrates with highlighting via `searchHighlight.ts`

**Insight:** The architecture supports drop-in replacement without UI changes.

### 2. Rich Device Data Already Exists
The codebase has 200+ branded devices with populated fields:
- `manufacturer` - All brand packs have this
- `model` - Primary search target, already indexed
- `category` - All devices have this (enum values)
- `slug` - Unique identifier, sometimes more descriptive than model

**Insight:** No data collection work needed - just need to search more fields.

### 3. Current UX Already Has Debouncing and Highlighting
- 150ms debounce prevents excessive search calls
- `highlightMatch()` already handles substring highlighting
- Search state already triggers accordion expansion

**Insight:** UX infrastructure is in place; only matching logic needs enhancement.

### 4. Bundle Size is a Consideration
Current project has no fuzzy search dependencies. Options:
- Fuse.js: ~6.7 kB (excellent feature set)
- uFuzzy: ~4.2 kB (minimal but sufficient)
- Zero-dependency: 0 kB (custom implementation)

**Insight:** For 250 devices, even a simple multi-field approach provides major UX improvement without adding dependencies.

---

## Implementation Approaches

### Option A: Multi-Field Substring Search (Zero Dependencies)

Extend current approach to search multiple fields with OR logic.

**Changes:**
```typescript
// deviceFilters.ts
export function searchDevices(devices: DeviceType[], query: string): DeviceType[] {
  if (!query.trim()) return devices;

  const q = query.toLowerCase().trim();

  return devices.filter((device) => {
    const searchableText = [
      device.model ?? device.slug,
      device.manufacturer,
      device.category
    ].filter(Boolean).join(' ').toLowerCase();

    return searchableText.includes(q);
  });
}
```

**Pros:**
- Zero bundle impact
- Minimal code change
- Solves the primary use case ("Dell" finding Dell devices)

**Cons:**
- No typo tolerance
- No weighted ranking
- Highlights only work on display name

**Effort:** ~1 hour

---

### Option B: Multi-Field with Basic Scoring (Zero Dependencies)

Add simple scoring based on which field matched.

**Changes:**
```typescript
interface SearchResult {
  device: DeviceType;
  score: number;
}

export function searchDevices(devices: DeviceType[], query: string): DeviceType[] {
  if (!query.trim()) return devices;

  const q = query.toLowerCase().trim();

  const results: SearchResult[] = [];

  for (const device of devices) {
    let score = 0;
    const name = (device.model ?? device.slug).toLowerCase();
    const manufacturer = (device.manufacturer ?? '').toLowerCase();
    const category = (device.category ?? '').toLowerCase();

    if (name.includes(q)) score += 3;
    if (manufacturer.includes(q)) score += 2;
    if (category.includes(q)) score += 1;

    if (score > 0) {
      results.push({ device, score });
    }
  }

  return results
    .sort((a, b) => b.score - a.score)
    .map(r => r.device);
}
```

**Pros:**
- Zero bundle impact
- Results ranked by relevance
- Manufacturer matches prioritized appropriately

**Cons:**
- Still no typo tolerance
- Slightly more complex code

**Effort:** ~2 hours

---

### Option C: Fuse.js Integration

Add Fuse.js for production-grade fuzzy matching.

**Changes:**
1. `npm install fuse.js` (~6.7 kB gzipped)
2. Replace `searchDevices()` implementation:

```typescript
import Fuse from 'fuse.js';

let fuseInstance: Fuse<DeviceType> | null = null;

function getFuse(devices: DeviceType[]): Fuse<DeviceType> {
  if (!fuseInstance || fuseInstance.getCollection() !== devices) {
    fuseInstance = new Fuse(devices, {
      keys: [
        { name: 'model', weight: 3 },
        { name: 'manufacturer', weight: 2 },
        { name: 'slug', weight: 1 },
        { name: 'category', weight: 1 }
      ],
      threshold: 0.4,
      ignoreLocation: true,
      includeScore: true,
      includeMatches: true
    });
  }
  return fuseInstance;
}

export function searchDevices(devices: DeviceType[], query: string): DeviceType[] {
  if (!query.trim()) return devices;

  return getFuse(devices)
    .search(query)
    .map(result => result.item);
}
```

3. Update `searchHighlight.ts` to use Fuse match indices for more accurate highlighting

**Pros:**
- Typo tolerance ("Deli" matches "Dell")
- Production-tested library
- Rich match metadata for highlighting
- Handles edge cases (diacritics, etc.)

**Cons:**
- Adds dependency (~6.7 kB)
- Slightly more complex highlighting integration
- May need threshold tuning

**Effort:** ~4 hours

---

### Option D: uFuzzy (Minimal Bundle)

Smaller alternative to Fuse.js for basic fuzzy matching.

**Changes:**
1. `npm install @leeoniya/ufuzzy` (~4.2 kB gzipped)
2. Create search wrapper similar to Option C

**Pros:**
- Smaller bundle than Fuse.js
- Fastest fuzzy matching performance

**Cons:**
- Less feature-rich
- Designed for single-field autocomplete
- Multi-field requires manual concatenation

**Effort:** ~3 hours

---

## Trade-offs Summary

| Approach | Bundle | Typo Tolerance | Ranking | Effort | Complexity |
|----------|--------|----------------|---------|--------|------------|
| A: Multi-field substring | 0 kB | ❌ No | ❌ No | 1h | Low |
| B: Multi-field + scoring | 0 kB | ❌ No | ✅ Yes | 2h | Low |
| C: Fuse.js | +6.7 kB | ✅ Yes | ✅ Yes | 4h | Medium |
| D: uFuzzy | +4.2 kB | ✅ Yes | ⚠️ Limited | 3h | Medium |

---

## Recommendation

**Recommended: Option B (Multi-Field with Basic Scoring) as MVP, with Option C as enhancement**

### Rationale

1. **Solves the primary pain point immediately** - searching "Dell" or "APC" will find devices
2. **Zero dependencies** - no bundle impact, no version maintenance
3. **Low risk** - minimal code change, easy to test
4. **Provides ranking** - better results than simple substring
5. **Clear upgrade path** - if typo tolerance becomes important, Fuse.js can be added later

### Phased Implementation

**Phase 1 (MVP):** Option B - Multi-field with scoring
- Implement in `deviceFilters.ts`
- Update tests in `deviceFilters.test.ts`
- ~2 hours effort

**Phase 2 (Enhancement):** Option C - Fuse.js (if typo tolerance requested)
- Add Fuse.js dependency
- Update highlighting to use match indices
- ~4 hours additional effort

### Implementation Order for MVP

1. **Update `searchDevices()`** - Add manufacturer, category search with scoring
2. **Update tests** - Add tests for manufacturer search, category search, ranking
3. **Update `highlightMatch()`** - Handle manufacturer highlighting in display
4. **Test manually** - Verify "Dell", "APC", "server" etc. work as expected

---

## Testing Strategy

### New Test Cases for Option B

```typescript
describe('searchDevices', () => {
  // Existing tests remain

  it('matches manufacturer field', () => {
    const devices = [
      { slug: 'r650', manufacturer: 'Dell', model: 'PowerEdge R650', ... },
      { slug: 'us-24', manufacturer: 'Ubiquiti', model: 'USW-24', ... }
    ];
    const result = searchDevices(devices, 'dell');
    expect(result).toHaveLength(1);
    expect(result[0].manufacturer).toBe('Dell');
  });

  it('matches category field', () => {
    const devices = [
      { slug: 'r650', category: 'server', ... },
      { slug: 'pdu', category: 'power', ... }
    ];
    const result = searchDevices(devices, 'server');
    expect(result).toHaveLength(1);
    expect(result[0].category).toBe('server');
  });

  it('ranks model matches higher than category matches', () => {
    const devices = [
      { slug: 'server-rack', model: 'Server Rack', category: 'shelf', ... },
      { slug: 'r650', model: 'R650', category: 'server', ... }
    ];
    const result = searchDevices(devices, 'server');
    expect(result[0].slug).toBe('server-rack'); // model match = score 3
    expect(result[1].slug).toBe('r650');         // category match = score 1
  });

  it('combines scores from multiple field matches', () => {
    const devices = [
      { slug: 'dell-server', manufacturer: 'Dell', model: 'Dell Server', category: 'server', ... }
    ];
    const result = searchDevices(devices, 'dell');
    expect(result).toHaveLength(1);
    // Should match both manufacturer (2) and model (3) = score 5
  });
});
```

---

## Open Questions

1. **Should slug be searchable?** - Currently used as fallback for model; could add as explicit field
2. **Should tags be searchable?** - User-defined tags could be high-value matches
3. **Should description/notes be searchable?** - Lower priority but potentially useful
4. **Highlight multiple fields?** - Currently only highlights display name; should we show "Dell PowerEdge R650" with Dell highlighted?

### Recommendation for Open Questions

For MVP (Option B):
- Add `slug` with weight 1 (already partially searched)
- Skip `tags` and `description` for now (add later if requested)
- Keep highlighting on display name only (avoid UI complexity)
