# Isometric Export POC - Visual Notes

**Issue:** #300
**Date:** 2025-12-30
**Files generated:**

- `isometric-poc-single.svg` - Single rack front view
- `isometric-poc-dual.svg` - Dual view (front + rear)

## POC Parameters

| Parameter              | Value                                     | Notes                          |
| ---------------------- | ----------------------------------------- | ------------------------------ |
| Transform matrix       | `matrix(0.866, 0.5, -0.866, 0.5, tx, ty)` | True isometric (30°)           |
| Full-depth side panel  | 24px                                      | Represents ~24" physical depth |
| Half-depth side panel  | 12px                                      | 50% of full depth              |
| Side panel darkening   | 25%                                       | HSL lightness reduction        |
| Top surface lightening | 15%                                       | Subtle highlight effect        |
| Rack depth             | 24px                                      | Same as full-depth devices     |

## Visual Assessment

### What Works Well

1. **Depth perception** - Devices clearly appear 3D with side panels
2. **Half-depth distinction** - Smaller side panels + ½ legend indicator
3. **Color scheme** - Darkened sides and lightened tops create depth
4. **Depth sorting** - Higher U devices render behind lower ones correctly
5. **Legend readability** - Flat legend is easy to read
6. **Rack frame** - 3D frame provides context for devices

### Potential Adjustments

1. **Increase depth pixels** - 24px might be too subtle; try 30-36px
2. **Add drop shadow** - Ground shadow would improve visual grounding
3. **Rack name** - Currently only shows "FRONT/REAR"; add rack name
4. **U numbering** - Consider adding U labels (may be too cluttered when skewed)
5. **Device labels** - Could add callout lines for key devices
6. **Top surface visibility** - Device top surfaces are narrow; may need adjustment

### Edge Cases to Address in Full Implementation

1. **0.5U devices** - Not tested in POC; may need minimum height
2. **10" racks** - Narrower; proportions should scale
3. **Very tall racks (42U+)** - Test aspect ratio
4. **Device images** - Skipped in POC; recommend category icons only
5. **Airflow indicators** - Not attempted; likely skip for isometric

## Dual-View Notes

- Front and rear render side-by-side with 60px gap
- Each view has its own isometric projection
- Rear view shows same devices (in POC - would filter by face in real impl)

## Recommended Next Steps

1. **Stakeholder review** - Get approval on visual direction
2. **Adjust parameters** - Based on feedback, tweak depth/colors
3. **Proceed to Phase 1** - Implement in `export.ts` per #299

## How to View

Open the SVG files directly in a browser:

```bash
open docs/research/isometric-poc-single.svg
open docs/research/isometric-poc-dual.svg
```

Or view in VS Code with SVG preview extension.
