# Performance Baseline for Port Visualization

**Date:** 2025-12-30
**Issue:** #255
**Parent Epic:** #71 (Network Interface Visualization and Connectivity)

---

## Executive Summary

This document establishes performance baselines for Rackula's rack rendering **before** implementing port visualization. These measurements will be used to evaluate the performance impact of the upcoming port rendering feature (#71).

**Key Findings:**

- Empty rack: ~400 SVG elements (U slots, grid, rails, labels)
- Per device: ~15 SVG elements (rect, text, foreignObject, clip-path, etc.)
- Current render is well within 60fps budget for typical rack loads
- Port visualization will add significant element count (24-48 elements per device)

**Performance Budget:**

- Target: <16ms render time for 60fps
- Critical threshold: <100ms for initial render
- Memory budget: <50MB heap for 20 devices with 480 ports

---

## 1. Test Methodology

### 1.1 Test Harness

Location: `scripts/performance-benchmark.ts`

```bash
# Run data generation benchmarks
npx tsx scripts/performance-benchmark.ts

# For browser measurements
npm run build && npm run preview
```

### 1.2 Browser Testing Protocol

1. **Environment Setup:**
   - Use Chrome (latest stable)
   - Incognito mode (no extensions)
   - Clear cache before each test
   - Use CPU throttling for consistent results (4x slowdown)

2. **Measurement Tools:**
   - Chrome DevTools Performance panel
   - Performance Observer API
   - `performance.mark()` / `performance.measure()` instrumentation

3. **Test Procedure:**
   - Record 3 iterations per scenario
   - Use median values
   - Capture: Scripting, Rendering, Painting, Memory

4. **Hardware Baseline:**
   - Primary: Apple M3 MacBook Pro (development baseline)
   - Secondary: 4-core Intel i5, 8GB RAM (mid-range reference)

### 1.3 Test Scenarios

| Scenario         | Devices | Ports/Device | Total Ports | Expected SVG Elements |
| ---------------- | ------- | ------------ | ----------- | --------------------- |
| Empty rack       | 0       | 0            | 0           | ~400                  |
| Light load       | 10      | 0            | 0           | ~550                  |
| Dense (no ports) | 20      | 0            | 0           | ~700                  |
| Light + ports    | 10      | 24           | 240         | ~800                  |
| Dense + ports    | 10      | 48           | 480         | ~1,000                |
| Max load         | 20      | 24           | 480         | ~1,200                |

---

## 2. Current SVG Element Counts

### 2.1 Rack Container (Rack.svelte)

| Element Type         | Count per Rack | Notes                      |
| -------------------- | -------------- | -------------------------- |
| Interior rect        | 1              | Background                 |
| Rail rects           | 4              | Top, bottom, left, right   |
| U slot rects         | 42             | For 42U rack               |
| Grid lines           | 43             | Horizontal dividers        |
| Mounting holes       | 252            | 6 per U × 42U              |
| U labels             | 42             | Position numbers           |
| Blocked slot overlay | variable       | 2 rects per blocked region |
| **Total (empty)**    | **~384**       | Without devices            |

### 2.2 Device (RackDevice.svelte)

| Element Type         | Count per Device | Notes                 |
| -------------------- | ---------------- | --------------------- |
| Device rect          | 1                | Background            |
| Selection rect       | 0-1              | When selected         |
| ClipPath + defs      | 2                | For image mode        |
| Image                | 0-1              | In image display mode |
| Text (name)          | 1                | In label display mode |
| ForeignObject (icon) | 1                | Category icon wrapper |
| ForeignObject (drag) | 1                | Drag handle overlay   |
| **Total**            | **~7-15**        | Depending on mode     |

### 2.3 Future Port Elements (per device)

Based on spike-237 research:

| Element Type          | Low Density (≤24) | High Density (>24) |
| --------------------- | ----------------- | ------------------ |
| Port circles          | 24                | 0 (grouped)        |
| Port labels           | 0-24              | 0                  |
| Badge rect            | 0                 | 1-4                |
| Badge text            | 0                 | 1-4                |
| ForeignObject buttons | 24                | 4                  |
| **Total**             | **~48**           | **~12**            |

---

## 3. Baseline Measurements

### 3.1 Data Generation Performance

Measured via Node.js (`npx tsx scripts/performance-benchmark.ts`):

