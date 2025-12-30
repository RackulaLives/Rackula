# NetBox Interface and Cable Schema Research

**Research Date:** 2025-12-29
**Purpose:** Spike for adding network interface visualization to Rackula

## Overview

This document summarizes research into NetBox's interface and cable models, device-type YAML format, and API structure to inform the design of network interface visualization in Rackula.

---

## 1. NetBox Interface Model

### 1.1 Core Interface Fields

Interfaces in NetBox represent network interfaces used to exchange data with connected devices. Each interface belongs to either a physical device or virtual machine.

**Key Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | integer | auto | Unique identifier |
| `device` | FK | yes | Parent device reference |
| `module` | FK | no | Installed module within device (optional) |
| `name` | string(64) | yes | Interface name (must be unique per device) |
| `type` | choice | yes | Physical/logical interface type (see section 1.2) |
| `enabled` | boolean | no | Whether interface is enabled |
| `label` | string(64) | no | Alternative label for display |
| `description` | string(200) | no | Free-form description |
| `mgmt_only` | boolean | no | Management-only interface flag (default: false) |
| `mac_address` | string | no | MAC address |
| `mtu` | integer | no | Maximum transmission unit |
| `speed` | integer | no | Interface speed (derived from type) |
| `duplex` | choice | no | Full/half duplex |
| `mode` | choice | no | 802.1Q mode (access/tagged/tagged-all) |
| `untagged_vlan` | FK | no | Native VLAN for interface |
| `tagged_vlans` | M2M | no | Tagged VLANs (for trunk mode) |
| `cable` | FK | no | Connected cable reference |
| `link_peers` | computed | - | Directly connected objects |
| `connected_endpoints` | computed | - | Remote endpoints (through full cable path) |
| `poe_mode` | choice | no | PoE mode: `pd` (powered device) or `pse` (power sourcing) |
| `poe_type` | choice | no | PoE standard (type1/type2/type3/type4/passive) |
| `rf_role` | choice | no | Wireless role (AP or station) |
| `rf_channel` | choice | no | Wireless channel |
| `bridge` | FK | no | Bridge interface reference |
| `lag` | FK | no | Parent LAG interface |

**API Endpoints:**
- List/Create: `GET/POST /api/dcim/interfaces/`
- Detail/Update/Delete: `GET/PATCH/DELETE /api/dcim/interfaces/{id}/`
- Trace cable path: `GET /api/dcim/interfaces/{id}/trace/`

### 1.2 Interface Types

NetBox supports extensive interface types organized by category:

#### Virtual Interfaces
- `virtual` - Virtual
- `bridge` - Bridge
- `lag` - Link Aggregation Group (LAG)

#### FastEthernet (100 Mbps)
- `100base-fx` - 100BASE-FX
- `100base-lfx` - 100BASE-LFX
- `100base-tx` - 100BASE-TX
- `100base-t1` - 100BASE-T1

#### GigabitEthernet Fixed (1 Gbps)
- `1000base-t` - 1000BASE-T (1GE)
- `1000base-tx` - 1000BASE-TX
- `1000base-bx10` - 1000BASE-BX10
- `1000base-cx` - 1000BASE-CX
- `1000base-lx` - 1000BASE-LX
- `1000base-sx` - 1000BASE-SX
- `1000base-zx` - 1000BASE-ZX
- And many others (CWDM, DWDM, EX, LSX variants)

#### GigabitEthernet Modular (1 Gbps)
- `1000base-x-gbic` - GBIC (1GE)
- `1000base-x-sfp` - SFP (1GE)

#### Multi-Gig Ethernet
- `2.5gbase-t` - 2.5GBASE-T (2.5GE)
- `5gbase-t` - 5GBASE-T (5GE)

#### 10 Gigabit Ethernet Fixed
- `10gbase-t` - 10GBASE-T (10GE)
- `10gbase-cx4` - 10GBASE-CX4 (10GE)
- And many variants

#### 10 Gigabit Ethernet Modular
- `10gbase-x-sfpp` - SFP+ (10GE)
- `10gbase-x-xfp` - XFP (10GE)
- `10gbase-x-xenpak` - XENPAK (10GE)
- `10gbase-x-x2` - X2 (10GE)

#### 25 Gigabit Ethernet
- `25gbase-x-sfp28` - SFP28 (25GE)

#### 40 Gigabit Ethernet
- `40gbase-x-qsfpp` - QSFP+ (40GE)

