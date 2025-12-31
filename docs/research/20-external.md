# Research Spike #20: Branded Rack Support

**Research Question:** How does NetBox handle branded racks? What manufacturers and rack models does NetBox support? What data fields and visual customizations are available?

**Date:** 2025-12-30

---

## NetBox Rack Data Model

### RackType Model (NetBox 4.x)

NetBox introduced a **RackType** model to define physical characteristics of rack models. This allows organizations to define rack specifications once and reference them when creating individual racks.

**Manufacturer Information:**
- `manufacturer` - Reference to the manufacturer entity that produces the rack type
- `model` - Model number assigned by the manufacturer (must be unique per manufacturer)
- `slug` - URL-friendly identifier for filtering

**Physical Characteristics:**
- `form_factor` - Options: 2-post frame, 4-post frame, 4-post cabinet, wall-mounted frame, wall-mounted cabinet
- `width` - Rail-to-rail distance (typically 19 inches, but supports other standards)
- `u_height` - Rack height in rack units
- `starting_unit` - Lowest unit number (defaults to 1)
- `mounting_depth` - Maximum depth for mounted devices (mm) between front and rear rails
- `outer_width`, `outer_height`, `outer_depth` - External dimensions (mm or inches)
- `weight` - Numeric weight with unit designation
- `max_weight` - Maximum total weight capacity
- `descending_units` - Toggle for elevation display orientation

