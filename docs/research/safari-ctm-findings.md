# Safari CTM Research Findings

**Issue**: #411 (reopened) **Date**: 2026-01-05 **Browser**: Safari 26.2 (WebKit 605.1.15) on macOS 15.6.1

## Executive Summary

Safari's `SVGSVGElement.getScreenCTM()` method has a bug where it **does not incorporate CSS `scale()` transforms** applied to ancestor elements of the SVG. This causes coordinate conversion errors when the SVG is inside a scaled container (like panzoom).

## Test Results

| CSS Transform | CTM Accuracy | BBox Accuracy | Notes |
| --- | --- | --- | --- |
| None | Correct | Correct | Baseline |
| `translate(50px, 50px)` | Correct | Correct | Translation works |
| `scale(0.5)` | **Wrong (2x error)** | Correct | Scale ignored |
| `scale(1.5)` | **Wrong (1.5x error)** | Correct | Scale ignored |
| `scale(0.8) translate(30px)` | **Wrong (~1.25x error)** | Correct | Scale ignored |

## Root Cause

Safari's WebKit implementation of `getScreenCTM()`:

- Correctly includes the SVG's own viewBox transform
- Correctly includes CSS `translate()` on ancestors
- **IGNORES** CSS `scale()` on ancestors

This is a WebKit bug. The CTM should include ALL transforms in the rendering path from screen to SVG user space.

## Impact on Rackula

Rackula uses `panzoom` library which applies CSS transforms including `scale()` for zoom functionality. When zoomed in/out:

1. **Icon positioning**: Not directly affected (render-time)
2. **Drop target offset**: `screenToSVG()` returns wrong coordinates → drop indicator appears at wrong position
3. **Drag tracking**: Position error is proportional to zoom level, appearing as "velocity" change

## Workaround

Use `getBoundingClientRect()` instead of `getScreenCTM()` for coordinate conversion:

```typescript
function screenToSVG_BBox(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
) {
  const rect = svg.getBoundingClientRect();
  const viewBox = svg.viewBox.baseVal;

  const scaleX = viewBox.width / rect.width;
  const scaleY = viewBox.height / rect.height;

  const x = (clientX - rect.left) * scaleX + viewBox.x;
  const y = (clientY - rect.top) * scaleY + viewBox.y;

  return { x, y };
}
```

This approach:

- Works correctly in Safari with CSS scale transforms
- Works correctly in Chrome/Firefox
- Handles viewBox offset correctly
- Is simpler and more predictable

## Recommendation

Replace the `getScreenCTM()` implementation in `src/lib/utils/coordinates.ts` with the `getBoundingClientRect()` approach. This is a safe change that improves Safari compatibility without affecting other browsers.

## Related Issues

- #411 - Safari device positioning broken
- #393 - Original Safari foreignObject issue
- #397 - Safari pointer events fix
- WebKit Bug #230304 - foreignObject transform inheritance (related but different)

## Files to Modify

- `src/lib/utils/coordinates.ts` - Replace `screenToSVG()` implementation