#### 50 Gigabit Ethernet
- `50gbase-x-sfp56` - SFP56 (50GE)
- `50gbase-x-sfp28` - QSFP28 (50GE)

#### 100 Gigabit Ethernet
- `100gbase-x-cfp` - CFP (100GE)
- `100gbase-x-cfp2` - CFP2 (100GE)
- `100gbase-x-cfp4` - CFP4 (100GE)
- `100gbase-x-cxp` - CXP (100GE)
- `100gbase-x-qsfp28` - QSFP28 (100GE)
- `100gbase-x-qsfpdd` - QSFP-DD (100GE)

#### 200 Gigabit Ethernet and Beyond
- `200gbase-x-cfp2` - CFP2 (200GE)
- `200gbase-x-qsfp56` - QSFP56 (200GE)
- `200gbase-x-qsfpdd` - QSFP-DD (200GE)
- `400gbase-x-qsfp112` - QSFP112 (400GE)
- `400gbase-x-qsfpdd` - QSFP-DD (400GE)
- `400gbase-x-osfp` - OSFP (400GE)
- `400gbase-x-osfp-rhs` - OSFP-RHS (400GE)
- `400gbase-x-cdfp` - CDFP (400GE)
- `400gbase-x-cfp8` - CPF8 (400GE)
- `800gbase-x-qsfpdd` - QSFP-DD (800GE)
- `800gbase-x-osfp` - OSFP (800GE)

#### Wireless
- `ieee802.11a` - IEEE 802.11a
- `ieee802.11g` - IEEE 802.11g
- `ieee802.11n` - IEEE 802.11n
- `ieee802.11ac` - IEEE 802.11ac
- `ieee802.11ad` - IEEE 802.11ad
- `ieee802.11ax` - IEEE 802.11ax
- `ieee802.11ay` - IEEE 802.11ay
- `ieee802.11be` - IEEE 802.11be
- `ieee802.15.1` - IEEE 802.15.1 (Bluetooth)
- `ieee802.15.4` - IEEE 802.15.4 (Zigbee, etc.)

#### Other Technologies
- `sonet-oc3` through `sonet-oc768` - SONET/SDH
- `1gfc-sfp` through `128gfc-sfp28` - Fibre Channel
- `infiniband-sdr` through `infiniband-ndr` - InfiniBand
- `serial` - Serial
- `atm` - ATM
- `coaxial` - Coaxial
- `epon` - EPON
- `gpon` - GPON
- `xg-pon` - XG-PON
- `xgs-pon` - XGS-PON
- Various stacking protocols (cisco-stackwise, juniper-vcp, etc.)

**Source:** NetBox source code `dcim/choices.py` - `InterfaceTypeChoices` class

### 1.3 Link Peers vs Connected Endpoints

NetBox provides two computed fields for tracing connections:

- **`link_peers`**: Returns directly connected objects (immediate neighbor via cable)
- **`connected_endpoints`**: Returns remote/final endpoints (follows full cable path through intermediate devices like patch panels)

For simple direct connections (server → switch), both return the same values. The distinction matters for complex paths involving patch panels or circuits.

**Example `link_peers` JSON:**
```json
"link_peers": [
  {
    "id": 1234,
    "url": "https://netbox.example.com/api/dcim/interfaces/1234/",
    "display": "ge-0/0/8",
    "device": {
      "id": 2345,
      "url": "https://netbox.example.com/api/dcim/devices/2345/",
      "display": "switch-01",
      "name": "switch-01"
    },
    "name": "ge-0/0/8",
    "cable": 3456,
    "_occupied": true
  }
]
```

---

## 2. NetBox Cable Model

### 2.1 Cable Properties

All connections between device components are represented using cables. A cable represents a direct physical connection between two sets of endpoints (A and B).

**Core Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | integer | auto | Unique identifier |
| `type` | choice | no | Cable physical medium/classification |
| `status` | choice | yes | Operational status (connected/planned/decommissioning) |
| `label` | string | no | Arbitrary identification label |
| `color` | string | no | Cable color (6-digit hex) |
| `length` | decimal | no | Physical length with unit |
| `length_unit` | choice | no | Unit (m/cm/ft/in) |
| `a_terminations` | array | yes | A-side endpoint(s) |
| `b_terminations` | array | yes | B-side endpoint(s) |
| `tenant` | FK | no | Tenant assignment |
| `description` | string | no | Description |
| `comments` | text | no | Additional notes |

