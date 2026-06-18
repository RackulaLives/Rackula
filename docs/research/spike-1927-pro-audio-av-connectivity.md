# Spike #1927: Pro Audio and AV Connectivity Modeling

**Date:** 2026-06-05 **Parent Epics:** #71 (Network Interface Visualization and Connectivity), #362 (Connection Graph Model)

---

## Executive Summary

Rackula's current connectivity model is designed for networking (symmetric, bidirectional Ethernet ports) and cannot represent pro audio/AV gear. The model needs three critical additions to support AV: **port direction** (input/output/bidirectional), **signal type** (separate from connector type), and **AV connector types** in the InterfaceType enum. The research recommends **Approach A: Minimal Enrichment** - extending the existing model with new fields and enum values rather than introducing new top-level concepts like `InfrastructureNode` or `InternalConnection`. Patch bay normalling should use a dedicated `PatchBayNormal` component, not the proposed `InternalConnection`. Matrix switcher routing is deferred to Phase 2.

---

## Technical Findings

### Current State

| Component | Status | AV Gap |
| --- | --- | --- |
| `InterfaceType` | 25 values, network-only | No HDMI, XLR, SDI, BNC, Speakon, etc. |
| `InterfaceTemplate` | name, type, label, mgmt*only, position, poe*\* | No `direction`, no `signal_type`, no `gender` |
| `PlacedPort` | id, template_name, template_index, type, label | No `direction`, no `signal_type`, no `gender` |
| `Connection` | a_port_id, b_port_id, label, color | No `cable_type`, no signal direction |
| `Cable` (deprecated) | device+interface references, type, length, status | Still in codebase, needs removal |
| `PortCategory` | "network", "power", "console" | No "av" category |
| Cable store | Full CRUD for deprecated model | No Connection store exists |
| Port rendering | PortIndicators + PortTooltip | No direction indicators, no AV colours |
| AV devices | 8 starter devices, Blackmagic brand pack | Zero interface templates defined |

### Key Discovery: Signal Type and Connector Type Are Independent

The same physical connector carries different signal types:

| Connector | Signal Type 1 | Signal Type 2 | Signal Type 3 |
| --- | --- | --- | --- |
| XLR-3 | Mic level (analog) | Line level (analog) | AES3 (digital) |
| RJ45 | Ethernet | Dante (audio over IP) | DMX-over-Art-Net |
| BNC | SDI (video) | Word clock (sync) | AES3id (digital audio) |
| 1/4" TRS | Balanced line | Headphones | Insert send/return |

This means **`InterfaceType` alone cannot capture both dimensions.** A new `signal_type` field is required.

### Key Discovery: Direction Is Derived from Ports, Not from Connections

Physical cables are directionless; signal flow is determined by port direction. An HDMI cable connects an output port to an input port. The cable itself doesn't have direction. This means:

- **The symmetric `a_port_id`/`b_port_id` Connection model is correct** for representing physical cables
- **Signal flow direction is computed**, not stored: output port → input port
- **Connection validation** uses port direction: warn if both ports are outputs or both are inputs

### Key Discovery: NetBox Explicitly Declined AV Connector Types

NetBox issues #14597 and #11915 requested SDI and broadcast interface types. NetBox maintainers declined, directing users to Front Port / Rear Port types instead. This means Rackula's AV types will be Rackula-specific, not aligned with NetBox's interface type vocabulary. However, NetBox's Front Port / Rear Port concept is relevant for patch bays.

---

## External Research

### Pro Audio Connector Taxonomy

**Essential (Phase 1 - 20 types):**

