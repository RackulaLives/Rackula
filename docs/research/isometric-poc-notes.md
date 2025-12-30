# Isometric Export POC v2 - Visual Notes

**Issue:** #300
**Date:** 2025-12-30
**Version:** 2.0 (Full 3D Cabinet)
**Files generated:**

- `isometric-poc-single.svg` - Single rack cabinet front view
- `isometric-poc-dual.svg` - Dual view (front + rear cabinets)

## POC v2 Improvements

This version renders a **proper 3D server rack cabinet enclosure** with devices mounted inside, rather than just a flat rack with extruded sides.

### Key Features

| Feature              | Description                                           |
| -------------------- | ----------------------------------------------------- |
| 3D Cabinet Enclosure | Full cabinet with top, bottom, sides, and back panels |
| Mounting Rails       | Visible rack rails with mounting holes                |
| Side Panel Vents     | Horizontal vent slots on the right side panel         |
| Status LEDs          | Cabinet LEDs with glow effect on top-left             |
| Device Details       | Bezel lines, front LEDs, drive bays                   |
| Half-depth Devices   | Visually shorter depth inside cabinet                 |

## Technical Parameters

| Parameter       | Value                                | Notes                        |
| --------------- | ------------------------------------ | ---------------------------- |
| Projection      | True isometric (30°)                 | `isoProject(x, y, z)` helper |
| Rack Width      | 160px                                | Front face width             |
| Rack Depth      | 100px                                | Cabinet depth                |
| U Height        | 18px                                 | Pixels per rack unit         |
| Rack Size       | 12U                                  | Demo rack                    |
| Frame Thickness | 8px                                  | Cabinet frame                |
| Rail Width      | 6px                                  | Mounting rails               |
| Full-depth      | 90px (RACK_DEPTH - 10)               | Full-depth devices           |
| Half-depth      | 40px (RACK_DEPTH \* 0.4)             | Half-depth devices           |
| Side darkening  | 30% (RGB multiplication)             | Side panel shading           |
| Top lightening  | 20% (RGB interpolation toward white) | Top surface highlight        |

## Visual Assessment

### What Works Well

1. **Realistic cabinet appearance** - Looks like an actual server rack
2. **Proper depth visualization** - Cabinet depth creates sense of volume
3. **Device mounting context** - Devices clearly sit inside the cabinet
4. **Mounting rails** - Rails with holes add authenticity
5. **Side panel vents** - Add visual interest and realism
6. **Status LEDs** - Cabinet LEDs with glow effect
7. **Device details** - Bezel lines, front LEDs, drive bays
8. **Color scheme** - Dracula theme matches app aesthetic

### What Could Be Improved

1. **Add rack name label** - Show rack name on cabinet or below
2. **U position labels** - Consider subtle U markers (may be cluttered)
3. **Ground shadow** - Drop shadow below cabinet
4. **Device labels** - Optional callout lines for device names
5. **Cabinet feet/casters** - Add visual grounding at bottom

### Sample Devices in POC

| Device         | U Height | Position | Full Depth | Details    |
| -------------- | -------- | -------- | ---------- | ---------- |
| UPS            | 2U       | U1-2     | Yes        | -          |
| Patch Panel    | 1U       | U3       | No         | -          |
| Network Switch | 1U       | U4       | No         | Front LEDs |
| Server         | 2U       | U5-6     | Yes        | Front LEDs |
| NAS            | 4U       | U7-10    | Yes        | Drive bays |
| Blank Panel    | 1U       | U11      | No         | -          |

## Edge Cases for Full Implementation

1. **0.5U devices** - May need minimum visual height
2. **10" racks** - Scale proportionally (narrower width)
3. **Very tall racks (42U+)** - Test aspect ratio and canvas size
4. **Device images** - Consider category icons only (not full images)
5. **Airflow indicators** - Likely skip for isometric view
6. **Empty U slots** - Show cabinet interior darkness

## Dual-View Notes

- Front and rear cabinets render side-by-side with 80px gap
- Both are identical 3D cabinets (in real impl, rear shows rear-mounted devices)
- Shared legend below both views

## How to View

Open the SVG files directly in a browser:

```bash
open docs/research/isometric-poc-single.svg
open docs/research/isometric-poc-dual.svg
```

Or view in VS Code with SVG preview extension.

## Recommended Next Steps

1. **Review visual output** - Verify cabinet looks appropriate
2. **Adjust parameters** - Tweak colors/dimensions based on feedback
3. **Proceed to Phase 1** - Implement in `export.ts` per #299