### 2.2 Cable Types

NetBox supports the following cable types:

**Copper:**
- `cat3` - CAT3
- `cat5` - CAT5
- `cat5e` - CAT5e
- `cat6` - CAT6
- `cat6a` - CAT6a
- `cat7` - CAT7
- `cat7a` - CAT7a
- `cat8` - CAT8
- `dac-active` - Direct Attach Copper (Active)
- `dac-passive` - Direct Attach Copper (Passive)
- `mrj21-trunk` - MRJ21 Trunk
- `coaxial` - Coaxial

**Fiber:**
- `mmf` - Multimode Fiber (Generic)
- `mmf-om1` - Multimode Fiber (OM1)
- `mmf-om2` - Multimode Fiber (OM2)
- `mmf-om3` - Multimode Fiber (OM3)
- `mmf-om4` - Multimode Fiber (OM4)
- `mmf-om5` - Multimode Fiber (OM5)
- `smf` - Singlemode Fiber (Generic)
- `smf-os1` - Singlemode Fiber (OS1)
- `smf-os2` - Singlemode Fiber (OS2)

**Other:**
- `aoc` - Active Optical Cabling
- `power` - Power

### 2.3 Cable Terminations

Cables connect via `a_terminations` and `b_terminations` arrays. Each termination specifies:

- `object_type` - Content type of the connected object
- `object_id` - ID of the connected object

**Valid termination object types:**
- `circuits.circuittermination`
- `dcim.consoleport`
- `dcim.consoleserverport`
- `dcim.frontport`
- `dcim.interface`
- `dcim.powerfeed`
- `dcim.poweroutlet`
- `dcim.powerport`
- `dcim.rearport`

**API Example (Creating a Cable):**
```json
{
  "a_terminations": [
    {
      "object_type": "dcim.interface",
      "object_id": 123
    }
  ],
  "b_terminations": [
    {
      "object_type": "dcim.interface",
      "object_id": 456
    }
  ],
  "type": "cat6a",
  "status": "connected",
  "label": "Patch-001",
  "color": "0000ff",
  "length": 2.5,
  "length_unit": "m"
}
```

Either end of a cable may terminate to **multiple objects of the same type** (multi-strand cables).

### 2.4 Cable Tracing

NetBox provides cable path tracing to follow connections through intermediate devices:

**API Endpoint:**
- `GET /api/dcim/interfaces/{id}/trace/`
- `GET /api/dcim/console-ports/{id}/trace/`
- `GET /api/dcim/power-ports/{id}/trace/`

NetBox follows the cable path across directly connected cables. If encountering a pass-through port (front port → rear port) with another cable connected, it continues until reaching a non-pass-through or unconnected termination.

**New in NetBox v4.5.0 (Dec 2025):**
- Cable profiles enable more accurate tracing of specific connections within a cable
- Front/rear port mapping expanded to support bidirectional many-to-many relationships via intermediary `PortMapping` model
- This unlocks modeling of complex inline devices that swap individual fiber pairs

---

## 3. Front Ports and Rear Ports

### 3.1 Purpose

Front and rear ports are **pass-through ports** representing physical cable connections that comprise part of a longer path. Common use case: patch panels.

**Important:** The "front" and "rear" terminology doesn't necessarily correspond to physical device faces—it's used to distinguish between the two components in a pass-through pairing.

### 3.2 Front Port Schema

**Required Fields:**
- `name` (string, max 64 chars)
- `type` (choice - same types as interfaces)
- `rear_port` (string, max 64 chars - references the rear port by name)

**Optional Fields:**
- `label` (string, max 64 chars)
- `color` (6-digit hex)
- `rear_port_position` (integer, min 1 - for multi-position rear ports)
- `description` (string, max 200 chars)

### 3.3 Rear Port Schema

**Required Fields:**
- `name` (string, max 64 chars)
- `type` (choice)

**Optional Fields:**
- `label` (string, max 64 chars)
- `color` (6-digit hex)
- `positions` (integer, min 1 - number of front ports this can map to)
- `description` (string, max 200 chars)

**Example:** An MPO fiber termination cassette might have a single 12-strand rear port mapped to 12 discrete front ports (one per fiber strand). Set `positions: 12` on the rear port.

### 3.4 API Endpoints

Front and rear ports use `/paths` endpoint instead of `/trace`:
- `GET /api/dcim/front-ports/{id}/paths/`
- `GET /api/dcim/rear-ports/{id}/paths/`

