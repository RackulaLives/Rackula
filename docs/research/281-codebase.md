# Research Spike #281: Device Search Improvements - Codebase Analysis

## Files Examined

1. **src/lib/utils/deviceFilters.ts** - Core search filtering logic
2. **src/lib/components/DevicePalette.svelte** - Main device library UI component
3. **src/lib/utils/searchHighlight.ts** - Text highlighting for search matches
4. **src/lib/types/index.ts** - Type definitions for DeviceType
5. **src/lib/data/starterLibrary.ts** - Generic device library (43 devices)
6. **src/lib/data/brandPacks/index.ts** - Brand pack registry (18 brands, 200+ devices)
7. **src/lib/data/brandPacks/dell.ts** - Sample brand pack (25 Dell devices)
8. **src/lib/data/brandPacks/apc.ts** - Sample brand pack (10 APC devices)
9. **src/lib/components/DevicePaletteItem.svelte** - Individual device item display
10. **src/tests/deviceFilters.test.ts** - Filter tests

---

## Current Search Implementation

### Location
**File:** `src/lib/utils/deviceFilters.ts`

### Current Logic
```typescript
export function searchDevices(devices: DeviceType[], query: string): DeviceType[] {
	if (!query.trim()) {
		return devices;
	}

	const normalizedQuery = query.toLowerCase().trim();

	return devices.filter((device) => {
		const name = device.model ?? device.slug;
		return name.toLowerCase().includes(normalizedQuery);
	});
}
```

### What It Matches
- **Only the `model` field** (or fallback to `slug` if model is undefined)
- Uses **case-insensitive substring matching** (`.includes()`)
- **Does NOT match**: `manufacturer`, `category`, `tags`, `part_number`, or any other fields

### How It's Used
1. **DevicePalette.svelte** (line ~153): Filters generic devices
2. **DevicePalette.svelte** (line ~163): Filters brand pack devices
3. **DevicePalette.svelte** (line ~179): Filters all devices combined
4. Called with debounced search input (150ms debounce)

### Highlighting
- **File:** `src/lib/utils/searchHighlight.ts`
- Uses `highlightMatch()` which splits text into matched/unmatched segments
- Only highlights the display name (model/slug), not manufacturer

---

## Device Data Structure

### DeviceType Fields (Storage Format - Schema v1.0.0)

**Core Identity Fields:**
- `slug` - Unique identifier, kebab-case (required)
- `manufacturer` - Manufacturer/brand name (optional)
- `model` - Model name (optional)
- `part_number` - SKU (optional)

**Physical Properties:**
- `u_height` - Rack units height (required)
- `is_full_depth` - Whether device occupies full depth (optional, default: true)
- `is_powered` - Whether device is powered (optional)
- `weight` / `weight_unit` - Weight specifications (optional)
- `airflow` - Airflow direction (optional)

**Display/UI Fields:**
- `colour` - Hex colour for display (required)
- `category` - Device category from enum (required)
- `tags` - User organization tags array (optional)
- `front_image` / `rear_image` - Boolean flags (optional)

**Extended Fields:**
- `notes` - Notes/comments (optional)
- `serial_number` - Serial number (optional)
- `asset_tag` - Asset tag (optional)
- `links` - External reference links array (optional)
- `custom_fields` - User-defined fields object (optional)

### Example Data Structure
From Dell brand pack:
```typescript
{
  slug: 'poweredge-r650',
  u_height: 1,
  manufacturer: 'Dell',
  model: 'PowerEdge R650',
  is_full_depth: true,
  colour: CATEGORY_COLOURS.server,
  category: 'server'
}
```

From APC brand pack:
```typescript
{
  slug: 'smt1000rmi2uc',
  u_height: 2,
  manufacturer: 'APC',
  model: 'SMT1000RMI2UC',
  is_full_depth: true,
  colour: CATEGORY_COLOURS.power,
  category: 'power'
}
```

---

## Fields Available for Fuzzy Search

**High-Value Search Candidates:**
1. `manufacturer` - Critical for brand-based search (Dell, APC, Ubiquiti, etc.)
2. `model` - Currently searched, contains product line info
3. `slug` - Unique identifier, contains keywords (poweredge, smart-ups, etc.)
4. `category` - Device type (server, network, power, storage, etc.)
5. `tags` - User-defined organizational keywords

