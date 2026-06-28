# 2622 External Research: Accurate Depth Model and Visualization

Industry and standards research for Rackula spike #2622 (move device depth from categorical half/full to accurate physical mm, and give racks a depth dimension).

- Access date for all sources: 2026-06-26
- NetBox source pinned to commit `4f4e97f1a67b2f46df9a7ccf8f74a7e28b3f88ce` (develop branch, fetched 2026-06-26)
- "unverified" = could not confirm an exact figure against a primary source; treat as directional only.

---

## 1. NetBox Depth Model (Primary Reference)

NetBox is the dominant open-source DCIM. The headline, schema-changing finding for this spike:

> **NetBox device types have NO numeric depth field.** Device depth is modelled solely as a boolean `is_full_depth`. Rack depth is captured as `mounting_depth` (always millimetres) plus optional `outer_depth`, but NetBox does **not** validate device depth against rack depth, because there is no device depth to compare. `mounting_depth` is informational metadata only.

This is confirmed three independent ways: the model source, the device-type-library JSON schema, and real device YAMLs (below). A feature request to add per-device depth (issue #14176) was **closed as "not planned."**

### 1a. DeviceType fields (verbatim from `netbox/dcim/models/devices.py`)

```python
u_height = models.DecimalField(
    max_digits=4, decimal_places=1, default=1.0,
    verbose_name=_('height (U)')
)
is_full_depth = models.BooleanField(
    default=True,
    verbose_name=_('is full depth'),
    help_text=_('Device consumes both front and rear rack faces.')
)
subdevice_role = models.CharField(
    max_length=50, choices=SubdeviceRoleChoices, blank=True, null=True,
    verbose_name=_('parent/child status'),
    help_text=_('Parent devices house child devices in device bays. Leave blank '
                'if this device type is neither a parent nor a child.')
)
airflow = models.CharField(
    max_length=50, choices=DeviceAirflowChoices, blank=True, null=True,
    verbose_name=_('airflow')
)
exclude_from_utilization = models.BooleanField(
    default=False,
    verbose_name=_('exclude from utilization'),
    help_text=_('Devices of this type are excluded when calculating rack utilization.')
)
# weight + weight_unit are inherited from WeightMixin (no depth field anywhere)
```

- `u_height`: decimal, 0.5-step (max 4 digits, 1 decimal place), default 1.0.
- `is_full_depth`: boolean, **default True**. Semantics: a full-depth device occupies BOTH the front and rear rack faces in its U-span; a non-full-depth device occupies only the face it is mounted on, leaving the opposite face free for another device.
- `subdevice_role`: `SubdeviceRoleChoices` = `parent` / `child` (parent houses children in device bays). Blank = neither. This is NetBox's chassis/blade model, orthogonal to depth.
- `airflow` (`DeviceAirflowChoices`): `front-to-rear`, `rear-to-front`, `left-to-right`, `right-to-left`, `side-to-rear`, `rear-to-side`, `bottom-to-top`, `top-to-bottom`, `passive`, `mixed`.
- **No depth/length/mm field exists on DeviceType.** The only physical dimensions are `u_height` (RU) and `weight`.

### 1b. How `is_full_depth` drives front/rear mounting (from `racks.py`)

`Rack.get_rack_units()` selects which devices appear on a given face with:

```python
.filter(Q(face=face) | Q(device_type__is_full_depth=True))
```

So a device shows on a face if it is mounted on that face OR it is full-depth (full-depth = shows on both). `Device.face` (front/rear) plus `is_full_depth` is the entire depth model. There is no millimetre comparison anywhere in placement or validation logic.

### 1c. Rack / RackType fields (verbatim from `netbox/dcim/models/racks.py`)

`RackType` and `Rack` share a `RackBase(WeightMixin, PrimaryModel)` abstract base:

```python
width = models.PositiveSmallIntegerField(
    choices=RackWidthChoices, default=RackWidthChoices.WIDTH_19IN,
    verbose_name=_('width'), help_text=_('Rail-to-rail width')
)
u_height = models.PositiveSmallIntegerField(
    default=RACK_U_HEIGHT_DEFAULT, verbose_name=_('height (U)'),
    help_text=_('Height in rack units')
)
starting_unit = models.PositiveSmallIntegerField(
    default=RACK_STARTING_UNIT_DEFAULT, verbose_name=_('starting unit'),
    help_text=_('Starting unit for rack')
)
desc_units = models.BooleanField(
    default=False, verbose_name=_('descending units'),
    help_text=_('Units are numbered top-to-bottom')
)
outer_width  = PositiveSmallIntegerField(null=True, help_text='Outer dimension of rack (width)')
outer_height = PositiveSmallIntegerField(null=True, help_text='Outer dimension of rack (height)')
outer_depth  = PositiveSmallIntegerField(null=True, help_text='Outer dimension of rack (depth)')
outer_unit = models.CharField(
    max_length=50, choices=RackDimensionUnitChoices, blank=True, null=True
)
mounting_depth = models.PositiveSmallIntegerField(
    verbose_name=_('mounting depth'), blank=True, null=True,
    help_text=_('Maximum depth of a mounted device, in millimeters. For four-post '
                'racks, this is the distance between the front and rear rails.')
)
max_weight = models.PositiveIntegerField(null=True, help_text='Maximum load capacity for the rack')
# weight, weight_unit from WeightMixin
```

`RackType` adds `form_factor` (required); `Rack` adds `form_factor` (optional), `rack_type` FK, and an `airflow` field (`RackAirflowChoices`: `front-to-rear`, `rear-to-front`).

Choice enums (from `netbox/dcim/choices.py`):

- **`RackFormFactorChoices`**: `2-post-frame`, `4-post-frame`, `4-post-cabinet`, `wall-frame`, `wall-frame-vertical`, `wall-cabinet`, `wall-cabinet-vertical`.
- **`RackWidthChoices`**: `10`, `19`, `21`, `23` (inches).
- **`RackDimensionUnitChoices`**: `mm`, `in`. (Applies to `outer_*` only.)
- **`RackAirflowChoices`**: `front-to-rear`, `rear-to-front`.

### 1d. Critical: units and validation

- `outer_width/height/depth` accept **mm or in** via `outer_unit`. Validation: setting any outer dimension requires `outer_unit` ("Must specify a unit when setting an outer dimension").
- **`mounting_depth` is hard-coded to millimetres** (no unit selector). This inconsistency is the subject of open feature request #20942 ("allow rack type mounting depth to be either inches or millimeters") and display request #21178.
- **NetBox performs NO "device deeper than rack" validation.** The `Rack.clean()` checks are: rack tall enough for installed devices, starting unit valid, outer dims require a unit, max_weight requires a unit, location/site consistency. Nothing compares any device dimension to `mounting_depth`. Because device depth is not modelled, `mounting_depth` is purely human-readable capacity info.
- Issue #14176 ("Add Depth as Device Property") proposed deriving full-depth status dynamically from a device depth vs rack depth. **Closed as not planned.** So the categorical `is_full_depth` is, by deliberate NetBox design choice, the substitute for real depth.

### 1e. devicetype-library YAML (what real device data actually contains)

`netbox-community/devicetype-library` `schema/devicetype.json` top-level properties: `manufacturer, model, slug, part_number, u_height, is_full_depth, airflow, weight, weight_unit, front_image, rear_image, subdevice_role, is_powered, console-ports, console-server-ports, power-ports, power-outlets, interfaces, front-ports, rear-ports, module-bays, device-bays, inventory-items, description, comments`.

> There is **no `depth`, `length`, or mm-dimension property** in the schema. The only physical dimensions a community device-type carries are `u_height` (RU) and `weight` + `weight_unit`.

Example, `device-types/Dell/PowerEdge-R740.yaml`: `u_height: 2`, `is_full_depth: true`, `weight: 28.6`, `weight_unit: kg`, `airflow: front-to-rear`. No depth field. Confirms the corpus Rackula would import from has no depth data; depth would have to be sourced separately.

**Implication for Rackula:** if Rackula adds a numeric `depth_mm` to devices, it goes beyond NetBox's data model and cannot be auto-populated from the NetBox device-type-library. Defaults must be seeded from vendor datasheets (Section 2) or inferred from `is_full_depth` + a per-category heuristic.

---

## 2. Real-World Device Depth Ranges (per category, cited examples)

All depths are chassis depth (body), millimetres. Bezels, handles, PSU bulges and cable-management arms add to the in-rack footprint beyond these figures.

### Rack servers

- **Mainstream 2U (deep):** Dell PowerEdge R740 = **678.8 mm** without bezel, **715.5 mm** with bezel (Dell tech specs).
- **Short-depth / edge 1U:** Supermicro SYS-510T-ML "Mini-1U short-depth" = 437 x 43 x **368 mm** (W x H x D) (Supermicro datasheet).
- **Deep 4U GPU:** Supermicro AS-4125GS-TNRT = 17.2"W x 7"H x 29"D = **~737 mm** deep (Supermicro / eStore).
- **Defensible range:** short-depth/edge **300-400 mm**; mainstream 1-2U **650-780 mm**; deep GPU/storage **750-900 mm** (verified to 737 mm; >800 mm class such as dense storage JBODs and DGX-class GPU systems exists but exact figure unverified here).

### Network switches and routers

- **Shallow access switch:** Ubiquiti USW-Pro-48 = 44.0 x 28.5 x 4.3 cm → depth **285 mm** (Ubiquiti tech specs).
- **Deep PoE access switch:** Cisco Catalyst 9300-M = depth **449 mm** (C9300-24T-M) up to **564 mm** (high-PoE 48-port) (Cisco Meraki datasheet).
- **Defensible range:** shallow access **200-300 mm**; deep PoE / fixed-config **450-600 mm**; modular chassis (Catalyst 9400/9600 class) deeper still (unverified, ~600-900 mm).

### Patch panels

- 1U 24-port copper panel body ≈ **44-50 mm** projection (e.g. 19"L x 1.97"W x 1.75"H; the ~2" "width" is the front-to-back body depth). Keystone variants ~65 mm.
- **Defensible range:** **25-70 mm**. Essentially face-plane hardware; depth is negligible for collision but they still occupy a U.

### PDUs

- **0U vertical (most common in cabinets):** APC AP8853 Metered ZeroU = 1791 x 56 x **44 mm** (H x W x D). Mounts in the rear/side mounting channel, **outside the U-space**; its 44 mm depth is essentially irrelevant to U-depth planning but matters for rear-door clearance.
- **Horizontal 1U/2U PDU:** shallow body, typically **<100-150 mm** deep but plugs/cords project rearward (figure unverified; varies widely by outlet count).
- **Modelling note:** treat 0U vertical PDUs as a side-channel mount, not a depth-consuming U device.

### UPS

- APC Smart-UPS SMT2200RM2U (2U) = max depth **683 mm**, max width 480 mm, 2U (Schneider/APC datasheet). Heavy (battery mass) and among the deepest rack items.
- **Defensible range:** small rack UPS **400-500 mm**; mid/large **600-750 mm+**. Always treat as deep + heavy.

### Rack shelves (cantilever vs full-depth)

- StarTech cantilever shelves: 1U/2U from **254 mm (10")** to **559 mm (22")** deep; cantilever = front-rail mount only.
- Adjustable 4-post shelf: up to **~700 mm (27.5")** deep with 19.5-38" adjustable mounting depth.
- **Defensible range:** cantilever **250-400 mm** typical; full-depth 4-post shelves **500-750 mm**.

### AV gear (amps, processors)

- QSC GX5 power amp: min chassis depth **257 mm (10.1")** (QSC).
- QSC PL380 power amp: **~406 mm (~16")** deep (QSC).
- **Defensible range:** AV amps/processors **250-560 mm** (touring power amps run deepest; small DSP/processors shallow). Relevant to Rackula's AV/touring/studio audience.

---

## 3. Enclosure / Cabinet Depth

### Common outer depths and vendor examples

- **APC NetShelter SX** (Schneider) AR3100 = **1991H x 600W x 1070D mm**; SX family ships in common outer depths of **600, 1070, 1200 mm**.
- **Tripp Lite (Eaton) SmartRack 42U:** standard-depth **1070 mm (42")** vs deep **SR42UBDP = 1200 mm (47.25")**.
- **StarTech 42U 4-post open frame:** **1016 mm (40")** adjustable mounting depth.
- **Homelab 10-inch mini-rack:** DeskPi RackMate T1 (10", 8U) usable depth **~200 mm** (GeeekPi 10" shelves are 7.87"/200 mm deep); RackMate T2 Plus ~260 mm for NAS. The IKEA "Lack rack" (table legs ~50 cm apart) is a 19"-ish DIY frame with ~500 mm usable depth (unverified exact figure).
- **Common cabinet outer-depth ladder:** **600, 800, 1000, 1070, 1200 mm**.

### Outer depth vs usable mounting depth (the delta)

- Mounting posts are **adjustable front-to-back** in 4-post cabinets, so usable rail-to-rail depth is set at install, not by the SKU. NetBox's `mounting_depth` = this rail-to-rail figure.
- Front door + rear door + cable space typically consume **~100-150 mm+** of the outer depth; rear clearance of **4-6" (100-150 mm)** is recommended for cabling/airflow. So a 1070 mm cabinet commonly yields ~**800-900 mm** usable mounting depth (directional; depends on door/PDU choices).

### CRITICAL standards point (verified)

> **EIA-310-D (and IEC 60297) standardize rack WIDTH, the rack unit (1U = 1.75"), and hole spacing - NOT depth.** Depth, mounting depth, hole type, front/rear space, and obstructions between front and rear rails are explicitly **not** part of EIA-310-D and are vendor-defined / rail-adjustable.

- NavePoint and RackSolutions confirm EIA-310-D standardizes: rack unit = 1.75", 19" panel/flange width, horizontal hole spacing (18.312" / 465 mm flange-to-flange family), the 0.625" repeating vertical hole pattern, and a minimum rack opening of ~450 mm. Depth is absent.
- RackSolutions / Intel's "Server Rack Cabinet Compatibility Guide" state characteristics such as "hole type, mounting depth, front and rear space, and obstructions between front and rear rails" are **not standardized** in EIA-310-D.
- Consequence for Rackula: rack depth must be a free numeric field (with sensible presets), not derived from a width/form-factor standard. There is no canonical depth per rack class.

---

## 4. Clearance Behind / Around Devices ("what depth planning is for")

- **Rear service/cabling clearance:** minimum **4-6 inches (≈100-150 mm)** behind equipment for cabling and ventilation; more with rear-mounted PDUs or cable managers (serverrackcabinets.com guide).
- **Cable minimum bend radius (TIA/EIA-568):**
  - Copper UTP (Cat5e/6/6A): **4x cable outer diameter** installed. Example: Cat6A ~0.57" OD → **~2.28" (58 mm)** min bend radius.
  - Fibre: **10x diameter** static/installed, **20x diameter** dynamic/under pulling tension. Example: duplex fibre ~0.19" OD → **~1.9" (48 mm)** installed.
  - Implication: even "shallow" gear needs rear room for the cable to turn; bend radius sets a practical rear-clearance floor.
- **Cable-management-arm (CMA) depth penalty:** CMAs extend roughly **28.5-33"** when articulated and consume rear depth; conversely some tool-free rail+CMA kits add ~5" of required install depth. Plan CMA depth into cabinet depth separately from device depth.
- **Blanking panels and airflow:** empty U allows hot exhaust to recirculate to intakes (bypass airflow). Filling unused U with blanking panels prevents front/rear air mixing - quantified in Schneider Electric White Paper 44, "Improving Rack Cooling Performance Using Airflow Management Blanking Panels." Depth-relevant because the front/rear air separation that blanking enforces is the same plane that `is_full_depth` / depth modelling represents.
- **Front clearance:** needed for install/removal and door swing; rear clearance for cabling/service. Depth planning exists to guarantee (a) the device physically fits rail-to-rail, (b) cables can turn within bend radius behind it, and (c) doors close.

---

## 5. 2-Post / 4-Post / Open-Frame / Wall-Mount Depth Semantics

- **4-post frame/cabinet:** front AND rear rails. Rails are adjustable front-to-back; the device must fit between them plus cabling/airflow. **Usable depth = front-rail-to-rear-rail distance** - exactly NetBox's `mounting_depth` definition ("for four-post racks, this is the distance between the front and rear rails"). This is the case where "device deeper than rack" is a real, enforceable constraint.
- **2-post (telco/relay) frame:** only two posts; equipment is **cantilever-mounted** via center-mount or flush-mount brackets. There is no rear rail, so depth is **largely unconstrained by the rack** - the limiting factor is tipping/weight, and the manufacturer specifies a max mounting depth for stability. **Center mount** balances weight over the post line; **flush mount** aligns the face to the front (cantilever, needs floor-bolting). For Rackula: a 2-post rack should not hard-fail on device depth; depth is advisory, not a fit constraint.
- **Open-frame 4-post:** rails define depth, no doors/side panels, so outer depth ≈ mounting depth + minor overhang. Cleanest case where outer_depth ≈ mounting_depth.
- **Wall-mount (NetBox `wall-frame` / `wall-cabinet`, plus vertical variants):** shallow by design; limited rear depth (wall behind). Depth constraint is tight and the binding factor. Vertical wall variants rotate the U-axis.

Mapping to NetBox `form_factor`: `2-post-frame`, `4-post-frame`, `4-post-cabinet`, `wall-frame`, `wall-frame-vertical`, `wall-cabinet`, `wall-cabinet-vertical`. A Rackula depth model should let `mounting_depth` be a hard constraint for 4-post/cabinet, advisory for 2-post, and tight for wall-mount.

---

## 6. Competitor / Other Tools Depth Modelling

- **rackbuilder.io** (Universal 19" Rack Planning Tool; touring, studio, server): models device depth and validates depth conflicts. Per the spike brief and the site's own description, it plans "with real RU space and depth constraints, maintaining aligned front/rear/side views while blocking depth conflicts before bad placements occur": a single device `depth_mm` is checked against a single rack `depth_mm`, it renders a side/depth-profile view, and warns "device exceeds rack depth." **Strength:** depth-aware side profile plus a concrete exceed-depth warning - the closest competitor to spike #2622's goal, and a strong UX precedent. **Limit:** a single scalar rack depth (no per-rail, door, or front/rear-offset modelling); front vs rear mounting offset not represented. (Note: the site is a client-rendered SPA and could not be deep-fetched on 2026-06-26; behaviour corroborated by the search-result description and the project brief.)
- **RackTables** (open-source DCIM/asset management): rack-mountable objects can carry height and depth attributes in the object model, but RackTables is primarily an asset/space database with elevation views rather than a depth-validating visual planner. **Strength:** depth is a first-class stored attribute. **Limit:** little/no visual depth-collision feedback; depth is documentation, not an enforced placement constraint (similar in spirit to NetBox's informational `mounting_depth`).
- **NetBox** (for contrast): `is_full_depth` boolean on the device + informational `mounting_depth` (mm) on the rack; **no per-device mm depth and no depth-vs-rack validation** (Section 1). The dominant tool deliberately stops at categorical depth - so Rackula's mm model would be a differentiator, but cannot be back-filled from NetBox data.

---

## Key Figures Table (seedable mm ranges)

| Category | Min (mm) | Typical (mm) | Max (mm) | Cited anchor |
| --- | --- | --- | --- | --- |
| Server, short-depth / edge 1U | 300 | 370 | 450 | Supermicro SYS-510T-ML = 368 |
| Server, mainstream 1-2U | 600 | 700 | 780 | Dell R740 = 678.8 / 715.5 |
| Server, deep GPU / storage 4U | 700 | 800 | 900 | Supermicro AS-4125GS-TNRT = 737 (>800 unverified) |
| Switch, shallow access | 200 | 280 | 350 | Ubiquiti USW-Pro-48 = 285 |
| Switch, deep PoE / fixed | 450 | 520 | 600 | Cisco Catalyst 9300-M = 449-564 |
| Switch/router, modular chassis | 600 | 750 | 900 | unverified |
| Patch panel | 25 | 45 | 70 | 1U 24-port body ~44-50 |
| PDU, 0U vertical (side-channel) | 40 | 50 | 70 | APC AP8853 = 44 (excluded from U-depth) |
| PDU, horizontal 1U/2U | 60 | 120 | 200 | unverified (varies by outlet count) |
| UPS, rack | 400 | 600 | 750 | APC SMT2200RM2U = 683 |
| Shelf, cantilever | 250 | 350 | 450 | StarTech 254-559 |
| Shelf, full-depth 4-post | 500 | 650 | 750 | StarTech adjustable to ~700 |
| AV amp / processor | 250 | 400 | 560 | QSC GX5 = 257, PL380 ~406 |
| Cabinet outer depth (rack) | 600 | 1000 | 1200 | APC AR3100 = 1070; Tripp Lite 1070/1200 |
| Cabinet usable mounting depth | 450 | 800 | 1016 | StarTech open frame = 1016; outer minus ~150-250 |
| Mini-rack (10") usable depth | 180 | 220 | 300 | DeskPi RackMate = ~200-260 |

Defaults guidance: seed device `depth_mm` per category from "Typical"; if a device's NetBox import says `is_full_depth: true`, bias toward the deeper end. Rear clearance budget ~100-150 mm should be added to device depth (not stored on the device) when checking fit against rack `mounting_depth`.

---

## Sources

NetBox (primary):

- DeviceType model source: https://github.com/netbox-community/netbox/blob/4f4e97f1a67b2f46df9a7ccf8f74a7e28b3f88ce/netbox/dcim/models/devices.py
- Rack / RackType model source: https://github.com/netbox-community/netbox/blob/4f4e97f1a67b2f46df9a7ccf8f74a7e28b3f88ce/netbox/dcim/models/racks.py
- DCIM choices source: https://github.com/netbox-community/netbox/blob/4f4e97f1a67b2f46df9a7ccf8f74a7e28b3f88ce/netbox/dcim/choices.py
- DeviceType docs: https://netboxlabs.com/docs/netbox/models/dcim/devicetype/
- RackType docs: https://netboxlabs.com/docs/netbox/models/dcim/racktype/
- Rack docs: https://netboxlabs.com/docs/netbox/en/stable/models/dcim/rack/
- devicetype-library schema: https://github.com/netbox-community/devicetype-library/blob/master/schema/devicetype.json
- Example device YAML (Dell R740): https://github.com/netbox-community/devicetype-library/blob/master/device-types/Dell/PowerEdge-R740.yaml
- Issue #14176 "Add Depth as Device Property" (closed, not planned): https://github.com/netbox-community/netbox/issues/14176
- Issue #20942 (mounting depth unit selector request): https://github.com/netbox-community/netbox/issues/20942
- Issue #21178 (mounting depth display consistency): https://github.com/netbox-community/netbox/issues/21178

Device datasheets (Section 2):

- Dell PowerEdge R740 dimensions: https://www.dell.com/support/manuals/en-us/poweredge-r740/per740_techspecs_pub/system-dimensions
- Supermicro SYS-510T-ML (short-depth 1U): https://www.supermicro.com/en/products/system/datasheet/SYS-510T-ML
- Supermicro AS-4125GS-TNRT (4U GPU): https://www.supermicro.com/en/products/system/gpu/4u/as-4125gs-tnrt
- Cisco Catalyst 9300-M datasheet: https://documentation.meraki.com/Switching/Cloud_Management_with_IOS_XE/Product_Information/Overviews_and_Datasheets/Catalyst_9300-M_Datasheet
- Ubiquiti UniFi Pro 48 tech specs: https://techspecs.ui.com/unifi/switching/usw-pro-48-poe
- 1U 24-port patch panel (dimensions): https://navepoint.com/navepoint-24-port-cat6-utp-patch-panel-1u-with-keystones-black/
- APC AP8853 0U PDU specs: https://www.se.com/us/en/download/document/990-3439_EN/
- APC Smart-UPS SMT2200RM2U specs: https://www.se.com/us/en/product/SMT2200RM2U/
- StarTech rack shelves (cantilever/adjustable): https://www.startech.com/en-us/server-management/shelf-1u-12-fixed-v
- QSC GX5 power amp: https://www.qscaudio.com/solutions-products/power-amplifiers/portable/2-channel/gx-series/gx5/
- QSC PL380 dimensions: https://www.guitarchalk.com/qsc-pl380-2500-watt-2-channel-power-amp-dimensions/

Cabinets / standards (Section 3):

- APC NetShelter SX AR3100 (1991H x 600W x 1070D): https://www.apc.com/us/en/product/AR3100/
- Tripp Lite SmartRack 42U deep (SR42UBDP, 1200 mm): https://www.cdw.com/product/tripp-lite-42u-rack-enclosure-server-cabinet-doors-sides/2110388
- StarTech 42U 4-post open frame (40"/1016 mm mounting depth): https://www.amazon.com/Tripp-Lite-Equipment-Capacity-SR4POST/dp/B000FAKFNC
- DeskPi RackMate (10" mini-rack, homelab): https://wiki.deskpi.com/rackmate/
- GeeekPi 10" shelf (7.87"/200 mm depth): https://www.amazon.com/GeeekPi-Cabinet-Equipment-RackMate-Rackmount/dp/B0CSCWVTQ7
- EIA-310-D explainer (NavePoint): https://navepoint.com/blog/what-is-eia310d/
- EIA-310 (RackSolutions, depth not standardized): https://www.racksolutions.com/news/data-center-optimization/eia-310-definition/
- Intel Server Rack Cabinet Compatibility Guide (mounting depth not standardized): https://cdrdv2-public.intel.com/840778/server_rack_cabinet_compatibility_guide_24.pdf

Clearance / cabling (Section 4):

- Cable bend radius (copper 4x, fibre 10x/20x): https://www.comms-express.com/infozone/article/bend-radius/
- Minimum bend radius TIA/EIA-568 reference: https://www.elliottelectric.com/StaticPages/ElectricalReferences/DataComm/minimum_bending.aspx
- Rack depth / rear clearance + CMA guide: https://www.serverrackcabinets.com/blogs/recent-blog/how-deep-should-my-server-rack-cabinet-be-a-complete-guide
- Schneider White Paper 44 (blanking panels / airflow): https://www.se.com/us/en/download/document/SPD_SADE-5TPLKQ_EN/

Mounting types (Section 5):

- 2-post vs 4-post (mounting depth, cantilever): https://www.racksolutions.com/news/data-center-trends/how-to-mount-server-2-post-rack/
- What is rack mounting depth: https://www.racksolutions.com/news/blog/what-is-rack-mounting-depth/
- Enconnex 2-post vs 4-post: https://blog.enconnex.com/differences-between-2-post-vs-4-post-racks

Competitors (Section 6):

- rackbuilder.io: https://www.rackbuilder.io/
- RackTables (project + wiki): http://www.racktables.org/ , https://wiki.racktables.org/index.php/FeatureWishlist