Note: You cannot trace from rear port through to front port when one rear port links to multiple front ports—you must select the specific front port first.

---

## 4. Console Ports and Power Ports

### 4.1 Console Ports

Console ports provide connectivity to the physical console of a device for local or remote out-of-band access.

**Console Port Types:**

*Serial:*
- `de-9` - DE-9
- `db-25` - DB-25
- `rj-11` - RJ-11
- `rj-12` - RJ-12
- `rj-45` - RJ-45
- `mini-din-8` - Mini-DIN 8

*USB:*
- `usb-a` - USB Type A
- `usb-b` - USB Type B
- `usb-c` - USB Type C
- `usb-mini-a` - USB Mini A
- `usb-mini-b` - USB Mini B
- `usb-micro-a` - USB Micro A
- `usb-micro-b` - USB Micro B
- `usb-micro-ab` - USB Micro AB

*Other:*
- `other` - Other

**Schema:**
- Required: `name`, `type`
- Optional: `label`, `description`, `_is_power_source`

### 4.2 Power Ports

Power ports represent physical power inlets on devices.

**Power Port Types (abbreviated list):**

*IEC 60320:*
- `iec-60320-c6` through `iec-60320-c22`

*IEC 60309:*
- `iec-60309-p-n-e-4h`, `iec-60309-p-n-e-6h`, `iec-60309-p-n-e-9h`
- `iec-60309-2p-e-4h` through `iec-60309-3p-n-e-9h`

*NEMA (Non-locking):*
- `nema-1-15p` through `nema-18-30p`

*NEMA (Locking):*
- `nema-l1-15p` through `nema-l22-30p`

*Regional:*
- `cs6361c`, `cs6365c`, `cs8165c`, `cs8265c`, `cs8365c`, `cs8465c` (California Style)
- `ita-c`, `ita-e`, `ita-f`, `ita-ef`, `ita-g`, `ita-h`, `ita-i`, `ita-j`, `ita-k`, `ita-l`, `ita-m`, `ita-n`, `ita-o` (International/ITA)

*DC/Other:*
- `usb-a`, `usb-b`, `usb-c`, `usb-mini-a`, `usb-mini-b`, `usb-micro-a`, `usb-micro-b`
- `molex-micro-fit-1x2`, `molex-micro-fit-2x2`, `molex-micro-fit-2x4`
- `dc-terminal`
- `saf-d-grid`
- `neutrik-powercon-20`, `neutrik-powercon-32`, `neutrik-powercon-true1`, `neutrik-powercon-true1-top`
- `ubiquiti-smartpower`
- `hardwired`
- `other`

**Schema:**
- Required: `name`, `type`
- Optional: `label`, `maximum_draw`, `allocated_draw`, `description`

---

## 5. Device Type YAML Format

### 5.1 Repository

NetBox device type definitions are maintained in the **netbox-community/devicetype-library** repository:
- https://github.com/netbox-community/devicetype-library

Organized by manufacturer with YAML files for each device model.

### 5.2 Required Device Type Fields

- `manufacturer` - Manufacturer name
- `model` - Model designation
- `slug` - URL-friendly unique identifier (format: `{manufacturer}-{model}`)

### 5.3 Optional Device Type Fields

- `u_height` - Rack units (supports 0.5U increments, default: 1)
- `is_full_depth` - Boolean for front+rear consumption (default: true)
- `part_number` - Manufacturer part number
- `comments` - Notes
- `weight` - Physical weight
- `weight_unit` - Unit (kg/g/lb/oz)

### 5.4 Interface Definition in YAML

**Example from Cisco C9300-48P:**

```yaml
interfaces:
  - name: GigabitEthernet1/0/1
    type: 1000base-t
    poe_mode: pse
    poe_type: type2-ieee802.3at
  - name: GigabitEthernet1/0/2
    type: 1000base-t
    poe_mode: pse
    poe_type: type2-ieee802.3at
  # ... 48 ports total
  - name: StackWise1
    type: cisco-stackwise
  - name: StackWise2
    type: cisco-stackwise
  - name: GigabitEthernet0/0
    type: 1000base-t
    mgmt_only: true

console-ports:
  - name: Console
    type: rj-45
  - name: USB Console
    type: usb-mini-b

power-ports:
  - name: PS1
    type: iec-60320-c14
```

