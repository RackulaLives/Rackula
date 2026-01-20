# Codebase Exploration: Share URL Strategy for Multi-Rack Layouts

## Files Examined

1. **`src/lib/utils/share.ts`** (242 lines)
   - Main share URL encoding/decoding implementation
   - Current single-rack limitation at line 42: `const rack = layout.racks[0]`
   - Uses pako (gzip compression) for size reduction
   - Base64url encoding with no padding

2. **`src/lib/schemas/share.ts`** (133 lines)
   - Defines MinimalLayout schema with abbreviated keys for URL efficiency
   - Category abbreviations (single char: server→"s", network→"n", etc.)
   - Zod validation for serialized format

3. **`src/tests/share.test.ts`** (572 lines)
   - Comprehensive test coverage including round-trip tests
   - Tests for size constraints (encoded output < 1600 chars)
   - QR code fit validation tests

4. **`src/App.svelte`** (1301 lines)
   - Integration point: loads shared layouts on app startup (line 211-229)
   - Calls `getShareParam()` → `decodeLayout()` → `layoutStore.loadLayout()`
   - Clears share param after successful load
   - Tracks share events for analytics

5. **`src/lib/components/ShareDialog.svelte`** (355 lines)
   - UI for generating and displaying share URLs
   - Shows encoded length in characters (line 36: `encodeLayout(layout).length`)
   - Warns if URL exceeds 2000 chars (line 128-130)
   - Generates QR code only if `canFitInQR(shareUrl)` returns true

6. **`src/lib/utils/qrcode.ts`** (78 lines)
   - QR code specifications: **Version 24, Error Correction L**
   - **Maximum capacity: 1,588 alphanumeric characters**
   - Uses dynamic import to reduce bundle size

7. **`src/lib/types/index.ts`** (781 lines)
   - Layout type has `racks: Rack[]` (array, supports multiple racks)
   - PlacedDevice includes: id, device_type, position, face, optional name
   - DeviceType includes required fields: slug, u_height, colour, category

---

## Current Implementation

### Data Structures

**MinimalLayout (for sharing):**

```typescript
{
  v: string,              // version
  n: string,              // name
  r: {                    // rack (single rack only)
    n: string,            // name
    h: number,            // height
    w: 10 | 19,           // width (normalized)
    d: MinimalDevice[]    // devices
  },
  dt: MinimalDeviceType[] // used device types only
}
```

**MinimalDevice:**

```typescript
{
  t: string,     // device_type slug
  p: number,     // position
  f: "front"|"rear"|"both", // face
  n?: string     // optional custom name
}
```

**MinimalDeviceType:**

```typescript
{
  s: string,     // slug (key compression)
  h: number,     // u_height
  mf?: string,   // manufacturer (optional)
  m?: string,    // model (optional)
  c: string,     // colour (hex)
  x: string      // category abbreviation (1 char)
}
```

### Encoding Process

1. `toMinimalLayout(layout)` - convert full Layout to MinimalLayout
   - Uses only `layout.racks[0]`
   - Filters device_types to only those placed in rack
   - Converts device categories to single-char abbreviations
   - Omits optional fields (manufacturer, model, name) when not present

2. `JSON.stringify(minimal)` - serialize to JSON

3. `pako.deflate(json)` - compress with gzip (DEFLATE algorithm)

4. `base64UrlEncode(compressed)` - encode as URL-safe base64
   - Replaces `+` → `-`, `/` → `_`, removes trailing `=`

### Decoding Process

1. `base64UrlDecode(encoded)` - decode from base64url back to Uint8Array

2. `pako.inflate(compressed)` - decompress with gzip

3. `JSON.parse(json)` - parse JSON

4. `MinimalLayoutSchema.safeParse()` - Zod validation

5. `fromMinimalLayout(minimal)` - convert to full Layout
   - Generates new UUIDs for all devices and rack
   - Sets default settings: display_mode="label", show_labels_on_images=false
   - Sets default rack properties: form_factor="4-post-cabinet", desc_units=false, etc.

### URL Size Analysis

**Current Constraints:**

- Browser address bar: ~2000 chars safe limit
- QR code capacity: 1588 alphanumeric chars (Version 24, EC-L)
- ShareDialog warns if > 2000 chars
- Tests enforce `encoded.length < 1600` for QR fitness

**Data Point from Tests:**

- Empty rack (just config): < 200 chars
- Single rack with 20 devices: < 1600 chars (per bulk test)
- Typical use case: ~500-800 chars (estimated from test structure)

---

## Integration Points

### Where Share URLs Are Created

1. **ShareDialog.svelte (line 35-36)**
   - `shareUrl = $derived(generateShareUrl(layout))`
   - Triggers on every layout change (reactive)
   - Shown in text input for user to copy

2. **App.svelte Export Flow (line 411-423)**
   - Generates share URL before opening export dialog
   - Attempts to embed QR code in PDF/PNG/SVG exports
   - Falls back gracefully if QR generation fails

3. **ShareDialog QR Display (line 67-74)**
   - Calls `generateQRCode(shareUrl)` when dialog opens
   - Only if `canFitInQR(shareUrl)` returns true

### Where Share URLs Are Consumed

1. **App.svelte Page Load (line 211-229)**
   - Checks `getShareParam()` from URL on mount
   - Decodes with `decodeLayout(shareParam)`
   - If valid: loads layout, clears param, shows success toast
   - If invalid: clears param, shows error toast
   - Highest priority (checked before autosave)

### UI Components Involved

