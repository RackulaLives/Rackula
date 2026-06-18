# Research Spike #1927: Pro Audio and AV Connectivity Modeling

**Date:** 2026-06-05 **Status:** Complete

---

## Industry Practices

How the pro audio and AV industry models connectivity:

**Signal flow follows a left-to-right convention.** Sources (inputs) on the left, processing/switching in the middle, destinations (outputs) on the right. This is the universal convention in AVIXA documentation, signal flow diagrams, and tools like QLab, Dante Controller, and EasySchematic.

**Connections are port-to-port with explicit direction.** Every port has a direction: input, output, or bidirectional. This is fundamental to how signal routing works. A mixer output connects to an amplifier input. A Dante transmitter flows to a Dante receiver. Even network ports, which carry bidirectional data, have logical signal direction (Dante Tx vs Rx channels).

**Signal types and connector types are separate concerns.** The same XLR connector carries mic-level analog audio, line-level analog audio, or AES3 digital audio. The connector is the physical interface; the signal type is the logical protocol. Tools that model both (EasySchematic, AES70) keep these as distinct properties on a port, not as a combined enum.

**Implicit connections exist.** Patch bays have normalling (default signal paths that exist without patch cables). Video matrix switchers have routing tables (active crosspoints). These are not physical cables but are real signal paths that must be modeled.

**AVIXA standards focus on documentation, not data modeling.** ANSI/AVIXA D401.01:2023 defines documentation requirements for AV systems. F502.01 covers rack building. F501.01 covers cable labeling. None define a data model for connectivity, but all presume signal flow diagrams with connector types, signal direction, and format labels.

---

## NetBox Interface Types

### Core Model

NetBox models four distinct component types for device I/O, each with its own direction semantics:

| Component | Direction Model | Purpose |
| --- | --- | --- |
| **Interface** | No direction field (inherently bidirectional) | Network interfaces (Ethernet, fiber, wireless) |
| **ConsolePort** | Implied input (connects TO a console server) | Serial console access |
| **ConsoleServerPort** | Implied output (provides access TO console ports) | Serial console server |
| **PowerPort** | Explicit input (power enters device) | Power inlet |
| **PowerOutlet** | Explicit output (power leaves device) | Power outlet |
| **FrontPort** | Pass-through (mapped to a rear port) | Patch panel front |
| **RearPort** | Pass-through (mapped to a front port) | Patch panel rear |

### Key Design Decisions