**Interface Fields in YAML:**
- `name` (required) - Interface identifier
- `type` (required) - Interface type from NetBox choices
- `label` (optional) - Alternative display label
- `enabled` (optional) - Default enabled state
- `mgmt_only` (optional) - Management interface flag (default: false)
- `description` (optional) - Description
- `bridge` (optional) - Bridge interface name
- `poe_mode` (optional) - `pd` or `pse`
- `poe_type` (optional) - PoE standard
- `rf_role` (optional) - Wireless role (ap/station)

### 5.5 Component Arrays

Device type YAML files support these component arrays:
- `console-ports`
- `console-server-ports`
- `power-ports`
- `power-outlets`
- `interfaces`
- `front-ports`
- `rear-ports`
- `module-bays`
- `device-bays`
- `inventory-items`

### 5.6 Validation

All YAML files are validated against JSON schemas:
- `schema/devicetype.json` - Device type root schema
- `schema/components.json` - Component definitions
- `schema/generated_schema.json` - Auto-generated from NetBox

Validation ensures:
- YAML syntax and UTF-8 encoding
- Schema compliance (Draft202012Validator)
- Slug uniqueness
- Component validity
- Image validity

### 5.7 Import Automation

NetBox Community provides a Python import script:
- https://github.com/netbox-community/Device-Type-Library-Import

Features:
- Duplicate detection
- Selective vendor import
- Batch processing

---

## 6. Key Insights for Rackula

### 6.1 Data Model Alignment

Rackula should align with NetBox's interface model for compatibility:

1. **Interface naming convention:** Allow freeform names (GigabitEthernet1/0/1, eth0, etc.)
2. **Interface types:** Support a subset of common types initially (1000base-t, 10gbase-x-sfpp, etc.)
3. **Management interfaces:** Flag with `mgmt_only: true`
4. **Position/ordering:** Not explicitly defined in NetBox—ordering is implicit from device type definition order

### 6.2 Cable Connections

For network topology visualization:

1. **Simple connections:** Use `link_peers` for direct device-to-device connections
2. **Cable metadata:** Store type, color, label, length for visual representation
3. **Multi-rack connections:** NetBox cables can span devices across different racks
4. **Validation:** Enforce NetBox's connection rules (interface → interface, interface → circuit termination, etc.)

### 6.3 Front/Rear Port Positioning

NetBox's front/rear port model suggests:

1. **Positioning is visual concept:** Not core to NetBox's data model
2. **Port names imply position:** Convention is port names like "Rear1", "Front1", etc.
3. **For Rackula:** Consider adding `position` field (front/rear/left/right/top/bottom) to interface definitions for visual rendering

### 6.4 PoE and Wireless

NetBox tracks:
- **PoE capability:** `poe_mode` (pd/pse) and `poe_type` (standards)
- **Wireless:** `rf_role` and `rf_channel`

Rackula could use these for visual indicators (PoE icon, wireless icon).

### 6.5 Schema Evolution

NetBox v4.5.0 (Dec 2025) introduced:
- Cable profiles for more accurate tracing
- Bidirectional front/rear port mappings

Rackula should design with extensibility in mind to accommodate future NetBox schema changes.

---

## 7. Sources

