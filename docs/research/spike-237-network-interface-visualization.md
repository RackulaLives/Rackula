# Spike #237: Network Interface Visualization Research

**Date:** 2025-12-29
**Parent Epic:** #71 (Network Interface Visualization and Connectivity)
**Time Investment:** ~6 hours

---

## Executive Summary

This spike investigated how to add network interface port visualization to Rackula. The research covered SVG rendering approaches, NetBox-compatible data models, and UX patterns from commercial/open-source DCIM tools.

**Key Findings:**
1. Rackula's existing SVG architecture easily supports port indicators
2. NetBox's interface schema provides a solid foundation for data modeling
3. Progressive disclosure is essential for high-density devices (48+ ports)
4. Phase 1 implementation is estimated at 2-3 days

**Recommendation:** Proceed with Phase 1 implementation focusing on interface indicators within devices, deferring cable visualization to Phase 2.

---

## 1. SVG Rendering Approach

### 1.1 Current Architecture

Rackula uses a layered SVG structure in `RackDevice.svelte`:

```
<g class="rack-device" transform="translate(...)">
  1. <rect class="device-rect" />        <!-- Background -->
  2. <rect class="device-selection" />   <!-- Selection outline -->
  3. <image /> or <text />               <!-- Content (image/label mode) -->
  4. <foreignObject class="drag-overlay"> <!-- Click/drag handling -->
</g>
```

**Key dimensions:**
- U_HEIGHT: 22px per rack unit
- RAIL_WIDTH: 17px
- Device width: ~186px (19" rack) to ~96px (10" rack)

### 1.2 Proposed Port Indicator Location

Insert port indicators as layer 3.5 (after content, before drag overlay):

```svelte
<!-- After device content, before drag overlay -->
{#if device.interfaces?.length > 0}
  <PortIndicators
    interfaces={device.interfaces}
    deviceWidth={deviceWidth}
    deviceHeight={deviceHeight}
    rackView={rackView}
    onPortClick={handlePortClick}
  />
{/if}
```

### 1.3 Port Rendering Strategy

**Low-density devices (≤24 ports):**
- Individual SVG circles (3px radius)
- 8px spacing between ports
- Positioned at device bottom edge (8px offset)
- Color-coded by interface type

**High-density devices (>24 ports):**
- Grouped badges by interface type
- Shows count (e.g., "48" in a badge)
- Click badge to expand/see details
- Prevents visual clutter

### 1.4 Click Handling

Use `foreignObject` overlays for reliable click detection:
- 12x12px invisible buttons per port
- Native browser focus management
- Title attribute for native tooltips
- `aria-label` for screen readers

### 1.5 Zoom-Level Considerations

| Zoom Level | Behavior |
|------------|----------|
| < 0.5x | Hide ports entirely |
| 0.5x - 1.0x | Show grouped badges only |
| > 1.0x | Show individual ports |

**Implementation:** Pass zoom level as prop, conditionally render.

### 1.6 Prototype Created

See `docs/research/prototype-port-indicators.svelte` for a working prototype demonstrating:
- Individual port circles
- Color coding by type
- Management interface indicators
- PoE indicators
- High-density grouping
- Click handling

---

## 2. Data Model Design

### 2.1 Alignment with NetBox

The existing Rackula schema already includes `interfaces` on `DeviceType`:

```typescript
// Current (src/lib/types/index.ts)
interface Interface {
  name: string;
  type: string;
  mgmt_only?: boolean;
}
```

**Proposed expansion:**