- **ShareDialog**: Displays URL, manages QR generation
- **App.svelte**: Orchestrates lifecycle, handles URL parsing
- **Toast notifications**: Feedback on load success/failure
- **Export dialogs**: Embed QR codes in exports

---

## Constraints and Dependencies

### Technical Limitations Discovered

1. **Single-Rack Assumption**
   - Line 42 in share.ts: `const rack = layout.racks[0]`
   - Comment admits multi-rack layouts use first rack only
   - `fromMinimalLayout()` always creates `racks: [rack]` (single element array)

2. **QR Code Hard Ceiling**
   - **Maximum: 1588 characters** (alphanumeric mode)
   - This is a physical constraint of QR Version 24, EC-L
   - Larger QR versions would increase print size beyond practical limits
   - URL already approaching limit with single complex rack

3. **URL Length Soft Limits**
   - Browser address bar: ~2000 chars safe (varies by browser)
   - Social media preview length: varies (Twitter ~280, Discord embeds full URL)
   - ShareDialog currently warns above 2000 chars

4. **Rack Width Normalization**
   - Only 10 and 19 are valid in share format
   - Widths 21, 23 are normalized to 19 (line 27-28)
   - This is a deliberate constraint for share format simplicity

### Assumptions in Current Code

1. **Single active rack paradigm**
   - All share/export logic assumes `layout.racks[0]`
   - Export CSV also uses first rack only (App.svelte line 501-505)
   - Comment states "CSV export only supports single rack"

2. **Device UUIDs not preserved**
   - Share decoding generates fresh UUIDs for all devices (share.ts line 109)
   - Prevents device identity tracking across share/load cycles

3. **Settings reset on share load**
   - Shared layouts always get default settings applied
   - Custom display_mode, show_labels_on_images are not preserved
   - This is intentional design (simple defaults for shared layouts)

4. **Zod schema validation**
   - All deserialization goes through MinimalLayoutSchema
   - Invalid data returns null (fail-safe)
   - console.warn logs validation errors for debugging

### Multi-Rack Related Gaps

1. **Export Pipeline**
   - Only shares first rack in multi-rack layouts
   - No mention of sharing rack groups (bayed configurations)
   - No precedent for encoding multiple racks

2. **Container Support (v0.6.0)**
   - PlacedDevice now supports container_id, slot_id (nested devices)
   - Share format has no corresponding fields
   - Containers would be lost in share round-trip

3. **Rack Groups**
   - Layout.rack_groups array exists (RackGroup type)
   - Share format has no rack_groups equivalent
   - Bayed rack configurations would be flattened to first rack only

4. **Connections/Cables**
   - Layout.connections array exists (MVP model)
   - Share format has no connections field
   - All port-to-port connections lost in share

---

## Code Samples

**Encoding (share.ts lines 167-177):**

```typescript
export function encodeLayout(layout: Layout): string | null {
  try {
    const minimal = toMinimalLayout(layout);
    const json = JSON.stringify(minimal);
    const compressed = pako.deflate(json);
    return base64UrlEncode(compressed);
  } catch (error) {
    console.warn("Share link encode failed:", error);
    return null;
  }
}
```

**Single-Rack Conversion (share.ts lines 40-45):**

```typescript
export function toMinimalLayout(layout: Layout): MinimalLayout {
  // For multi-rack layouts, use the first rack
  const rack = layout.racks[0];
  if (!rack) {
    throw new Error("Layout must have at least one rack");
  }
  // ... rest of conversion
}
```

**URL Generation (share.ts lines 211-220):**

```typescript
export function generateShareUrl(layout: Layout): string | null {
  const encoded = encodeLayout(layout);
  if (!encoded) return null;

  const baseUrl =
    typeof window !== "undefined"
      ? window.location.origin + window.location.pathname
      : "https://app.racku.la/";
  return `${baseUrl}?l=${encoded}`;
}
```

**Loading Shared Layout (App.svelte lines 211-229):**

```typescript
const shareParam = getShareParam();
if (shareParam) {
  const sharedLayout = decodeLayout(shareParam);
  if (sharedLayout) {
    layoutStore.loadLayout(sharedLayout);
    layoutStore.markClean();
    clearShareParam();
    toastStore.showToast("Shared layout loaded", "success");
    requestAnimationFrame(() => {
      canvasStore.fitAll(layoutStore.racks, layoutStore.rack_groups);
    });
    return;
  } else {
    clearShareParam();
    toastStore.showToast("Invalid share link", "error");
  }
}
```

**QR Code Constraint (qrcode.ts lines 17-29):**

```typescript
export const QR_VERSION = 24;
export const QR_ERROR_CORRECTION = "L" as const;
export const QR_MAX_CHARS = 1588;
export const QR_MIN_PRINT_CM = 4.0;
```

---

## Summary

The current share URL system is **elegantly designed for single-rack layouts** with:

- Aggressive abbreviation and compression (pako DEFLATE)
- URL-safe base64 encoding
- Hard QR code constraint of 1,588 chars
- Soft browser limit of ~2,000 chars

**Multi-rack support requires:**

1. Decision on encoding strategy (array of racks vs. sequential racks)
2. Handling of rack groups and bayed configurations
3. Container support (v0.6.0 nested devices)
4. Connection/cable preservation
5. Size projection modeling for 2, 3, 5+ rack scenarios

**Key Technical Debt:**

- No rack groups in share format
- No connections/cables in share format
- No containers in share format
- Settings always reset to defaults
- Device UUIDs regenerated on load