**Historical Context:**
The RackType feature was implemented after community requests (GitHub issues #3400, #9956). Prior to this, users had to manually enter dimensions for each rack or use API automation. The feature allows organizations to create a library of rack types similar to the device type library.

### Individual Rack Model

Each instantiated rack in NetBox can reference a RackType and includes additional operational fields:
- `name` - Rack identifier
- `facility_id` - Optional external facility reference
- `site`, `location`, `tenant` - Organizational assignments
- `status` - Operational status (customizable via configuration)
- `role` - Rack role assignment
- `serial` - Serial number
- `asset_tag` - Asset tracking identifier
- `description` - Free-form notes

---

## NetBox Rack Visualization

### SVG Rack Elevation Rendering

NetBox renders rack elevations as SVG images via REST API (introduced in v2.7):

**API Endpoint:**
```
/api/dcim/racks/<id>/elevation/?render=svg&face=front&unit_width=300&unit_height=35
```

**Parameters:**
- `render=svg` - Output format
- `face` - Front or rear view
- `unit_width` - Pixel width per U
- `unit_height` - Pixel height per U

**Features:**
- Device names automatically truncated with ellipsis if exceeding slot bounds
- Supports both front and rear elevation views
- Can be embedded in external systems (absolute URLs available)
- Device images (front/rear) supported when defined in device types

### Visualization Plugins

**netbox-topology-views** - Creates topology maps from NetBox device/cable data
- Supports custom device images by device role
- Export to XML (draw.io) or PNG

**netbox-floorplan-plugin** - Datacenter floorplan visualization
- Draw racks on floorplans
- Metadata labels, areas, coloring

**netbox-layout-plugin** - Enhanced location pages with clickable rack links

**Drag-and-drop Rack Elevation (Proposed)** - Plugin bounty program ($1,500) for graphical device repositioning

### Customization Limitations

Current NetBox rack visualization is functional but limited:
- No native drag-and-drop device placement
- Device labels show name/asset_tag (Jinja2 customization requested)
- No branded rack shell rendering (just device slots)
- Heat maps and availability visualization require plugins

---

## Common Rack Manufacturers

### Enterprise/Data Center Grade

| Manufacturer | Popular Series | Heights | Widths | Depths | Load Capacity |
|-------------|---------------|---------|--------|--------|---------------|
| **APC (Schneider Electric)** | NetShelter SX | 42U, 48U | 600mm, 750mm | 1070mm, 1200mm | 3750 lbs static / 2250 lbs dynamic |
| **Vertiv** | VR Rack | 42U, 45U, 48U | 600mm, 800mm | 1100mm, 1200mm | 3000 lbs static / 2250 lbs dynamic |
| **HPE** | G2 Advanced | 22U, 36U, 42U, 48U | 600mm, 800mm | 1075mm, 1200mm | 3000 lbs static / 2250 lbs dynamic |
| **Eaton** | Heavy-Duty SmartRack | 42U, 45U, 48U | Various | Up to 54" | 5000 lbs static |
| **Chatsworth (CPI)** | GlobalFrame, TeraFrame, ZetaFrame | 42U, 45U, 48U | 600mm, 750mm, 800mm | 800-1200mm | Up to 5000 lbs (ZetaFrame) |
| **Panduit** | FlexFusion | 42U, 45U, 48U, 51U | 600mm, 700mm, 800mm | 1070mm, 1200mm | 3500 lbs static / 2500 lbs rolling |

### SMB/Homelab Grade

| Manufacturer | Popular Series | Heights | Features |
|-------------|---------------|---------|----------|
| **Tripp Lite (Eaton)** | SmartRack SR-series | 12U, 18U, 24U, 42U | Budget-friendly, good build quality |
| **StarTech** | Various | 4U-42U | Lower cost, open frame options |
| **NavePoint** | Various | 6U-42U | Budget homelab, wall-mount options |

### Key Model Numbers

**APC NetShelter SX:**
- AR3100 - 42U x 600mm x 1070mm
- AR3300 - 42U x 600mm x 1200mm (Gen2 for AI/high-density)
- AR3307 - 48U x 600mm x 1200mm

**Vertiv VR:**
- VR3100 - 42U x 600mm x 1100mm
- VR3300 - 42U x 600mm x 1200mm
- VR3150 - 42U x 800mm x 1100mm

**HPE G2 Advanced:**
- P9K07A/P9K08A - 42U x 600mm x 1075mm
- P9K11A/P9K12A - 42U x 800mm x 1075mm
- P9K19A - 48U x 600mm x 1075mm

**Tripp Lite SmartRack:**
- SR42UB - 42U full-depth
- SR24UB - 24U mid-depth
- SR18UB - 18U mid-depth
- SRW12UDP - 12U wall-mount

---

## Industry Best Practices

### Rack Standards

**EIA-310-E (19-inch rack):**
- Rail-to-rail width: 19 inches (482.6mm)
- Rack unit (U): 44.45mm (1.75 inches)
- Vertical hole spacing: 1/2" - 5/8" - 5/8" repeating pattern
- Horizontal rail spacing: 18.312" (465.1mm)
- Minimum opening: 17.72" (450mm)

**10-inch / Half-Rack:**
- Not an official standard (general consensus)
- Common in audio/video and SOHO networking
- More prevalent outside the US
- Equipment compatibility varies between manufacturers

**Open Compute Project (OCP) Open Rack:**
- 21-inch IT equipment width (vs 19-inch standard)
- OpenU (OU): 48mm (vs standard 44.45mm)
- Same 600mm external width as standard racks
- Optimized for hyperscale data centers
- ORv3 supports both 21" OCP and 19" EIA equipment

### Layout Best Practices

1. **Weight distribution** - Mount heaviest equipment at bottom
2. **Airflow management** - Front-to-rear airflow, perforated doors (80% open)
3. **Cable management** - Vertical cable managers, labeled cables
4. **Accessibility** - Frequently accessed equipment at comfortable height
5. **Power redundancy** - Dual PDUs on opposite sides
6. **Documentation** - Maintain accurate rack diagrams

### Visual Representation Best Practices

- Use 2D elevation views (front and rear) for documentation
- 3D views useful for airflow/heat visualization only
- Include U-number markings for reference
- Color-coding for device types, status, or ownership
- Show both device labels and available space

---

## Similar Tools/Implementations

### Open Source

**NetBox** (netbox.dev)
- Comprehensive DCIM with rack management
- SVG rack elevation rendering
- Device type library with images
- REST API for integration
- Plugin ecosystem for visualization

**RackTables** (racktables.org)
- Asset management with rack visualization
- Open source, self-hosted
- Steeper learning curve
- HTML-based rack rendering

**OpenDCIM**
- Web-based DCIM
- Free and open source
- Basic rack visualization

### Commercial

**Device42**
- Photo-realistic device rendering
- Drag-and-drop rack management
- Auto-generated rack diagrams (1/2U, back-to-back)
- Heat maps (usage, temperature)
- Multi-rack views with device dragging
- Library of equipment brands/models
- Customizable nameplate options

**Sunbird dcTrack**
- Award-winning DCIM
- Real-time facility information
- Capacity planning

**Nlyte Software**
- Gartner Magic Quadrant leader
- Hybrid infrastructure management
- Comprehensive asset management

**Hyperview**
- Agentless discovery
- 3D visualization
- Power/energy monitoring

**CENTEROS**
- Visual data center management
- Purpose-built DCIM

### Diagram Tools

**Lucidchart** - Cloud-based diagramming with rack templates
**SmartDraw** - Pre-formatted rack symbols
**PATCHBOX Rack Planner** - Free rack planning tool
**draw.io** - Free diagramming with rack shapes

### Key Differentiators

| Feature | NetBox | Device42 | Rackula (Target) |
|---------|--------|----------|------------------|
| Branded rack shells | RackType model | Equipment library | Planned |
| Visual customization | Basic SVG | Photo-realistic | Lightweight SVG |
| Drag-and-drop | Plugin (proposed) | Yes | Yes |
| Device images | Via device types | Library | Via device types |
| Heat maps | Plugin | Built-in | Not planned |
| Export formats | SVG, API | Multiple | PNG, PDF, ZIP |
| Target audience | Enterprise | Enterprise | Homelab/SMB |

---

## Recommendations for Rackula

### Data Model Additions

Based on NetBox's RackType model, consider adding:

```typescript
interface RackType {
  manufacturer: string;      // e.g., "APC", "Vertiv", "HPE"
  model: string;            // e.g., "NetShelter SX AR3100"
  slug: string;             // URL-friendly identifier
  form_factor: FormFactor;  // 2-post, 4-post cabinet, etc.
  width: RackWidth;         // 19" or 10"
  u_height: number;         // 42, 48, etc.
  outer_dimensions?: {
    width: number;          // mm
    height: number;         // mm
    depth: number;          // mm
  };
  max_weight?: number;      // kg or lbs
}
```

### Visual Customization Options

1. **Rack frame styling** - Different visual representations per manufacturer/form factor
2. **Color schemes** - Manufacturer-specific colors (APC black, HPE silver)
3. **Branding elements** - Optional manufacturer logo placement
4. **Form factor visuals** - 2-post vs 4-post vs cabinet appearance

### Priority Features

1. **Manufacturer selection** - Dropdown with common manufacturers
2. **Model presets** - Pre-defined configurations for popular models
3. **Custom dimensions** - Override for non-standard racks
4. **Visual variants** - Simple toggle between frame styles

### Implementation Notes

- Keep visual representation lightweight (SVG-based)
- Focus on homelab/SMB use cases (not full DCIM)
- Consider device library integration for manufacturer consistency
- Export should preserve rack branding information

---

## Sources

- [NetBox RackType Documentation](https://netbox.readthedocs.io/en/stable/models/dcim/racktype/)
- [NetBox Rack Documentation](https://netboxlabs.com/docs/netbox/models/dcim/rack/)
- [NetBox Rack Types Feature Request](https://github.com/netbox-community/netbox/issues/9956)
- [NetBox DeviceType Library](https://github.com/netbox-community/devicetype-library)
- [Device42 Racks Documentation](https://docs.device42.com/infrastructure-management/buildings-rooms-and-racks/racks/)
- [HPE G2 Advanced Series QuickSpecs](https://www.hpe.com/psnow/doc/c05324689)
- [APC NetShelter SX AR3100](https://www.se.com/us/en/product/AR3100/)
- [Vertiv VR Rack Series](https://www.dell.com/en-us/shop/vertiv-vr-rack-42u-server-rack-enclosure-600x1200mm-19-inch-cabinet-vr3300/apd/aa309731/)
- [Eaton SmartRack Enclosures](https://www.eaton.com/us/en/catalog/server-racks-enclosures-airflow-management/heavy-duty-smartrack-enclosures.html)
- [CPI GlobalFrame Cabinets](https://www.chatsworth.com/en-us/products/cabinets-enclosures-containment/server-and-network/enterprise-and-colocation/gt-series-globalframe-gen-2-cabinet)
- [Panduit FlexFusion](https://mkt.panduit.com/FlexFusion-EN.html)
- [EIA-310 Standard Explanation](https://www.racksolutions.com/news/data-center-optimization/eia-310-definition/)
- [Open Compute Project Open Rack](https://www.opencompute.org/wiki/Open_Rack/SpecsAndDesigns)
- [RackTables Alternatives](https://alternativeto.net/software/racktables/)
- [Tripp Lite Rack Specifications](https://assets.tripplite.com/brochure/rack-specifications-brochure-en.pdf)