```typescript
interface InterfaceTemplate {
  // Required fields (NetBox-compatible)
  name: string;              // e.g., "eth0", "GigabitEthernet1/0/1"
  type: InterfaceType;       // Enum of common types

  // Optional NetBox fields
  label?: string;            // Display label
  mgmt_only?: boolean;       // Management-only flag
  enabled?: boolean;         // Default enabled state
  description?: string;

  // PoE support
  poe_mode?: 'pd' | 'pse';   // Powered device or power sourcing
  poe_type?: PoEType;        // PoE standard

  // Rackula extensions
  position?: 'front' | 'rear';  // Which device face
  group?: string;               // Visual grouping (e.g., "uplink")
}

type InterfaceType =
  // Common Ethernet
  | '1000base-t'        // 1GbE RJ45
  | '10gbase-t'         // 10GbE RJ45

  // SFP/SFP+
  | '1000base-x-sfp'    // 1GbE SFP
  | '10gbase-x-sfpp'    // 10GbE SFP+
  | '25gbase-x-sfp28'   // 25GbE SFP28

  // QSFP
  | '40gbase-x-qsfpp'   // 40GbE QSFP+
  | '100gbase-x-qsfp28' // 100GbE QSFP28

  // Console/Management
  | 'console'           // Serial console
  | 'management'        // Dedicated management
  ;

type PoEType =
  | 'type1-ieee802.3af'   // 15.4W
  | 'type2-ieee802.3at'   // 30W (PoE+)
  | 'type3-ieee802.3bt'   // 60W
  | 'type4-ieee802.3bt'   // 100W
  | 'passive-24v'
  | 'passive-48v'
  ;
```

### 2.2 Connection Model (Phase 2)

For future cable visualization:

```typescript
interface Cable {
  id: string;                    // UUID

  // A-side termination
  a_device_id: string;           // Placed device UUID
  a_interface: string;           // Interface name

  // B-side termination
  b_device_id: string;
  b_interface: string;

  // Cable properties
  type?: CableType;
  color?: string;                // 6-digit hex
  label?: string;
  length?: number;
  length_unit?: 'm' | 'cm' | 'ft' | 'in';
}

type CableType =
  | 'cat5e' | 'cat6' | 'cat6a' | 'cat7'
  | 'dac-passive' | 'dac-active'
  | 'mmf-om3' | 'mmf-om4' | 'smf'
  | 'aoc'
  ;
```

### 2.3 Schema Updates Required

**Zod schema additions (`src/lib/schemas/index.ts`):**

```typescript
export const InterfaceTypeSchema = z.enum([
  '1000base-t',
  '10gbase-t',
  '10gbase-x-sfpp',
  // ... etc
]);

export const InterfaceTemplateSchema = z.object({
  name: z.string().min(1).max(64),
  type: InterfaceTypeSchema,
  label: z.string().max(64).optional(),
  mgmt_only: z.boolean().optional(),
  position: z.enum(['front', 'rear']).optional(),
  poe_mode: z.enum(['pd', 'pse']).optional(),
  poe_type: z.string().optional(),
}).passthrough();
```

---

## 3. UX Patterns from Research

### 3.1 Common Patterns Observed

| Tool | Port Display | Connection Creation | High-Density Handling |
|------|--------------|---------------------|----------------------|
| **NetBox** | SVG rack elevations, plugins for topology | Database-driven cables | Table-based port lists |
| **draw.io** | Fixed connection points | Drag from port to port | Manual grouping |
| **Device42** | Hover highlights, tooltips | Drag-and-drop with validation | Color-coded port groups |
| **RackTables** | Table-based | Link creation forms | GraphViz export |

### 3.2 Best Practices to Adopt

1. **Progressive Disclosure**
   - Overview: Device-level indicators (has ports? how many?)
   - Detail: Individual ports on hover/zoom/click

2. **Color Coding**
   - By type: 1GbE (green), 10GbE (blue), SFP+ (purple)
   - By status: Available (normal), Connected (filled), Error (red)

3. **Hover Interactions**
   - Tooltip with port name and type
   - For connected ports: show destination device/port
   - Path highlighting (future Phase 2)

4. **Click Interactions**
   - Select port for connection creation
   - Show port details panel
   - Copy port name to clipboard (Ctrl+click)

### 3.3 Mobile Considerations

- Minimum touch target: 44x44px
- Long-press for port details (instead of hover)
- Bottom sheet for port information
- Simplified view (grouped badges only) on mobile

---

## 4. Performance Considerations

### 4.1 Rendering Performance

**Concern:** High-density devices (48-port switches, 24-port patch panels)