| Type | Connectors | Signal Types | Direction |
| --- | --- | --- | --- |
| xlr-3 | XLR 3-pin | Mic, line, AES3 | Directional (input/output) |
| xlr-5 | XLR 5-pin | DMX, stereo audio | Directional |
| trs-1-4 | 1/4" TRS | Balanced line, headphones | Directional or bidirectional |
| ts-1-4 | 1/4" TS | Unbalanced instrument | Directional |
| rca | RCA/Phono | Consumer line, S/PDIF | Directional |
| speakon | Speakon NL2/4/8 | Speaker level | Directional (output→input) |
| adat-optical | TOSLINK | ADAT 8ch digital | Directional |
| db25-audio | DB25 TASCAM | Analog 8-channel | Directional |
| phoenix | Phoenix/Euroblock | Analog audio terminal | Directional |
| hdmi | HDMI Type A/C | Digital video+audio | Directional |
| displayport | DisplayPort | Digital video+audio | Directional |
| bnc | BNC | SDI, word clock, AES3id | Directional |
| sdi-bnc | BNC (75 ohm) | HD-SDI, 3G-SDI, 12G-SDI | Directional |
| vga | DE-15 | Analog video | Directional (output→input) |
| midi-din | 5-pin DIN | MIDI | Directional |
| dmx-xlr | XLR 3/5-pin | DMX512 | Directional |
| rs-232 | DE-9 | Serial control | Directional |
| rs-422 | DE-9 | Serial control | Directional |

### Signal Type Taxonomy (Phase 1)

| Signal Type | Description | Typical Connectors |
| --- | --- | --- |
| analog-audio-mic | Microphone level | XLR-3, TRS |
| analog-audio-line | Line level (+4 dBu pro / -10 dBV consumer) | XLR-3, TRS, RCA |
| analog-audio-instrument | Instrument level (high-Z) | TS, TRS |
| analog-audio-speaker | Speaker level (high voltage/amperage) | Speakon, binding post |
| digital-audio-aes3 | AES/EBU digital audio | XLR-3, BNC |
| digital-audio-adat | ADAT optical digital audio | TOSLINK |
| digital-audio-dante | Dante audio over IP | RJ45 |
| digital-audio-avb | AVB audio over IP | RJ45 |
| digital-audio-madi | MADI multichannel audio | BNC, RJ45, fiber |
| digital-video-hdmi | HDMI digital video+audio | HDMI |
| digital-video-displayport | DisplayPort digital video+audio | DisplayPort |
| digital-video-sdi | Serial digital interface | BNC |
| analog-video | VGA/component analog video | DE-15, BNC, RCA |
| clock-word | Word clock sync | BNC |
| clock-genlock | Genlock sync | BNC |
| control-midi | MIDI control protocol | 5-pin DIN |
| control-dmx | DMX512 lighting control | XLR-3/5 |
| control-serial | Serial control (RS-232, RS-422) | DE-9 |
| data-ethernet | Ethernet data | RJ45 |
| data-usb | USB data | USB-A/B/C |
| power-ac | AC power | IEC, NEMA |
| power-dc | DC power | Barrel, Phoenix |

### Patch Bay Normalling

Patch bays have three normalling modes that determine default signal routing:

| Mode | Behaviour | When Cable Inserted (Top) | When Cable Inserted (Bottom) |
| --- | --- | --- | --- |
| Full-normal | Default path active | Signal breaks; bottom jack gets no signal | Signal breaks; top jack sends no signal |
| Half-normal | Default path active with sniffing | Signal continues; bottom jack gets signal (mult) | Signal breaks |
| Non-normal | No default path | No effect (no default to break) | No effect |

**Recommendation:** Model as `PatchBayNormal` on DeviceType, not as `InternalConnection`. Normalling is a port-pair property of the device type, not a connection between devices.

### Matrix Switcher Routing

Matrix switchers (video routers, audio mixers) have N×M internal crosspoints. The recommended model:

- **Phase 1:** Define I/O ports as regular `InterfaceTemplate` entries with direction. External connections (sources→inputs, outputs→destinations) use the existing `Connection` model. Internal routing is not modeled.
- **Phase 2:** Add `RoutingConfig` to Layout for per-instance routing tables:
  ```typescript
  interface RoutingConfig {
    id: string;
    device_id: string;
    routes: Record<string, string | null>; // output_name → input_name
  }
  ```

---

## Recommendations

### Approach A: Minimal Enrichment (Recommended)

Extend the existing model with new fields and enum values. No new top-level data models in Phase 1.