**Medium-Value Candidates:**
6. `part_number` - SKU/PN for specific model lookups
7. `notes` - User-added descriptions

**Low-Value (Future):**
8. Interface types (1000base-t, 10gbase-x-sfpp, etc.)
9. Power specs (VA rating, wattage)

---

## Data Sources

### Starter Library
**File:** `src/lib/data/starterLibrary.ts`
- 43 generic, unbranded devices
- Categories: servers, network, storage, power, patch-panels, kvm, av-media, cooling, shelf, blank, cable-management
- No manufacturer field
- Examples: "1u-server", "24-port-switch", "2u-ups"

### Brand Packs
**File:** `src/lib/data/brandPacks/index.ts`
- 18 brands total:
  - Network: Ubiquiti, MikroTik, TP-Link, Fortinet, Netgear, Palo Alto, Netgate
  - Storage: Synology, QNAP
  - Power: APC, Eaton, CyberPower
  - Servers: Dell, Supermicro, HPE, Lenovo
  - AV/Media: Blackmagic Design
  - Accessories: DeskPi
- Approximately 200+ branded devices
- All have `manufacturer` field set to brand name
- Examples: PowerEdge R650 (Dell), USG Pro (Ubiquiti), SMT1000RMI2UC (APC)

---

## Integration Points

### Component Hierarchy

```
DevicePalette.svelte (Main Library UI)
│
├─ Calls: searchDevices() (deviceFilters.ts)
├─ Groups by: groupDevicesByCategory() (deviceFilters.ts)
├─ Sorts by: sortDevicesByBrandThenModel() / sortDevicesAlphabetically() (deviceFilters.ts)
└─ Renders: DevicePaletteItem × N

DevicePaletteItem.svelte (Individual Device)
├─ Receives: device + searchQuery props
├─ Calls: highlightMatch() (searchHighlight.ts) - highlights matching text
└─ Displays: Device name with bolded search matches
```

### State Management
**File:** DevicePalette.svelte
- `searchQueryRaw` - User input (untyped)
- `searchQuery` - Debounced query (150ms debounce)
- `isSearchActive` - Boolean derived state
- Accordion expands all matching sections during search, restores on clear

### Grouping Modes
DevicePalette supports 3 views (localStorage-persisted):
1. **Brand** (default) - Generic section with categories, then brand sections
2. **Category** - All devices grouped by category, sorted by brand then model
3. **Flat (A-Z)** - Single "All Devices" section, alphabetically sorted

---

## Constraints & Considerations

### Current Constraints
1. **Substring-only matching** - No fuzzy/partial matching
2. **Single field search** - Only searches device.model/slug, ignores manufacturer
3. **No typo tolerance** - "Deli" won't match "Dell"
4. **Performance** - Currently linear scan (O(n)) across all devices
5. **No search ranking** - All matches treated equally

### Architecture Constraints
1. **No external dependencies** - No fuzzy search library (fuse.js, minisearch, etc.)
2. **Synchronous only** - Search happens in derived() reactivity
3. **Client-side only** - No server-side search capability
4. **Single-rack mode** - Only searches devices for one rack at a time

### Data Quality
1. **Inconsistent manufacturer field** - Starter library devices have no manufacturer
2. **Brand-specific naming** - Different capitalization patterns (APC, HPE, TP-Link, etc.)
3. **Complex model names** - Mix of alphanumeric (PowerEdge R650, SMT1000RMI2UC)
4. **No normalized tags** - User tags are freeform strings

---

## Test Coverage

**File:** `src/tests/deviceFilters.test.ts`

Current tests cover:
- Empty query returns all devices
- Case-insensitive matching
- Partial string matching
- No matches returns empty array
- Sorting by brand then model
- Sorting alphabetically
- Handling missing manufacturer

**Gap:** No tests for multi-field search or fuzzy matching

---

## Key Findings Summary

1. **Search currently limited to model/slug only** - Missing manufacturer field
2. **200+ branded devices with strong manufacturer data** - High-value search target
3. **No external dependencies** - Clean approach but requires custom fuzzy logic
4. **Debounced, synchronous search** - Good UX, fast enough for current device count
5. **Architecture supports easy enhancement** - searchDevices() is single point of modification
6. **Test coverage exists** - Can add regression tests for fuzzy search
7. **Multiple search fields already populated** - manufacturer, tags, notes available for search