**Mitigation strategies:**
1. Use native SVG (no React reconciliation overhead)
2. Batch DOM updates with requestAnimationFrame
3. Hide ports at low zoom levels
4. Group ports instead of individual rendering at high counts

**Benchmarks needed:**
- 4x 48-port switches = 192 port elements
- Target: <16ms render time (60fps)

### 4.2 Memory Considerations

- Interface definitions on DeviceType (shared)
- No per-placement memory cost for ports
- Cable data stored separately (only if used)

---

## 5. Implementation Phases

### Phase 1: Interface Indicators (2-3 days)
**Goal:** Show interface ports on device faces

| Task | Estimate |
|------|----------|
| Expand `InterfaceTemplate` type | 2h |
| Update Zod schema | 1h |
| Create `PortIndicators.svelte` component | 4h |
| Integrate into `RackDevice.svelte` | 2h |
| Add zoom-level awareness | 2h |
| Update export logic (export.ts) | 3h |
| Tests | 4h |
| **Total** | ~18h (2-3 days) |

**Deliverables:**
- Port circles rendered on devices with interfaces
- Color coding by type
- Hover tooltips
- Export includes ports
- Works at all zoom levels

### Phase 2: Port Details Panel (2 days)
**Goal:** Click port to see/edit details

- Port details in EditPanel
- Interface list editing
- NetBox device-type YAML import

### Phase 3: Cable Connections (4-5 days)
**Goal:** Visualize cables between devices

- Cable data model
- Cable path rendering (SVG paths)
- Connection creation UI
- Cable tracing (hover to highlight path)

### Phase 4: Advanced Features (TBD)
- Multi-rack cables
- Patch panel pass-through
- Connection validation
- NetBox export/sync

---

## 6. Technical Decisions

### 6.1 Decisions Made

| Decision | Rationale |
|----------|-----------|
| Use SVG circles for ports | Native, performant, styleable |
| Use `foreignObject` for clicks | Reliable event handling, a11y support |
| Color by interface type | Visual categorization matches industry convention |
| Position at device bottom | Least interference with device label/image |
| Group at >24 ports | Prevents visual overload, UX best practice |

### 6.2 Decisions Deferred

| Item | Reason |
|------|--------|
| Cable rendering approach | Needs more research on SVG path algorithms |
| Port ordering/positioning | NetBox doesn't specify; may need layout editor |
| Modular device support | Future scope (blade servers, modular switches) |
| Wireless interface handling | Different visualization needs |

---

## 7. Files Created

1. `docs/research/spike-237-network-interface-visualization.md` (this document)
2. `docs/research/prototype-port-indicators.svelte` (SVG prototype)
3. `docs/research/netbox-interface-cable-schema.md` (NetBox research)

---

## 8. Recommendation

**Proceed with Phase 1 implementation.**

The research confirms that:
1. Existing architecture supports this feature with minimal changes
2. NetBox compatibility is achievable with current type definitions
3. The UX patterns are well-established in the industry
4. Performance is manageable with proper optimization

**Suggested next steps:**
1. Create issue for Phase 1 implementation
2. Break down into sub-tasks per Phase 1 table
3. Assign to v0.8.0 milestone
4. Begin with type/schema work, then UI

---

## 9. References

### Codebase Files Examined
- `src/lib/components/RackDevice.svelte` (device rendering)
- `src/lib/components/Rack.svelte` (rack container)
- `src/lib/types/index.ts` (type definitions)
- `src/lib/schemas/index.ts` (Zod schemas)
- `src/lib/constants/layout.ts` (layout constants)
- `src/lib/stores/images.svelte.ts` (image store pattern)
- `src/lib/utils/export.ts` (export logic)

### External Research
- NetBox Interface/Cable documentation
- NetBox devicetype-library YAML format
- draw.io/diagrams.net connector patterns
- Device42 DCIM visualization features
- RackTables port linking documentation

### Issue Links
- [#237 - Spike: Network Interface Visualization](link)
- [#71 - Epic: Network Interface Visualization and Connectivity](link)

---

**End of Spike Research Document**