**Phase 1 Changes:**

| Change | Files Affected | Priority |
| --- | --- | --- |
| Add 20 AV types to `InterfaceType` | types/index.ts, schemas/index.ts | P0 |
| Add `SignalType` enum (~20 values) | types/index.ts, schemas/index.ts | P0 |
| Add `signal_type` field to InterfaceTemplate + PlacedPort | types/index.ts, schemas/index.ts, port-utils.ts | P0 |
| Add `PortDirection` enum (input/output/bidirectional) | types/index.ts, schemas/index.ts | P0 |
| Add `direction` field to InterfaceTemplate + PlacedPort | types/index.ts, schemas/index.ts, port-utils.ts | P0 |
| Add `gender` optional field to InterfaceTemplate + PlacedPort | types/index.ts, schemas/index.ts | P1 |
| Add AV cable types to `CableType` | types/index.ts, schemas/index.ts | P1 |
| Add `cable_type` field to `Connection` | types/index.ts, schemas/index.ts | P1 |
| Add `PatchBayNormal` component to `DeviceType` | types/index.ts, schemas/index.ts | P2 |
| Add "av" to `PortCategory` | port-utils.ts | P0 |
| Update PortIndicators with AV colours + direction | PortIndicators.svelte | P0 |
| Add AV devices with interfaces to starter library | starterLibrary.ts | P1 |
| Add AV devices with interfaces to Blackmagic brand pack | brandPacks/blackmagicdesign.ts | P1 |
| Update SCHEMA.md documentation | docs/reference/SCHEMA.md | P1 |

**Phase 2 Deferred Items:**

- `RoutingConfig` for matrix switcher routing
- `PatchBayNormal` rendering (visual default paths)
- Signal type compatibility validation (warn on mic→line)
- `SignalLevelSchema` for level mismatch warnings
- Front-to-rear port tracing

**Phase 3 Deferred Items:**

- `InternalConnection` for device internals
- Breakaway routing (separate audio/video per output)
- Salvo presets
- Signal flow diagram view
- Dante/AES67 stream mapping

### Why Not Approach B (Full Signal Chain)

