# Spike #248 External Research: Port Layout Algorithm

**Date:** 2026-01-01
**Focus:** Industry practices, standards, and accessibility requirements for high-density port layouts

---

## 1. Physical Hardware Standards

### Keystone Jack Dimensions
Standard keystone modules have a rectangular face of **14.5mm wide by 16.0mm high**.
([Wikipedia - Keystone Module](https://en.wikipedia.org/wiki/Keystone_module))

**High-density keystone jacks:**
- Slim body designs maximize space in patch panels
- Reduced rear footprint allows more ports in same space
- HD jacks enable greater port configurations within panels
([ICC Cat6 HD Keystone Jack](https://icc.com/product/cat6-rj45-keystone-jack-hd-style/))

### Real-World Port Layouts

**48-port switch layouts (from manufacturer specs):**

| Device | Form Factor | Port Arrangement |
|--------|-------------|------------------|
| Ubiquiti USW-48 | 1U | 48 RJ45 + 4 SFP+ |
| Ubiquiti USW-48-PoE | 1U | 48 RJ45 (2 rows of 24) + 4 SFP+ |
| Cisco Catalyst 3560 | 1U | 48 RJ45 (2 rows) + uplinks |

([Ubiquiti USW-48 Specs](https://techspecs.ui.com/unifi/switching/usw-48))
([Cisco 3560 Installation Guide](https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst3560/hardware/installation/guide/3560hig/higinstall1.html))

**Key insight:** Physical 48-port switches use **2 rows of 24 ports** - this is the industry standard layout.

### Patch Panel Configurations

- 48-port patch panels available in both 2U and high-density 1U configurations
- 2U panels: single row of 48 ports with more spacing
- 1U panels: 2 rows of 24 ports stacked
([Eaton 48-Port Patch Panel](https://tripplite.eaton.com/48-port-2u-rack-mount-cat5e-110-patch-panel-568b-rj45-ethernet~N052048))

---

## 2. DCIM Software Approaches

### NetBox Rack Elevations

- Default rendering: **220px wide × 22px per U** (matches Rackula!)
- No native port-level visualization in rack elevation
- Ports shown in device detail views, not on elevation diagrams
- Community discussions about adding drag-and-drop device positioning
([NetBox Rack Types](https://netboxlabs.com/docs/netbox/models/dcim/racktype/))
([NetBox Rack Elevations Issue](https://github.com/netbox-community/netbox/issues/19559))

### Device42 Visualization

- Drag-and-drop port connection management
- Shows ports in each module for modular switches
- Real-time connectivity visualization
([Device42 Patch Panel](http://solutions.device42.com/device42-powerful-patch-panel-visualization))

### NetZoom DCIM

- 2D and 3D patch panel representations
- Port-level utilization and availability
- Visual connectivity trace through patch panels
- Customizable port properties
([NetZoom Cable Connectivity](https://www.netzoom.com/products/cable-connectivity.html))

### Sunbird DCIM

- Interactive 3D visualization of connectivity
- Auto-generated network diagrams
- Both active and passive components shown
([Sunbird Patch Panel](https://www.sunbirddcim.com/glossary/patch-panel))

**Common patterns in DCIM tools:**
1. Table/list views for high port counts
2. Visual port maps for smaller devices
3. Grouping by type/status
4. Click-to-expand details

---

## 3. Touch Target Accessibility (WCAG)

### Minimum Size Requirements

| Standard | Level | Minimum Size |
|----------|-------|--------------|
| WCAG 2.5.8 | AA | 24×24 CSS pixels |
| WCAG 2.5.5 | AAA | 44×44 CSS pixels |
| Apple iOS | HIG | 44×44 points |
| Google Material | Design | 48×48 dp |

([W3C WCAG 2.5.5](https://www.w3.org/WAI/WCAG21/Understanding/target-size.html))
([Smashing Magazine Touch Targets](https://www.smashingmagazine.com/2023/04/accessible-tap-target-sizes-rage-taps-clicks/))

### Why Size Matters

- Users with tremors or limited dexterity need larger targets
- Fingers obscure view of precise touch location
- **Research:** Targets <44px have 3× higher error rates
([AllAccessible WCAG Guide](https://www.allaccessible.org/blog/wcag-258-target-size-minimum-implementation-guide))

### Practical Recommendations

1. Use padding to expand clickable area beyond visible element
2. Maintain 8-12px spacing between distinct targets
3. Exceptions: inline text links, user-customizable sizes
([Designing Better Target Sizes](https://ishadeed.com/article/target-size/))

---

## 4. Responsive Grid Patterns

### Multi-Row Layout Techniques

From React Grid Layout and Material UI:
- Use `rowIndex`, `columnIndex`, `rowSpan`, `colSpan` for complex layouts
- Breakpoints adapt grid columns (12 → 4 columns on mobile)
- Modular grids extend column grids with rows
([React Grid Layout](https://github.com/react-grid-layout/react-grid-layout))
([Material Design Responsive Grid](https://m2.material.io/design/layout/responsive-layout-grid.html))

### Grid Design Best Practices

- Three grid types: column, modular, hierarchical
- Modular grids: columns + rows = modules for element alignment
- Good grids adapt to screen sizes/orientations
- Essential for responsive design
([NN/G Using Grids](https://www.nngroup.com/articles/using-grids-in-interface-designs/))

---

## 5. Key Insights for Rackula

### Industry Standard: 2-Row Layout for 48 Ports

Physical hardware universally uses 2 rows of 24 for 48-port devices:
```
Row 1: Ports 1-24  (or odd ports)
Row 2: Ports 25-48 (or even ports)
```

This matches user mental models from real hardware.

### Spacing Calculations for Multi-Row

With 2 rows in a 19" rack (186px interior):
- 24 ports per row
- 186px ÷ 24 = **7.75px per port** (achievable!)
- With 3px port radius: 7.75 - 6 = 1.75px gap (tight but visible)

### Zoom-Level Strategies (from DCIM research)

| Zoom | Strategy |
|------|----------|
| <0.5x | Hide ports entirely |
| 0.5-1.0x | Type badges (count per type) |
| 1.0-1.5x | Individual ports (small) |
| >1.5x | Individual ports (full size) |

### Mobile Considerations

- 44×44px touch targets are essential
- At 7.75px port spacing, need 5.7× expansion for touch
- Solution: Invisible touch zones in foreignObject overlay
- Alternative: Tap device to enter "port selection mode"

---

## 6. Algorithm Recommendations

Based on research, the port layout algorithm should:

1. **Use multi-row layout as primary strategy** (matches hardware)
2. **Calculate optimal rows based on port count and device height**
   - 1U: max 2 rows (11px per row area)
   - 2U: max 4 rows (22px per row area)
3. **Scale port radius with density** (3px at low, 2px at high)
4. **Apply zoom-level rendering** (hide/badge/show thresholds)
5. **Ensure touch targets via overlay** (not smaller visual ports)
6. **Support 10" rack** with more aggressive grouping/scaling

### Thresholds from Research

| Port Count | Layout Strategy |
|------------|-----------------|
| 1-24 | Single row, 8px spacing |
| 25-48 | 2 rows, 4-8px spacing |
| 49-96 | 2-4 rows or grouped badges |
| 97+ | Grouped badges only |

---

## Sources

- [Wikipedia - Keystone Module](https://en.wikipedia.org/wiki/Keystone_module)
- [Ubiquiti USW-48 Tech Specs](https://techspecs.ui.com/unifi/switching/usw-48)
- [Cisco 3560 Installation Guide](https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst3560/hardware/installation/guide/3560hig/higinstall1.html)
- [NetBox Rack Types Documentation](https://netboxlabs.com/docs/netbox/models/dcim/racktype/)
- [Device42 Patch Panel Visualization](http://solutions.device42.com/device42-powerful-patch-panel-visualization)
- [W3C WCAG 2.5.5 Target Size](https://www.w3.org/WAI/WCAG21/Understanding/target-size.html)
- [Smashing Magazine Touch Targets](https://www.smashingmagazine.com/2023/04/accessible-tap-target-sizes-rage-taps-clicks/)
- [Material Design Responsive Grid](https://m2.material.io/design/layout/responsive-layout-grid.html)
- [React Grid Layout](https://github.com/react-grid-layout/react-grid-layout)