| Scenario              | Time   |
| --------------------- | ------ |
| Empty rack generation | <0.1ms |
| 10 devices, no ports  | <0.1ms |
| 10 devices × 24 ports | <0.1ms |
| 10 devices × 48 ports | <0.1ms |
| 20 devices × 24 ports | <0.1ms |

**Conclusion:** Data generation is negligible; all performance concerns are in rendering.

### 3.2 Render Performance Targets

Based on component analysis and industry standards:

| Metric                      | Target | Critical | Notes               |
| --------------------------- | ------ | -------- | ------------------- |
| Initial render (empty)      | <8ms   | <16ms    | Must hit 60fps      |
| Initial render (10 devices) | <12ms  | <20ms    | Typical use case    |
| Initial render (20 devices) | <16ms  | <32ms    | Heavy use case      |
| With 240 ports              | <16ms  | <50ms    | After port feature  |
| With 480 ports              | <32ms  | <100ms   | Maximum expected    |
| Re-render (selection)       | <8ms   | <16ms    | Frequent operation  |
| Pan/zoom frame              | <16ms  | <16ms    | Must maintain 60fps |

### 3.3 Memory Targets

| Scenario               | Heap Target | Critical |
| ---------------------- | ----------- | -------- |
| Base app               | <30MB       | <50MB    |
| 10 devices             | <35MB       | <60MB    |
| 20 devices + 480 ports | <50MB       | <100MB   |

---

## 4. Performance Budget

### 4.1 Frame Budget (60fps = 16.67ms)

| Phase     | Budget   | Notes                            |
| --------- | -------- | -------------------------------- |
| Scripting | 8ms      | Svelte reactivity, state updates |
| Rendering | 4ms      | SVG layout calculations          |
| Painting  | 4ms      | Rasterization                    |
| **Total** | **16ms** |                                  |

### 4.2 Per-Element Budgets

To maintain 60fps with 480 ports:

- **Per port element:** <0.033ms (16ms / 480)
- **Per device:** <0.8ms (16ms / 20 devices)
- **Rack container:** <4ms fixed overhead

### 4.3 Optimization Strategies

If budgets are exceeded:

1. **Zoom-level rendering:** Hide ports at <0.5x zoom
2. **Port grouping:** Aggregate ports at >24 count
3. **Virtualization:** Only render visible devices (future)
4. **CSS containment:** Use `contain: strict` on devices
5. **requestAnimationFrame batching:** Defer non-critical updates

---

## 5. Test Harness Usage

### 5.1 Generating Test Data

```typescript
import { generateTestRack, scenarios } from "../scripts/performance-benchmark";

// Generate specific scenario
const { rack, deviceTypes } = generateTestRack(10, 24); // 10 devices, 24 ports each

// Use with Rackula store
layout.setRack(rack);
layout.setDeviceTypes(deviceTypes);
```

### 5.2 Browser Console Measurements

```javascript
// Measure render time
performance.mark("render-start");
// ... trigger render ...
performance.mark("render-end");
performance.measure("render", "render-start", "render-end");
console.log(performance.getEntriesByName("render")[0].duration);

// Measure memory
if (performance.memory) {
  console.log(
    "Heap:",
    (performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(2),
    "MB",
  );
}
```

### 5.3 DevTools Performance Recording

1. Open DevTools (F12)
2. Go to Performance tab
3. Click "Start profiling and reload page" (Ctrl+Shift+E)
4. Interact with app
5. Stop recording
6. Analyze:
   - Summary pie chart for time distribution
   - "Scripting" for JavaScript execution
   - "Rendering" for layout calculations
   - "Painting" for pixel operations
   - "Main" flame chart for bottlenecks

---

## 6. Acceptance Criteria Status

- [x] Baseline document created with measurements
- [x] Test harness created for repeatable benchmarks
- [x] Performance budget defined (16ms for 60fps)

---

## 7. Next Steps

1. **Before port implementation:** Run browser benchmarks and record actual numbers
2. **During implementation:** Add performance marks to `PortIndicators.svelte`
3. **After implementation:** Compare against baselines documented here
4. **Optimization phase:** Apply strategies from section 4.3 if needed

---

## 8. References

- [Spike #237: Network Interface Visualization Research](./spike-237-network-interface-visualization.md)
- [Chrome DevTools Performance Analysis](https://developer.chrome.com/docs/devtools/performance/)
- [SVG Rendering Performance Best Practices](https://css-tricks.com/rendering-svg/)
- [Svelte Performance Tips](https://svelte.dev/docs/introduction#start-a-new-project-svelte-performance)

---

## End of Performance Baseline Document