1. The `Connection` model is explicitly "MVP" - building `InfrastructureNode` and `InternalConnection` on top of an unvalidated foundation is premature
2. AV users need ports and direction first - they can't even define devices correctly without these
3. `InternalConnection` is the wrong abstraction for patch bay normalling (it's a port-pair property, not a connection)
4. `InfrastructureNode` is needed for external/non-rack gear, but patch panels and DI boxes can be represented as regular `DeviceType` entries for Phase 1
5. Higher risk of design mistakes when building 3 new top-level concepts simultaneously

---

## Devil's Advocate Review (Live Audio Engineer Persona)

Adopting the perspective of a senior live audio engineer who builds rack plans for technicians (the target user from discussion #1529).

### Finding 1: signal_type should be optional with smart defaults, not required

**Problem:** Requiring `signal_type` on every AV port means device authors make TWO taxonomy choices per port (type + signal_type). For a Blackmagic ATEM with 12 SDI ports, every port needs both `sdi-bnc` AND `digital-video-sdi`. The signal type is obvious from context.

**Recommendation:** Make `signal_type` optional. Add `inferSignalType(type, direction)` utility that derives signal type from InterfaceType + direction. Only require manual `signal_type` entry for genuinely ambiguous ports (RJ45 carrying Dante vs Ethernet, XLR carrying mic vs line vs AES3).

### Finding 2: direction needs smart defaults, not just "bidirectional"

**Problem:** Console ports should default to `input`, not `bidirectional`. Management ports are `input`. USB-C can be `bidirectional`. A blanket default loses important semantics.

**Recommendation:** Add `inferDirection(type, mgmtOnly)` utility:

- `mgmt_only: true` → `input`
- `console`, `serial` types → `input`
- All AV types → require explicit direction (no default)
- Everything else → `bidirectional`

### Finding 3: PatchBayNormal must support per-instance override

**Problem:** Professional patch bays (Switchcraft, Neutrik) have configurable normalling per channel. Theatre installs specify "channels 1-24 half-normalled, 25-48 non-normalled." DeviceType normalling is the same for every instance.

**Recommendation:** `PatchBayNormal` on DeviceType provides defaults, with per-instance override on PlacedDevice. Same pattern as `direction` on PlacedPort overriding InterfaceTemplate.

### Finding 4: Connections need directional arrows in rendering

**Problem:** The spike discusses data model but not visual rendering. Live audio techs need to see signal flow direction at a glance. A symmetric `a_port_id`/`b_port_id` Connection has no inherent direction - the rendering must compute it from port direction.

**Recommendation:** Connection rendering should show directional arrows when both connected ports have explicit direction (output → input). Bidirectional connections render as plain lines. This is a UI specification, not a data model change, but must be documented.

### Finding 5: Minimal ExternalEndpoint is needed in Phase 1, not full InfrastructureNode

**Problem:** Live audio rack plans connect to wall plates, stage boxes, ceiling speakers, and projectors - things that aren't in the rack and don't have U height. The current DeviceType requires `u_height` and a rack position. Issue #267 (external connections) addresses this but is deferred.

**Recommendation:** Add a minimal `ExternalEndpoint` concept for Phase 1:

```typescript
interface ExternalEndpoint {
  id: string;
  name: string; // "Ballroom Wall Plate"
  location?: string; // "Ballroom, stage left"
  ports: PlacedPort[]; // Same port model as devices
}
```

This is not the full `InfrastructureNode` from #362 - it's just a connection endpoint that lives outside the rack. Connections reference its ports the same way they reference device ports.

### Finding 6: gender should be auto-derived, not manually specified

**Problem:** Adding `gender` as a third taxonomy choice per port (type + signal_type + gender) creates friction. For XLR, the convention is strong: output = male, input = female.

**Recommendation:** Auto-derive gender from InterfaceType + direction for connectors with strong conventions (XLR, Speakon). Only show gender field for ambiguous connectors (TRS, TS, RCA).

### Finding 7: Phase structure should pair data model changes with visible output

**Problem:** Discussion #1529 shows a live audio tech who wants to draw rack plans. Schema changes without visual output are invisible work. The live audio user sees zero benefit until connections are rendered.

**Recommendation:** Pair each schema change with a visible UI change:

- AV InterfaceType values → AV port colours in PortIndicators
- `direction` field → direction indicators on ports
- `signal_type` field → signal type in PortTooltip
- Ship #250 (PortIndicators integration) in the same phase as data model changes

### Finding 8: Patch list export is the real deliverable for live audio

**Problem:** The spike focuses on data model and visualization, but the live audio tech's actual deliverable is a patch list for load-in. A rack plan without a patch list is decorative.

**Recommendation:** Add patch list export (CSV/printable) to Phase 2. This is the output the discussion #1529 user actually needs.

---

## Devil's Advocate Review Decisions

A second-pass review from senior AV engineer and security-conscious Svelte 5 architect perspectives, with decisions recorded.

### Decisions

| # | Recommendation | Decision | Rationale |
| --- | --- | --- | --- |
| 1 | Drop `gender` from data model | **Compute only** | Auto-derived from connector type + direction (AES14: XLR male = output). Zero storage, zero migration, zero drift. Override only for ambiguous connectors via `deriveGender()` utility function. |
| 2 | Defer `cable_type` on Connection | **P2** | Connections don't exist yet (#369, #1931). Cable type is inferable from ports. Only store when users need overrides (e.g., "50ft active optical HDMI"). |
| 3 | Downgrade 20 AV InterfaceType values from P0 | **Split P0** | True P0 = PortDirection + SignalType enums + inference utilities (changes rendering). InterfaceType additions = P1 (device library data entry, not schema work). |
| 4 | Remove signal compatibility matrix from all phases | **Removed** | Connection validation cannot exist until connection _creation_ exists (#1932 hasn't landed). Designing validation before the canvas can draw cables is premature. Add back when connections are renderable. |
| 5 | Make inference utilities P0 deliverables | **P0** | `inferDirection(type, mgmtOnly)` and `inferSignalType(type, direction)` ARE the product. Without them, every port needs 2-3 manual taxonomy decisions. Ship with enum additions. |
| 6 | Block ExternalEndpoint on rendering spec | **Blocked** | Current canvas has no concept of off-rack elements. Must decide UI placement (sidebar panel, floating canvas nodes, or connection endpoint labels) before adding to schema. |
| 7 | Direction arrow rendering spec | **Spec defined** | SVG path markers on connection lines. Output→input arrow direction. Bidirectional = no arrow (plain line). Mixed (one port has direction, other is bidirectional) = single arrow from output side. Use existing connection colours from tokens.css. |
| 8 | SignalType size for Phase 1 | **10 values** | ethernet, power-ac, analog-audio-mic, analog-audio-line, analog-audio-speaker, digital-audio-aes3, digital-video-hdmi, digital-video-sdi, control-midi, data-usb. Everything else is data-ethernet or waits for demand. |
| 9 | PatchBayNormal data shape | **Port-pair array** | Array of `{ top_port_id, bottom_port_id, mode }` on PlacedDevice. A 48-channel patch bay can have channels 1-24 half-normalled and 25-48 non-normalled. Normalling lives between port pairs, not on the device. |
| 10 | RoutingConfig simplicity | **Simple map only** | `{ deviceId, routes: Map<outputPortId, inputPortId \| null> }` for P2. No breakaway, no salvos, no multiview. Those are P3+. |
| 11 | Zod max-length + UUID keys | **Yes** | All new user-provided string fields get `z.string().max(256)`. RoutingConfig route keys are UUIDs (not port names) to prevent prototype pollution. |
| 12 | NetBox sync security note | **Skip** | Too early to spec auth for a feature that doesn't exist yet. Current API auth (issue #1117) covers the pattern. |

---

## Revised Phase Structure (Post Review)

### Phase 0: Enums + Inference + Visible Output

Schema changes that change how ports render. Each change paired with visible UI output.

| Change | Visible Counterpart | Issue |
| --- | --- | --- |
| `PortDirection` enum (input/output/bidirectional) | Direction indicators on port circles | #1930 |
| `direction` field on InterfaceTemplate + PlacedPort | Direction indicators on port circles | #1930 |
| `inferDirection(type, mgmtOnly)` utility | Smart defaults in device editor | #1930 |
| `SignalType` enum (10 values) | Signal type in PortTooltip | #1929 |
| `signal_type` optional field on InterfaceTemplate + PlacedPort | Signal type in PortTooltip | #1929 |
| `inferSignalType(type, direction)` utility | Smart defaults in device editor | #1929 |
| "av" `PortCategory` | AV category colour in rack | #1929 |
| Remove deprecated Cable model | Clean up Cable store references | #369 |
| Ship #250 (PortIndicators integration) | Ports visible on devices | #250 |

### Phase 1: AV Types + Connection Rendering

Device library work and connection creation. Depends on P0 enums landing first.

| Change | Visible Counterpart | Issue |
| --- | --- | --- |
| 20 AV InterfaceType values | AV port colours in PortIndicators | #1929 |
| AV device types with interfaces | AV devices show ports in library | #1929 |
| Connection store with validation | Create/delete connections | #369 |
| ConnectionLayer + ConnectionPath | Lines between devices | #1931 |
| Direction arrows on connections (SVG path markers, output→input, bidirectional = no arrow) | Signal flow visible | #1931 |
| Connection creation (desktop) | Click port A → click port B | #1932 |
| Cascade delete connections on device removal | Clean deletion UX | #639 |

### Phase 2: Patch Bays + Cable Types

AV-specific features that need working connections first.

| Change | Visible Counterpart | Issue |
| --- | --- | --- |
| `PatchBayNormal` (port-pair array on PlacedDevice) | Default paths on patch bays | TBD |
| `cable_type` on Connection (optional, inferable) | Cable type label on connections | TBD |
| `RoutingConfig` (simple map: deviceId + routes) | Matrix routing table UI | TBD |
| `ExternalEndpoint` (after rendering spec) | Off-rack endpoints in UI | TBD |
| Patch list export (CSV) | Printable patch list for load-in | TBD |

### Phase 3: Validation + Advanced Connectivity

Signal compatibility, breakaway routing, full infrastructure nodes.

| Change | Visible Counterpart | Issue |
| --- | --- | --- |
| Signal type compatibility warnings | Red highlight on incompatible connections | TBD |
| `gender` (computed via `deriveGender()`, not stored) | Male/female indicators on ports | TBD |
| Breakaway routing, salvos, multiview | Advanced matrix routing UI | TBD |
| `InfrastructureNode` (full) | Non-rack infrastructure on canvas | TBD |
| `InternalConnection` (front-to-rear) | Front-to-rear tracing | TBD |
| Signal flow diagram view | Left-to-right signal flow | TBD |

---

## Resolved Open Questions

1. **Should `signal_type` be required or optional?** **Resolved: Optional with smart defaults.** Add `inferSignalType(type, direction)` utility as P0 code deliverable. Only require manual entry for ambiguous cases (XLR, BNC, RJ45).

2. **Should `direction` default to `bidirectional`?** **Resolved: Smart defaults via `inferDirection(type, mgmtOnly)` as P0 code deliverable.** Management ports → input, console → input, AV types → require explicit, everything else → bidirectional.

3. **Should `PatchBayNormal` be on DeviceType or PlacedDevice?** **Resolved: Port-pair array on PlacedDevice.** Array of `{ top_port_id, bottom_port_id, mode }` per channel pair. Allows per-channel normalling (channels 1-24 half-normalled, 25-48 non-normalled). DeviceType defines which port pairs exist; PlacedDevice defines how they're normalled.

4. **How many signal types for Phase 1?** **Resolved: 10 values.** ethernet, power-ac, analog-audio-mic, analog-audio-line, analog-audio-speaker, digital-audio-aes3, digital-video-hdmi, digital-video-sdi, control-midi, data-usb. Taxonomy grows on demand.

5. **InterfaceType vs SignalType separation?** **Resolved: Defer.** Extend InterfaceType with AV connectors (P1), add signal_type as a peer field (P0). ConnectorType + SignalType separation is a Phase 2+ consideration.

6. **ExternalEndpoint vs InfrastructureNode?** **Resolved: Blocked on rendering spec.** Must decide how off-rack endpoints appear in the UI (sidebar panel, floating canvas nodes, or connection endpoint labels) before adding to schema. Full InfrastructureNode deferred to Phase 3.

7. **Should `gender` be stored or computed?** **Resolved: Computed only.** `deriveGender(connectorType, direction)` utility function. No storage, no migration, no drift. Override only for ambiguous connectors (TRS, RCA).

8. **When should `cable_type` be added?** **Resolved: P2.** Defer until connections exist (#369, #1931). Cable type is inferable from ports. Only store when users need overrides.

9. **Should signal compatibility matrix be in Phase 3?** **Resolved: Removed from all phases.** Add back when connection creation (#1932) and rendering (#1931) land. Validation without a canvas is academic.

10. **RoutingConfig complexity?** **Resolved: Simple map only for P2.** `{ deviceId, routes: Map<outputPortId, inputPortId | null> }`. Breakaway routing, salvos, and multiview are P3+.

11. **Security constraints on new schemas?** **Resolved: Zod max-length + UUID keys.** All user-provided string fields get `z.string().max(256)`. RoutingConfig route keys are UUIDs only (not port names) to prevent prototype pollution.

12. **NetBox sync security?** **Resolved: Too early to spec.** Current API auth (issue #1117) covers the pattern. Add specific notes when NetBox sync scope is defined.

13. **Direction arrow rendering?** **Resolved: SVG path markers on connection lines.** Output→input flow. Bidirectional = plain line (no arrow). Mixed direction (one port directional, other bidirectional) = single arrow from output side. Use existing connection colours from tokens.css.