### NetBox Official Documentation
- [Interfaces | NetBox Documentation](https://netboxlabs.com/docs/netbox/models/dcim/interface/)
- [Cables | NetBox Documentation](https://netboxlabs.com/docs/netbox/models/dcim/cable/)
- [Front Ports | NetBox Documentation](https://netboxlabs.com/docs/netbox/models/dcim/frontport/)
- [Rear Ports | NetBox Documentation](https://netboxlabs.com/docs/netbox/models/dcim/rearport/)
- [Devices & Cabling | NetBox Documentation](https://netboxlabs.com/docs/netbox/features/devices-cabling/)
- [REST API Overview | NetBox Documentation](https://netboxlabs.com/docs/netbox/integrations/rest-api/)

### NetBox Community Resources
- [netbox-community/devicetype-library](https://github.com/netbox-community/devicetype-library)
- [netbox-community/netbox](https://github.com/netbox-community/netbox)
- [NetBox Demo API](https://demo.netbox.dev/api/schema/swagger-ui/)

### NetBox API and Schema
- [Cable Terminations API Discussion #10388](https://github.com/netbox-community/netbox/discussions/10388)
- [Creating Cables with API Discussion #16950](https://github.com/netbox-community/netbox/discussions/16950)
- [link_peers vs connected_endpoints Discussion #16855](https://github.com/netbox-community/netbox/discussions/16855)
- [Cable Tracing Performance Issue #18409](https://github.com/netbox-community/netbox/issues/18409)

### NetBox Recent Changes
- [Release v4.5.0-beta1](https://github.com/netbox-community/netbox/releases/tag/v4.5.0-beta1)
- [Record A & B terminations on cable changelog PR #20246](https://github.com/netbox-community/netbox/pull/20246)

### DeviceType Library
- [devicetype-library README](https://github.com/netbox-community/devicetype-library/blob/master/README.md)
- [devicetype-library Schema Documentation](https://deepwiki.com/netbox-community/devicetype-library/3-device-type-library)

### Community Discussions
- [Ethernet interface type equivalents Discussion #13696](https://github.com/netbox-community/netbox/discussions/13696)
- [Interface Type Question Discussion #12413](https://github.com/netbox-community/netbox/discussions/12413)
- [Modeling Pluggable Transceivers Best Practice](https://netboxlabs.com/docs/netbox/best-practices/modeling-pluggable-transceivers/)
- [SFP modules handling Discussion #5722](https://github.com/netbox-community/netbox/discussions/5722)

---

## 8. Recommendations for Rackula

Based on this research, here are recommendations for implementing network interface visualization in Rackula:

### 8.1 Minimal Viable Schema

Add to existing `DeviceType`:

```typescript
interface DeviceType {
  // ... existing fields
  interfaces?: InterfaceTemplate[];
}

interface InterfaceTemplate {
  name: string;                    // Required: e.g., "eth0", "GigabitEthernet1/0/1"
  type: InterfaceType;             // Required: subset of NetBox types
  label?: string;                  // Optional display label
  mgmt_only?: boolean;             // Management interface flag
  position?: PortPosition;         // Rackula extension for visual layout
  poe_mode?: 'pd' | 'pse';        // PoE capability
  poe_type?: PoEType;             // PoE standard
}

type PortPosition = 'front' | 'rear' | 'left' | 'right' | 'top' | 'bottom';

type InterfaceType =
  | '1000base-t'          // Common 1GbE RJ45
  | '10gbase-t'           // 10GbE RJ45
  | '10gbase-x-sfpp'      // 10GbE SFP+
  | '25gbase-x-sfp28'     // 25GbE SFP28
  | '40gbase-x-qsfpp'     // 40GbE QSFP+
  | '100gbase-x-qsfp28'   // 100GbE QSFP28
  // Expand as needed
  ;

type PoEType =
  | 'type1-ieee802.3af'   // 15.4W
  | 'type2-ieee802.3at'   // 30W
  | 'type3-ieee802.3bt'   // 60W
  | 'type4-ieee802.3bt'   // 100W
  | 'passive-24v'
  | 'passive-48v'
  ;
```

### 8.2 Connection Model (Future)

For representing cables between devices:

```typescript
interface Cable {
  id: string;
  a_device_id: string;
  a_interface_name: string;
  b_device_id: string;
  b_interface_name: string;
  type?: CableType;
  color?: string;         // 6-digit hex
  label?: string;
  length?: number;
  length_unit?: 'm' | 'cm' | 'ft' | 'in';
}

type CableType = 'cat5e' | 'cat6' | 'cat6a' | 'dac-passive' | 'mmf' | 'smf' | 'aoc';
```

### 8.3 Visualization Priorities

1. **Phase 1 (Current Spike):**
   - Define interface schema in device types
   - Render interface indicators on device front/rear
   - Support basic positioning (front/rear)

2. **Phase 2:**
   - Cable connections between devices in same rack
   - Color-coded cables by type
   - Hover to show cable details

3. **Phase 3:**
   - Multi-rack cable visualization
   - Cable path tracing (for patch panels)
   - Import/export NetBox-compatible interface data

### 8.4 NetBox Compatibility Strategy

- Use NetBox field names (`name`, `type`, `mgmt_only`, `poe_mode`, `poe_type`)
- Support import from NetBox device-type YAML
- Export to NetBox-compatible format
- Add Rackula-specific fields with clear prefix (e.g., `_rackula_position`)

### 8.5 Testing Considerations

- Validate against real NetBox device-type YAML files
- Test with devices having 48+ interfaces
- Test management-only interfaces
- Test PoE indicators
- Test different interface types (RJ45, SFP, QSFP)

---

**End of Research Document**