**No audio/video/broadcast interface types in core.** NetBox explicitly declined to add SDI, XLR, HDMI, or other AV connector types to `InterfaceTypeChoices`. The rationale (from issue #14597): SDI is "far enough over the line" from IP networking. Issue #11915 (BNC/SMA connectors) was also rejected, with maintainers directing users to Front/Rear Ports instead.

**Front/Rear Ports model passthrough.** Front ports and rear ports are pass-through components. They represent physical jacks on a patch panel or similar device, connected internally. NetBox traces through them automatically: a cable trace starts at an interface, follows cables through front/rear port pairs, and terminates at another interface. This is the model NetBox uses for patch panels.

**Front/Rear Port connector types (PortTypeChoices).** These include relevant AV connectors:

**Copper:**

- `8p8c`, `8p6c`, `8p4c`, `8p2c` (RJ45 variants)
- `6p6c`, `6p4c`, `6p2c` (RJ11/RJ12/RJ9)
- `4p4c`, `4p2c` (handset)
- `110-punch` (punchdown block)
- `bnc` (BNC, used for SDI, word clock, AES3id)
- `f` (F-connector, coax)
- `n` (N-connector, coax)
- `mrj21` (MRJ21)

**Fiber optic:**

- SC, LC, FC, ST, MPO, MTRJ, MU, LSH, LX.5 (with PC/UPC/APC variants)
- CS, SN, SMA 905, SMA 906
- URM-P2/P4/P8
- Splice

**USB:**

- USB Type A, B, C, Mini A/B, Micro A/B/AB

**Power connector types** (separate from above, for PowerPort/PowerOutlet):

- IEC 60320 (C6, C8, C13, C14, C15, C16, C17, C18, C19, C20, C22)
- IEC 60309 (various pin configurations)
- NEMA (locking and non-locking, L1 through L22)
- Neutrik powerCON (20A, 32A, TRUE1, TRUE1 TOP)
- CS (California style)
- ITA (international, C through O types)
- DC terminal, hardwired

**Cable types (CableTypeChoices):**

| Category | Types |
| --- | --- |
| Copper twisted pair | CAT3, CAT5, CAT5e, CAT6, CAT6a, CAT7, CAT7a, CAT8, MRJ21 trunk |
| Twinax | DAC active, DAC passive |
| Coaxial | Coaxial, RG-6, RG-8, RG-11, RG-59, RG-213, LMR-100/200/400 |
| Fiber multimode | MMF, OM1-OM5 |
| Fiber single-mode | SMF, OS1, OS2 |
| Active optical | AOC |
| Power | Power |
| USB | USB |

### NetBox 4.5 Enhancements

**Cable Profiles** describe internal structure of multi-channel cables:

- **Single:** One connector per side (1C1P through 1C16P)
- **Trunk:** Multiple connectors per side, symmetrical
- **Breakout:** Fewer connectors on one side (fanout)
- **Shuffle:** Non-linear position mapping (polarity swap)

**Port Mappings** (replacing the old `rear_port_position` field) allow:

- A single front port to map to multiple positions on one or more rear ports
- Accurate modeling of fiber cassettes and MPO modules

### Relevance to Rackula

NetBox's model demonstrates that:

1. Direction is a property of the component type, not the interface type
2. Passthrough (front/rear port pairs) is a separate concept from endpoints (interfaces)
3. AV connector types belong on port types, not interface types
4. Cable profiles handle multi-channel connections
5. The plugin system and `FIELD_CHOICES` configuration allow extending types without modifying core

Sources:

- [NetBox interfaces documentation](https://netboxlabs.com/docs/netbox/models/dcim/interface/)
- [NetBox cables documentation](https://netboxlabs.com/docs/netbox/features/devices-cabling/)
- [NetBox SDI interface types issue #14597](https://github.com/netbox-community/netbox/issues/14597)
- [NetBox BNC/SMA connector issue #11915](https://github.com/netbox-community/netbox/issues/11915)
- [NetBox choices.py source](https://github.com/netbox-community/netbox/blob/main/netbox/dcim/choices.py)
- [NetBox cable profiles blog post](https://netboxlabs.com/blog/understanding-cable-profiles-in-netbox-4-5/)
- [NetBox front ports documentation](https://netbox.readthedocs.io/en/feature/models/dcim/frontport/)

---

## Pro Audio Connector Types

### Comprehensive Connector Reference

| Connector | Signal Types | Direction Model | Balanced | Common Use |
| --- | --- | --- | --- | --- |
| **XLR 3-pin** | Analog audio, AES3 (digital) | Male = output, Female = input (AES14-1992) | Yes | Microphones, line I/O, AES3 |
| **XLR 4-pin** | Analog audio (stereo/balanced mono), intercom | Male = output, Female = input | Yes | Headsets, intercom, clear-com |
| **XLR 5-pin** | DMX512 (lighting), analog stereo | Male = output, Female = input | Yes | Lighting control, stereo audio |
| **XLR 6-pin** | Analog audio (3-channel), intercom | Male = output, Female = input | Yes | Multi-channel audio |
| **XLR 7-pin** | Analog audio, custom | Male = output, Female = input | Yes | Specialized audio |
| **TRS 1/4" (6.35mm)** | Analog audio (balanced mono or unbalanced stereo) | Variable: depends on jack normaling | Yes (balanced) | Line I/O, insert points, headphones |
| **TS 1/4" (6.35mm)** | Analog audio (unbalanced), instrument | Variable | No | Instruments, unbalanced line |
| **TRS 3.5mm (1/8")** | Analog audio (headphones, line) | Variable | Rare | Headphones, aux I/O |
| **RCA/Phono (Cinch)** | Analog audio, S/PDIF (coaxial) | Variable | No | Consumer audio, digital coax |
| **Speakon** (2-pole, 4-pole, 8-pole) | Speaker level | Output on amp, Input on speaker | N/A | Amplifier-to-speaker connections |
| **Ethercon (shielded RJ45)** | Dante, AVB, AES67, NDI, control | Bidirectional (network) | N/A | Networked audio |
| **BNC** | Word clock, AES3id, SDI, genlock | Direction depends on signal type | Yes (coax) | Clocking, digital video, RF |
| **ADAT/TOSLINK** | ADAT digital audio (8ch @ 48kHz) | Separate TX and RX ports | N/A | Digital audio transfer |
| **DB25 (TASCAM pinout)** | Analog audio (8ch), AES (4ch pairs) | Variable per pin assignment | Yes | Multi-channel analog/digital |
| **DB25 (D-sub)** | RS-422, RS-232, GPIO | Variable | N/A | Control, GPIO |
| **Phoenix/Euroblock** | Analog audio (install), speaker | Variable | Yes | Fixed installation audio |
| **USB (A, B, C)** | USB Audio, MIDI | Host = output, Device = input | N/A | Audio interfaces |
| **Thunderbolt** | Thunderbolt Audio, video, data | Bidirectional | N/A | Low-latency audio interfaces |
| **Mini-DIN 8** | Serial (Mac-style) | Variable | N/A | Console/serial |

### Signal Level Categories

| Level | Typical Voltage | dBu/dBV | Impedance | Key Rule |
| --- | --- | --- | --- | --- |
| **Mic level** | 1-10 mV | -60 to -40 dBu | 150-250 ohm (output) | Needs preamp before line-level gear |
| **Instrument level** | 70-150 mV | ~-20 dBu | Very high (Hi-Z, ~1Mohm input expected) | Needs DI box or Hi-Z input |
| **Line level (pro)** | 1.228 V RMS | +4 dBu | Low output, high input (bridging) | Standard interconnect level |
| **Line level (consumer)** | 0.316 V RMS | -10 dBV | High input | ~12 dB below pro line level |
| **Speaker level** | 20-50 V+ (varies) | +70 to +120 dB | 4-8 ohm (very low) | Never connect to line/mic inputs |

**Connector does not indicate signal level.** An XLR can carry mic level or line level. A 1/4" jack can carry instrument, line, or speaker level. The data model must track signal level separately from connector type.

### Digital Audio Protocol Specifications

| Protocol | Channels | Sample Rate | Connector | Direction | Key Property |
| --- | --- | --- | --- | --- | --- |
| **AES3 (AES/EBU)** | 2 | Up to 192 kHz | XLR (110 ohm) or BNC (75 ohm) | Unidirectional | Self-clocking (biphase mark) |
| **AES3id** | 2 | Up to 192 kHz | BNC (75 ohm) | Unidirectional | 75 ohm variant of AES3 |
| **ADAT Lightpipe** | 8 (48 kHz), 4 (96 kHz) | 44.1/48/96 kHz | TOSLINK optical | Unidirectional (separate TX/RX) | 5-10m max (plastic fiber) |
| **S/PDIF** | 2 | Up to 192 kHz | RCA coaxial or TOSLINK | Unidirectional | Consumer version of AES3 |
| **MADI (AES10)** | 56 or 64 | 32-48 kHz (56ch), 48 kHz (64ch) | BNC coax (75 ohm) or SC fiber | Unidirectional | Requires external word clock |
| **Dante** | Up to 512x512 per device | 44.1-192 kHz | RJ45/Ethercon | Bidirectional (network) | Flows of 1-4ch (unicast), up to 64ch (multicast) |
| **AVB (IEEE 1722)** | Up to 60ch/stream, 64 streams | 44.1-192 kHz | RJ45/Ethercon | Bidirectional (network) | AVDECC discovery |
| **AES67** | Variable (RTP streams) | 44.1-96 kHz | RJ45/Ethercon | Bidirectional (network) | Interoperability standard |
| **Word Clock** | N/A (clock only) | Matches sample rate | BNC (75 ohm) | Output (master) or Input (slave) | 75 ohm terminated |
| **DMX512** | 512 channels per universe | N/A (250 kbaud) | XLR 5-pin or RJ45 | Output (controller) or Input (fixture) | Lighting control protocol |
| **AES50** | Up to 64ch bidirectional | 44.1-96 kHz | RJ45 (Cat5e+) | Bidirectional | Behringer/Midas protocol |

Sources:

- [Sweetwater: Mic, Instrument, Line, Speaker Levels](https://www.sweetwater.com/sweetcare/articles/whats-the-difference-between-mic-instrument-line-and-speaker-level-signals/)
- [Shure: Line vs Mic Levels](https://www.shure.com/en-eu/insights/differences-line-mic-level/)
- [MADI (AES10) Wikipedia](https://en.m.wikipedia.org/wiki/MADI)
- [AES14-1992: XLR Pin Assignments](https://www.casa.co.nz/Connectors/Multipole/Audio/Audio-Engineering-Standard-AES14-1992-r2014-Preview_7p.pdf)

---

## Patch Bay Normalling

### What Normalling Is

Normalling defines the default signal path between the top (output) and bottom (input) jacks of a vertical pair on a patch bay. Without any patch cable inserted, the signal flows according to the normalling configuration.

### Three Types

| Type | Behavior | Use Case |
| --- | --- | --- |
| **Full-Normal** | Inserting a cable into **either** the top OR bottom jack breaks the default connection. | Maximum control. Any insertion overrides the default path. |
| **Half-Normal** | Inserting into the **top** (output) jack does NOT break the link. Signal is multed (split) to both the normal destination and the patch cable. Inserting into the **bottom** (input) jack DOES break the link. | Frequent signal tapping. Common in recording studios for "dry/wet" monitoring. |
| **De-Normal (Non-Normal/Isolated)** | No default connection between top and bottom jacks. Every connection must be made manually with patch cables. | Maximum flexibility. Used when all routing is manual. |

### How It Works Physically

Normalling is implemented via normally-closed (NC) switching contacts inside the jack sockets:

- **Full-normal:** Both top and bottom jacks have NC switches. Inserting a plug into either jack physically pushes the contacts apart, breaking the circuit.
- **Half-normal:** Only the bottom (input) jack has an NC switch. The top (output) jack connects directly, so inserting there does not interrupt the signal. The signal is "multed" to both the normal destination and the patch cable.
- **De-normal:** No internal connection between jacks. Each operates independently.

Some patch bays (e.g., ADC ProPatch) offer **programmable normals** via DIP switches, allowing per-channel configuration. Others bring **normals out** to rear terminals for custom strapping.

### How Other Tools Model Normalling

**EasySchematic** does not explicitly model normalling. Each port has a direction (input/output/bidirectional) and connections are explicit point-to-point links. Normalling would need to be modeled as implicit connections between port pairs within a device.

**NetBox** uses Front/Rear Port pairs with internal mappings. A patch panel's front port maps to a rear port position. This is conceptually similar to normalling but models physical passthrough rather than default signal routing. NetBox does not model normalling behavior (the switching logic of half-normalled jacks).

**RackTables** supports port linking with circuit tracing. It can model patch bay connections but does not have a normalling concept.

### Modeling Recommendation for Rackula

Normalling is a property of the port pair relationship, not the port itself. It should be modeled as:

```
InternalConnection with type "passthrough" + normalling property:
  - "full-normal" | "half-normal" | "non-normal"
```

This allows Rackula to:

1. Render the default signal path without cables (normalling)
2. Show what happens when a cable is inserted (signal continues or breaks)
3. Trace signal flow through patch bays with proper behavior

Half-normalling is particularly important because it creates an implicit signal split (mult), which has no equivalent in network connectivity.

Sources:

- [Sweetwater: What is Normalling?](https://www.sweetwater.com/sweetcare/articles/what-normalling-what-difference-between-full-normal-half-nornal/)
- [Clark Wire: Understanding Audio Normalling](https://www.clarkwire.com/understanding-audio-normalling)
- [North Coast Synthesis: All about Normalling](https://northcoastsynthesis.com/news/all-about-normalling/)
- [Mr. Patchbay: Patchbay Normaling](https://misterpatchbay.com/normaling/normal.html)

---

## Matrix Switcher Routing

### How Video Matrix Switchers Work

A video matrix switcher (e.g., Extron CrossPoint, Barco, Lightware) has N inputs and M outputs. Any input can be routed to any output. The core abstraction is a crosspoint matrix where each crosspoint (i, j) represents a programmable switch connecting input i to output j.

### Data Structure Models

**Binary matrix (simplest):** An N x M boolean matrix where `C[i][j] = 1` means input i is routed to output j. For unicast (one input per output), each column has at most one `1`.

**Routing table (practical):** A map from output to input: `{ outputId -> inputId }`. This is the minimum viable representation for a rack visualization tool. For a 32x32 matrix, this is 32 entries, not 1024 crosspoints.

**Crosspoint buffer matrix (buffered switches):** Each crosspoint (i,j) has an associated buffer/queue. Used in high-performance telecommunications switches. Overkill for a visualization tool.

**Partitioned matrix:** Physical N x M hardware that can be logically partitioned into smaller independent sub-matrices (e.g., a 144x144 split into a 64x64 and an 80x80).

### Special Routing Features

| Feature | Description | Modeling Implication |
| --- | --- | --- |
| **Breakaway routing** | Audio can be routed independently from video on the same input | Need separate audio and video routing tables |
| **Salvo** | Preset routing configurations recalled as a group | Store named presets of the routing table |
| **Multiview** | One output showing multiple inputs simultaneously (quad-split, picture-in-picture) | An output can have multiple input sources with layout metadata |
| **Loop-through** | Input passes through to a monitoring output, unaffected by routing | Implicit passthrough connection |
| **HDCP management** | Matrix manages HDCP handshake and can strip/re-add HDCP | Property on the matrix, not on individual routes |
| **EDID management** | Matrix can emulate EDID to sources | Property on inputs |

### Minimum Viable Representation

For a rack visualization tool, the minimum viable representation is:

```
RoutingTable: Map<outputPortId, inputPortId>
  - Each output is connected to at most one input (unicast)
  - Outputs with no route are disconnected
  - Optionally: per-output breakaway (video route, audio route, control route)
  - Optionally: named salvos (Map<salvoName, RoutingTable>)
```

This is sufficient because:

1. The visualization only needs to show which inputs are connected to which outputs
2. The matrix's internal crosspoint state is a routing table, not 1024 individual connections
3. Breakaway routing is modeled by having separate routing tables per signal class
4. Multiview can be added later as an output with multiple input sources

### How Dante Models Routing

Dante uses a subscription model:

- **Flows** carry channels (1-4 for unicast, up to 64 for multicast)
- **Subscriptions** map receiver channels to transmitter channels by name
- Routing is receiver-pulled: the receiver subscribes to a specific transmitter channel

This is a simpler model than crosspoint matrices and aligns well with Rackula's port-based approach.

### How AES70 (OCA) Models Routing

AES70 uses an object model:

- `OcaMatrix` represents a routing matrix with N inputs and M outputs
- Crosspoints are addressed as (input, output) pairs
- The matrix object supports switching, gain control, and label management
- `OcaNetworkSignalChannel` provides network-level connection management

Sources:

- [FOR-A MFR-6100 (144x144 SDI matrix)](https://www.for-a.com/products/mfr6100/)
- [Lightware MX2M-FR24R-F (24x24 matrix)](https://www.lightware.com/en/products/Matrix-Switchers/mx2m-fr24r-f)
- [Extron XTP II CrossPoint 6400](https://www.extron.com/product/xtpiicp6400)
- [Dante Controller routing documentation](https://dev.audinate.com/GA/dante-controller/userguide/webhelp/content/routing_media.htm)
- [AES70 (OCA) Object Model](https://ocaalliance.com/wp-content/uploads/2019/11/AES147-Network-NA02-An-Introductory-Tutorial-to-AES70.pdf)

---

## Similar Implementations

### NetBox (DCIM)

**What it models:** Data center infrastructure (servers, switches, PDUs, patch panels).

**Relevant model:** Separate component types for different I/O:

- Interface (network, bidirectional)
- ConsolePort/ConsoleServerPort (serial, directional)
- PowerPort/PowerOutlet (power, directional)
- FrontPort/RearPort (passthrough, for patch panels)

**Direction handling:** Direction is implied by component type, not an explicit field. Interfaces are inherently bidirectional. Power has separate input (PowerPort) and output (PowerOutlet) types. Console has separate input (ConsolePort) and output (ConsoleServerPort) types.

**AV relevance:** Limited. NetBox explicitly declined SDI and other broadcast types. AV connectors would go on Front/Rear Ports, not Interfaces. The plugin system and `FIELD_CHOICES` configuration allow adding custom types.

**What Rackula can learn:**

- Separate component types for fundamentally different I/O categories (power, network, console, AV) is clean
- Front/Rear Port passthrough model works well for patch panels
- The port mapping model (NetBox 4.5+) handles multi-channel connections
- Cable profiles describe internal cable structure

### RackTables

**What it models:** Data center asset management with port linking and circuit tracing.

**Relevant model:** Port linking with physical and logical connections, multi-point links (Y-cables, QSFP breakout), circuit tracing through patch panels, and a GraphViz-based cabling plan plugin.

**AV relevance:** None built-in. No AV port types, no signal flow diagrams, no normalling concept.

**What Rackula can learn:**

- Circuit tracing through intermediate devices is essential
- Multi-point links (breakout cables) need explicit modeling
- Visual topology diagrams are valuable for understanding connections

### EasySchematic (AV Signal Flow Tool)

**What it models:** Pro AV signal flow diagrams with 500+ device templates and 68 signal types.

**Data model highlights:**

- Ports with direction (input/output/bidirectional)
- Network ports connect in any direction (input-to-input, output-to-output)
- Signal type compatibility validation (green/red indicators)
- Connector gender auto-derived from type + direction (XLR male/female, powerCON in/out)
- Adapter insertion between incompatible connector types
- Cable IDs with type-prefix naming (SDI-1, HDMI-2)
- Device templates with port sections, expansion slots, and nested sub-slots
- JSON schema with versioning and automatic migrations
- Public REST API for device templates

**Signal types (68 total):** SDI, HDMI, NDI, Dante, AVB, Analog Audio, Speaker-Level, Bluetooth, AES, AES67, DMX, MADI, USB, Ethernet, Fiber, DisplayPort, HDBaseT, SRT, ST 2110, Genlock, Word Clock, GPIO, Contact Closure, RS-422, Serial, Thunderbolt, Composite, Component Video, S-Video, VGA, DVI, RF, Power, L1, L2, L3, Neutral, Ground, MIDI, Tally, S/PDIF, ADAT, YDIF, Ultranet, AES50, StageConnect, Art-Net, sACN, IR, Timecode, GigaACE, DX5, SLink, SoundGrid, fibreACE, dSnake, DX Link, Digilink, eBUS, Control Voltage, Extron Expansion, POTS, GPS, DARS, RTMP, RTSP, MPEG-TS, Custom

**What Rackula can learn:**

- Signal type and connector type are separate properties on a port
- Port direction is essential (input/output/bidirectional)
- Network signal types relax direction constraints
- Connector gender is derivable from connector type + direction
- Adapter tracking for incompatible connector connections
- The 68-signal-type taxonomy is comprehensive but may be overkill; Rackula should start with a focused subset

Source: [EasySchematic GitHub](https://github.com/duremovich/EasySchematic)

### AVIXA Standards

**ANSI/AVIXA D401.01:2023** (Documentation Requirements for Audiovisual Systems): Defines minimum documentation requirements for AV projects, including signal flow diagrams. Does not define a data model.

**AVIXA F502.01:2018** (Rack Building for Audiovisual Systems): Physical rack building standards. Assumes design documentation (including signal flows) is already complete.

**AVIXA F501.01:2015** (Cable Labeling for Audiovisual Systems): Cable labeling conventions.

None of these define a machine-readable data model, but they establish conventions (left-to-right signal flow, color-coded signal types, labeled connectors) that should inform Rackula's rendering.

Sources:

- [AVIXA Standards](https://www.avixa.org/resources/standards/published-standards)
- [AVIXA Rack Design](https://www.avixa.org/resources/standards/rack-design-for-av-systems)
- [AVIXA Documentation Requirements](https://store.avixa.org/CPBase__item?id=a13f200000C2UkcAAF)

---

## Recommendations for Rackula

Based on the research findings and Rackula's current data model (port-based connections with `InterfaceType` enum, `PlacedPort` with UUID identity, and `Connection` edges), here are recommendations for extending the model to support pro audio and AV connectivity.

### 1. Add Signal Type as a First-Class Port Property

**Current state:** `InterfaceTypeSchema` is a flat enum of network interface types. `PlacedPortSchema` inherits the type from `InterfaceTemplate`.

**Recommendation:** Add a `signal_type` property to ports, separate from the connector type. This mirrors EasySchematic's approach and is essential because the same connector (XLR, BNC, RJ45) can carry different signal types.

```typescript
// Signal types, organized by domain
// Start with a focused set; extend later
const SignalTypeSchema = z.enum([
  // Analog audio
  "analog-audio-mic", // Mic level
  "analog-audio-line", // Line level (pro +4 dBu)
  "analog-audio-consumer", // Consumer line level (-10 dBV)
  "analog-audio-instrument", // Instrument level (Hi-Z)
  "analog-audio-speaker", // Speaker level (post-amp)
  // Digital audio
  "aes3", // AES/EBU (2-channel, XLR/BNC)
  "aes3id", // AES3id (75 ohm BNC variant)
  "adat", // ADAT Lightpipe (8ch optical)
  "spdif-coaxial", // S/PDIF coaxial (RCA)
  "spdif-optical", // S/PDIF optical (TOSLINK)
  "madi", // MADI/AES10 (56/64ch, BNC/SC)
  // Networked audio
  "dante", // Dante (Audinate)
  "avb", // AVB/Milan (IEEE 1722)
  "aes67", // AES67 (interoperable IP audio)
  // Video
  "hdmi", // HDMI (all versions)
  "displayport", // DisplayPort
  "sdi", // SDI (HD/3G/6G/12G)
  "composite-video", // Composite (RCA/BNC)
  "vga", // VGA analog video
  "dvi", // DVI digital video
  // Control & sync
  "word-clock", // Word clock (BNC)
  "dmx", // DMX512 lighting control
  "rs-232", // Serial control
  "rs-422", // Differential serial
  "midi", // MIDI (5-pin DIN or USB)
  "gpio", // General purpose I/O
  // Network & power
  "ethernet", // Standard Ethernet
  "poe", // Power over Ethernet
  "power-ac", // AC power
  "power-dc", // DC power
  // Virtual
  "virtual", // Logical/virtual interface
]);
```

**Why separate signal_type from connector type:** An XLR-3 can carry `analog-audio-mic`, `analog-audio-line`, or `aes3`. An RJ45 can carry `ethernet`, `dante`, `avb`, `dmx` (Art-Net/sACN). The connector is the physical interface; the signal type determines compatibility and routing rules.

### 2. Add Port Direction

**Current state:** No direction field on `PlacedPort` or `InterfaceTemplate`. NetBox interfaces are implicitly bidirectional.

**Recommendation:** Add a `direction` property to `InterfaceTemplate` and `PlacedPort`:

```typescript
const PortDirectionSchema = z.enum(["input", "output", "bidirectional"]);
```

**Default:** `bidirectional` for network ports (Ethernet, Dante, AVB). `input` or `output` for audio/video ports where direction matters.

**Why:** AV connectors have inherent direction. A mixer XLR output is different from a microphone XLR input, even though the connector is the same. EasySchematic and all AV signal flow tools use port direction. Network-only ports default to bidirectional.

### 3. Extend Connector Types (InterfaceType)

**Current state:** `InterfaceTypeSchema` has ~25 network-focused types.

**Recommendation:** Add AV-relevant connector types. Group by domain for readability:

```typescript
// Add to InterfaceTypeSchema:
// Audio connectors
"xlr-3",
"xlr-4",
"xlr-5",
"xlr-6",
"trs-1-4",       // 1/4" TRS (balanced stereo or balanced mono)
"ts-1-4",        // 1/4" TS (unbalanced)
"trs-3-5mm",     // 3.5mm TRS (headphones)
"rca",            // RCA/Phono
"speakon-2",      // Speakon 2-pole
"speakon-4",      // Speakon 4-pole
"speakon-8",      // Speakon 8-pole
"adat-optical",   // TOSLINK (ADAT optical)
"db25-audio",     // DB25 TASCAM analog pinout
"db25-aes",       // DB25 AES digital pinout
"phoenix",        // Phoenix/Euroblock terminal block
"mini-din-8",     // Serial (Mac-style)
// Video connectors
"hdmi-a",         // HDMI Type A (standard)
"hdmi-c",         // HDMI Type C (mini)
"hdmi-d",         // HDMI Type D (micro)
"displayport",    // DisplayPort (standard)
"mini-displayport", // Mini DisplayPort
"bnc",             // BNC (75 ohm coaxial)
"sdi-bnc",        // SDI over BNC (distinct from word clock BNC)
"hd-bnc",         // HD-BNC (Cinch/Canare)
"vga",            // VGA (D-sub 15)
"dvi-d",          // DVI-D digital
"dvi-i",          // DVI-I digital+analog
"dvi-a",          // DVI-A analog
// Clock/sync
"word-clock-bnc", // Word clock (75 ohm BNC)
"genlock-bnc",    // Genlock reference (BNC)
// Control
"midi-din",       // MIDI 5-pin DIN
"dmx-xlr",        // DMX512 (5-pin XLR, or 3-pin)
"rs-232-db9",     // RS-232 serial
"rs-422-db9",     // RS-422 serial
"ethernet-rj45",  // Rename from generic types for clarity
```

**Alternative approach (recommended):** Rather than bloating `InterfaceTypeSchema`, separate connector type from interface type. The existing `InterfaceTypeSchema` should represent the logical interface (what protocol/signaling it uses), and a new `ConnectorTypeSchema` should represent the physical connector:

```typescript
const ConnectorTypeSchema = z.enum([
  // Network
  "rj45",
  "rj45-shielded",
  "sfp",
  "sfpp",
  "sfp28",
  "qsfp",
  "qsfpp",
  "qsfp28",
  "qsfpdd",
  "qsfp56",
  // Fiber optic
  "lc",
  "sc",
  "fc",
  "st",
  "mpo",
  "mtrj",
  // Audio
  "xlr-3",
  "xlr-4",
  "xlr-5",
  "xlr-6",
  "trs-1-4",
  "ts-1-4",
  "trs-3-5mm",
  "trrs-3-5mm",
  "rca",
  "speakon-2",
  "speakon-4",
  "speakon-8",
  "adat-toslink",
  "db25-tascam",
  "db25-aes",
  "phoenix-3",
  "phoenix-5",
  "phoenix-8",
  "mini-din-8",
  "midi-din-5",
  // Video
  "hdmi-a",
  "hdmi-c",
  "hdmi-d",
  "displayport",
  "mini-displayport",
  "bnc",
  "hd-bnc",
  "vga-d-sub-15",
  "dvi-d",
  "dvi-i",
  "dvi-a",
  // Power
  "iec-c13",
  "iec-c14",
  "iec-c19",
  "iec-c20",
  "neutrik-powercon-20",
  "neutrik-powercon-32",
  "neutrik-powercon-true1",
  "nema-5-15",
  "nema-l6-20",
  // Serial/Console
  "de-9",
  "db-25",
  "usb-a",
  "usb-b",
  "usb-c",
  // Coaxial
  "f-connector",
  "n-connector",
  // Multi-purpose
  "usb-c-displayport-alt",
  "other",
]);
```

**Rationale for separating connector type:** The current `InterfaceTypeSchema` conflates two concepts: the physical connector (RJ45, SFP) and the signaling protocol (1000base-t, 10gbase-x-sfpp). For AV, these are always separate concerns. A BNC can carry SDI, word clock, AES3id, or genlock. Separating them allows flexible combinations and avoids a combinatorial explosion of types.

### 4. Add Normalling to InternalConnection

**Current state:** `InternalConnection` has a `connection_type` enum with `power-distribution`, `passthrough`, `fabric`, and `stacking`.

**Recommendation:** Add a `normalling` property to `InternalConnection` when `connection_type` is `passthrough`:

```typescript
const NormallingSchema = z.enum([
  "full-normal", // Inserting into either jack breaks the connection
  "half-normal", // Inserting into top (output) jack does NOT break connection
  "non-normal", // No default connection; all routing is manual
]);
```

This applies to patch panels, audio patch bays, and video patch panels where default signal paths exist.

### 5. Model Matrix Switchers as Routing Tables

**Current state:** `Connection` is a simple edge between two port IDs. No concept of routing tables or matrix switchers.

**Recommendation:** Do NOT add a separate routing table data structure in the MVP. Instead:

1. A matrix switcher device has N input ports and M output ports defined in its `InterfaceTemplate`
2. Connections from the matrix's input ports and output ports to external devices are standard `Connection` edges
3. The internal routing (which input is connected to which output internally) is modeled using `InternalConnection` with `connection_type: "fabric"` and additional metadata:

```typescript
// For a matrix switcher's InternalConnection:
{
  from_interface: "HDMI-Input-1",
  to_interfaces: ["HDMI-Output-3"],
  connection_type: "fabric",
  routing_table: {                    // Optional, for matrix switches
    "HDMI-Output-1": "HDMI-Input-2",  // Output -> Input mapping
    "HDMI-Output-2": null,             // Unrouted output
    "HDMI-Output-3": "HDMI-Input-1",
  },
  breakaway: {                        // Optional, for breakaway routing
    "HDMI-Output-1": {
      video: "HDMI-Input-2",
      audio: "HDMI-Input-4",           // Audio from different source
    }
  }
}
```

**MVP approach:** Start with just the routing table (output-to-input map). Add breakaway and multiview later as needed.

### 6. Add Signal Level as an Optional Port Property

**Recommendation:** Add an optional `signal_level` property to `InterfaceTemplate`:

```typescript
const SignalLevelSchema = z.enum([
  "mic", // Mic level (-60 to -40 dBu)
  "instrument", // Instrument level (~-20 dBu, Hi-Z)
  "line-pro", // Professional line level (+4 dBu)
  "line-consumer", // Consumer line level (-10 dBV)
  "speaker", // Speaker level (post-amp)
  "digital", // Digital audio signal (AES3, ADAT, S/PDIF, etc.)
  "clock", // Clock/sync signal (word clock, genlock)
  "network", // Network data (Dante, AVB, AES67, NDI)
]);
```

**Why:** Signal level compatibility is a validation concern. Connecting a mic-level output to a line-level input produces unacceptable noise. Connecting a speaker-level output to a mic-level input causes damage. A rack tool that validates connections should warn about level mismatches.

### 7. Add Connector Gender

**Recommendation:** Add an optional `gender` property to `InterfaceTemplate`:

```typescript
const ConnectorGenderSchema = z.enum(["male", "female", "none"]);
```

For many connectors, gender is deterministic from direction and type (XLR outputs are male, XLR inputs are female per AES14). But for some (RJ45, BNC, RCA), gender is not meaningful. For others (TRS, Speakon), both genders exist regardless of direction.

EasySchematic auto-derives gender from connector type and direction, with per-port overrides. Rackula should do the same: derive by default, allow override.

### 8. Signal Type Compatibility Matrix

**Recommendation:** Define a compatibility matrix for connection validation. This is not a schema change but a runtime validation concern:

```typescript
// Pairs of signal types that are compatible when connected
const SIGNAL_COMPATIBILITY: [SignalType, SignalType][] = [
  // Same type is always compatible
  // Analog audio levels: can connect with level warnings
  ["analog-audio-mic", "analog-audio-line"], // Warning: level mismatch
  ["analog-audio-line", "analog-audio-consumer"], // Warning: level mismatch
  // Network audio protocols: Dante, AVB, AES67 all run over Ethernet
  ["dante", "ethernet"], // Dante requires Ethernet
  ["avb", "ethernet"], // AVB requires Ethernet
  ["aes67", "ethernet"], // AES67 requires Ethernet
  // Digital audio: some connectors carry multiple protocols
  ["adat", "spdif-optical"], // Same connector, different protocols (warning)
  // SDI: backward compatible (12G-SDI can carry HD-SDI signals)
  ["sdi", "sdi"], // Always compatible with same connector
];
```

### 9. Phased Implementation

**Phase 1 (MVP):** Extend `InterfaceType` with AV connector types, add `signal_type` and `direction` to ports. This enables AV devices in the library with meaningful port definitions.

**Phase 2:** Add normalling to `InternalConnection`, connector gender, signal level. This enables patch bays and validation warnings.

**Phase 3:** Add signal compatibility validation and matrix switcher routing tables. This enables smart connection validation and matrix switcher configuration.

### 10. What NOT to Do

- **Do not add a separate `ConnectorType` enum in Phase 1.** Start by extending `InterfaceTypeSchema` with AV types. The connector type / interface type separation can come later when the schema is more mature and the UX implications are clearer.
- **Do not model every one of EasySchematic's 68 signal types.** Start with the 30-40 most common in homelab/small studio environments. Add more via the `passthrough` schema mechanism.
- **Do not model AVB/AES67 stream descriptors.** These are real-time network protocol concerns, not rack layout concerns. Rackula models the physical port and its signal type; the stream configuration belongs in Dante Controller or AVDECC tools.
- **Do not model signal processing chains (gain, EQ, dynamics).** Rackula models connectivity, not signal processing. Internal device signal paths are out of scope.
- **Do not try to auto-derive everything from connector type.** While some inferences are reliable (Speakon = speaker level, XLR-3 with direction output = line/mic level output), many are ambiguous. Explicit properties with sensible defaults are better than wrong assumptions.

---

## Summary

| Concept | Industry Standard | Rackula Recommendation |
| --- | --- | --- |
| Port direction | Universal in AV tools (input/output/bidirectional) | Add `direction` to `PlacedPort` and `InterfaceTemplate` |
| Signal type vs connector type | EasySchematic, AES70 separate them | Add `signal_type` to ports; keep `type` for connector |
| Signal level | Pro audio standard (mic/line/instrument/speaker) | Add optional `signal_level` to `InterfaceTemplate` |
| Normalling | Audio patch bays (full/half/non-normal) | Add `normalling` property to `InternalConnection` |
| Matrix routing | N x M crosspoint matrix or routing table | Add `routing_table` to `InternalConnection` for fabric type |
| Front/rear ports | NetBox front/rear port model | Use `InternalConnection` with `passthrough` type |
| Connector gender | AES14 (XLR male=out, female=in) | Add optional `gender` to `InterfaceTemplate`, auto-derive where possible |
| Cable types | NetBox cable profiles | Extend `CableTypeSchema` with coax, fiber, and audio cable types |
| Connection validation | EasySchematic signal compatibility (green/red) | Phase 3: signal type and level compatibility warnings |
