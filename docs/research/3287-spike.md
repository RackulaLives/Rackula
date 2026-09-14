# Spike #3287: NVIDIA DGX BasePOD and SuperPOD reference architectures

Date: 2026-09-13. Milestone: M007 -- Device Library & Image System.

Supporting research: [3287-codebase.md](3287-codebase.md), [3287-external.md](3287-external.md), [3287-scale.md](3287-scale.md), [3287-patterns.md](3287-patterns.md).

Code references are to main at 466c49a1 (2026-09-13). PR #3280 (merged 2026-09-14 UTC) later wired layout writers to `SCHEMA_VERSION` (#3108) and shifted lines in `src/lib/schemas/migrations.ts` and `src/lib/utils/yaml.ts`. Section 6 reflects the new behaviour.

## Summary

Question: how should Rackula represent the NVIDIA DGX BasePOD and SuperPOD reference architectures?

Answer: a combination, in three steps.

1. An NVIDIA brand pack with real DGX and fabric devices.
2. Multi-rack POD templates, generated from one spec and shipped unwired but with every port in place. BasePOD 4-node and 8-node come first, then one SuperPOD SU.
3. Pre-wired fabric variants, once Rackula can draw dense and cross-rack connections.

Single-rack starters should not ship as their own shape.

What drives it:

- Generations (section 1):
  - Ship DGX B200 first, with H200 and H100 in the same pack.
  - B300 and Rubin have SuperPOD RAs, but no BasePOD RA, and they use different switches or liquid cooling. They come later.
- Elevations (section 3):
  - NVIDIA publishes rack layouts only for SuperPOD B200: 2 DGX per rack (28.6 kW), 16 compute racks per SU.
  - BasePOD RA V5 has no elevations at all.
  - A one-rack B200 BasePOD contradicts NVIDIA's guidance.
- Schema (section 6):
  - DGX and Quantum ports need three new interface types: `400gbase-x-osfp`, `400gbase-x-qsfp112` and `800gbase-x-osfp`.
  - Adding them needs no migration, but every earlier release rejects any file that uses them. A tolerant reader has to ship a release first.
- Data (section 5):
  - NetBox covers the switches, with fixes, but no DGX system. DGX entries are hand-authored from NVIDIA user guides.
  - Partner storage and control-plane servers use unbranded role types.
- Starters (sections 7 and 8):
  - The loader already accepts multi-rack templates with groups and connections.
  - POD starters still need lazy fetch, their own menu group, generated palette commands, a higher rack cap and a lower zoom floor.
- Scale (section 8):
  - One SU at RA density (20 racks) loads in 150 ms, or 0.6 s at 4x CPU throttle, and stays navigable.
  - 4 SU (71 racks) freezes for 1.7 s at 4x and zooms at about 8 fps, so it needs rack culling first.
  - No pre-wired connection draws today: 0 of 2,920.
- Library fit (section 9): the pack adds one collapsed NVIDIA section and about 2 percent more search rows. The default experience does not change.
- Images (section 10):
  - Do not bundle NVIDIA photos or the NetBox SN2201 image.
  - Use plain-text names, a trademark notice and a neutral icon.
  - Get a Canadian legal check before release.

## Recommendation and sequencing

| Phase | Work | Milestone | Depends on | Delivers |
| --- | --- | --- | --- | --- |
| 1 | Tolerant reader for unknown interface types (#3289) | M003 | Nothing. Ship in the next release, which already owes a corpus fixture because PR #3280 changed `src/lib/schemas` | New port types open in every release from here on |
| 2 | OSFP, QSFP112 and 800G interface types (#3290), then the NVIDIA pack (#3291) | M005, M007 | Phase 1 released; Canadian trademark check | Enterprise planning with real devices |
| 3 | Lazy grouped starter manifest (#3292), and the rack cap and zoom floor (#3293), at any time; then the template generator with BasePOD 4-node and 8-node (#3294); then one SU (#3295) | M007 | The pack; the manifest; the rack cap for one SU | Showcase and whole-POD composition |
| 4 | Dense-port anchors (#356), cross-rack drawing (#272) and cross-face drawing (#612), then pre-wired variants (#3296) | M009, M006 | Phase 3 | Fabric cabling at POD scale |
| Later | Off-screen rack culling for a 4-SU template (#3297); power totals (#2537); millimetre depth (#2627) | Backlog, M021 | Pack data | 4-SU showcase; power and depth checks |

If only one phase ships, keep the pack and its tolerant reader. The pack serves planning on its own, and every later phase reuses its slugs. [3287-patterns.md](3287-patterns.md) has the dependency graph.

Decisions made in this spike (open to override):

- Port typing:
  - Use `400gbase-x-osfp` on both ends of InfiniBand compute links. It matches devicetype-library's QM9700 and describes the cage Rackula draws.
  - [3287-patterns.md](3287-patterns.md) proposes `infiniband-ndr-4x`. That value exists only from NetBox v4.6.9, and it describes the protocol, not the cage. DGX compute ports can run InfiniBand or 400GbE.
- Hold the pack until its interface types ship, so DGX entries carry their full ports from the first release (section 4).
- Rack cap: 24. That covers one SU at RA density plus storage, and stays below the 39-rack size where zoom jank starts.
- One-SU node count: 31 DGX plus a UFM, per Table 4.1.
- Milestones:
  - Pre-wired variants go to M009 with their blockers (#356, #272), not M005 or M006 as the spike brief suggested.
  - The tolerant reader goes to M003 (Data Format & Interop), where the forward-compatibility gate (#2205) was built.

Not now:

- A 4-SU template. Rack culling comes first (#3297, Backlog).
- DGX B300, Rubin NVL8, QM9790 and SN4600.
- A GPU category, 0U PDUs, and rack-group metadata.
- Schematic SVG panels (#1541), and NetBox importer port fidelity.
- Container-child ports (#3117).

## 1. DGX generations

Bracketed numbers such as [3] refer to the Sources list at the end, which keeps the numbering of [3287-external.md](3287-external.md). "Derived" marks arithmetic from cited inputs, not an NVIDIA statement.

Verdict:

- Ship DGX B200 first.
- Add DGX H200 and DGX H100 in the same pack.
- Treat DGX B300 as a later phase.
- Defer DGX Rubin NVL8.
- GB200 and GB300 NVL72 stay out of scope.

| System | Status, September 2026 | BasePOD RA V5 | SuperPOD RA | Ship |
| --- | --- | --- | --- | --- |
| DGX B200 | Current, and no EOL notice found [3][4][10][15] | Yes | RA-11334-001 V08 | First |
| DGX H200 | Still in both RAs. The product URL now redirects, and it is not on the BasePOD product page [3][5][15] | Yes | RA-11336-001 V2 | With B200: same chassis as H100 |
| DGX H100 | End of sale 2025-01-25 (reseller sources only) [16][17], with a large installed base | Yes | RA-11333-001 V11 | With B200 |
| DGX B300 | Current and on the BasePOD product page, but there is no BasePOD RA [7][8][15] | No | RA-11337-001 V01, RA-11339-001 V01 | Later: 800G OSFP ports, different switches, a 72-node SU and about 56 kW per rack |
| DGX Rubin NVL8 | On the BasePOD product page, with a SuperPOD RA only [9][15] | No | Yes, number not found | Defer: liquid-cooled at about 225 kW per rack |

Has anything newer superseded them?

- Not in the RAs. The latest BasePOD RA is still RA-11127-001 V5 (2025-08-06), covering B200, H200 and H100 [3]. The B200, H200 and H100 SuperPOD RAs are still listed and not marked superseded [2].
- NVIDIA's BasePOD product page now names only Rubin NVL8, B300 and B200 [15], so the RA lags the product page. H200 and H100 still belong in the pack for existing deployments. They cost two device types and no new switches, because they share one chassis spec (8U, 10.2 kW, identical ports) [13].

## 2. Hardware bill

Every rack-mounted component that the in-scope RAs name is listed below. Power is the maximum where published. For switches, "P2C" is power-to-connector airflow. With the port side as the front, that is NetBox `rear-to-front` [28].

| Component | Used in | U | Depth mm | Weight kg | Max power kW | Airflow | Ports |
| --- | --- | --- | --- | --- | --- | --- | --- |
| DGX B200 | BasePOD, SuperPOD compute | 10 | 897 | 142.4 | 14.3, 6 x 3.3 kW PSU | not stated, 1,550 CFM | 4 twin-port OSFP cages carrying 8 x 400G NDR; 4 x QSFP112 on 2 BlueField-3; 2 x 100GbE plus 1 x 10GbE RJ45 in-band; 1 x RJ45 BMC [12][3] |
| DGX H200, DGX H100 | BasePOD, SuperPOD compute | 8 | 897 | 130.45 | 10.2, 6 x 3.3 kW PSU | front-to-back, 1,105 CFM | as B200, with ConnectX-7 in place of BlueField-3 [13] |
| DGX B300 (later) | B300 SuperPOD RAs | 10 | 904 | 168 | 14.5, 12 x 3.2 kW PSU | not stated, 1,500 CFM | 8 x 800G OSFP (ConnectX-8); 2 dual-port BlueField-3; 2 x RJ45 [14] |
| QM9700 (QM9790 unmanaged) | Compute and storage InfiniBand | 1 | 660 | 14.8 | 1.72 with active cables | P2C or C2P; RA part is P2C | 32 twin-port OSFP cages carrying 64 x NDR 400G; RJ45 mgmt; RJ45 console; USB [19][20] |
| SN4600C | BasePOD in-band and storage | 2 | 566 | 14.64 | not found (0.466 typical) | reversible; RA part is P2C | 64 x QSFP28 100GbE; RJ45 mgmt; RJ45 console; USB [22][23] |
| SN4600 | BasePOD Ethernet storage option | 2 | 566 | 14.64 | not found (0.6 typical) | as SN4600C | 64 x 200GbE (datasheet says QSFP56; unresolved) [23] |
| SN5600 | SuperPOD B200 in-band, Ethernet storage | 2 | 720 | 23.5 | not found (0.94 typical) | not stated; NetBox says rear-to-front | 64 x OSFP 800GbE; 1 x SFP28; RJ45 mgmt and console [24][32] |
| SN2201 | Out-of-band (both); SuperPOD in-band leaf | 1 | 432 | 7.41 | not found (0.098 typical) | RA part is P2C | 48 x RJ45 1GbE; 4 x QSFP28 100GbE; RJ45 mgmt; console [25][26] |
| UFM Enterprise Appliance | SuperPOD only | 1 | 809 | 17 | 0.689 | not stated | not found [27] |
| Control-plane or management node | 5 in BasePOD, 7 in SuperPOD B200 | not stated | not stated | not stated | not stated | not stated | BasePOD minimum is 4 x 200G plus 2 x 100GbE. "Any OEM server" [3] |
| Storage | Partner-certified (DDN, Dell, HPE, Hitachi, IBM, NetApp, Pure, VAST, WEKA) | not stated |  |  |  |  | Partner-specific [4][15] |
| PDU | SuperPOD: 3 per compute rack; BasePOD: none named | not stated for B200; the B300 RA uses 2U PDUs [8] |  |  |  |  | Switched, metered rPDUs recommended [4][11] |

Gaps in the bill:

- Maximum power for SN4600C, SN4600, SN5600 and SN2201 is not published on the pages read, so switch totals mix maximum and typical figures.
- Control-plane height and power, and storage footprint, are not stated in any in-scope RA.
- The NetBox SN2201 console type (`usb-mini-a`) disagrees with NVIDIA's RS232 "Console" port [26][32].

## 3. Rack elevations and power

Neither RA gives U positions, so the elevations below are derived from the composition, counts and power profiles that NVIDIA publishes.

NVIDIA's DGX B200 rack power profile [11]:

- 2 per rack: 28.6 kW on 2 x 380 V 3-phase 32 A, with 3.4 kW headroom at 80% breaker derating.
- 4 per rack: 57.2 kW in 52U on 2 x 415 V 60 A, for high-density sites only.
- Racks must be EIA-310, at least 600 x 1100 mm and at least 48U. NVIDIA recommends 700 x 1200 mm x 52U.

BasePOD:

- RA V5 has no elevation figures, rack size or per-rack budget. Table 4.2 gives counts only [3].
- The network and control rack holds 2 QM9700 (2U), 2 SN4600C (4U), 1 or 2 SN2201 (1 to 2U) and 5 control-plane nodes. That is about 4.5 kW of switches before the control plane and partner storage.

| Build | Compute racks | DGX per rack | Compute kW per rack | Limit | Build total, excluding control plane |
| --- | --- | --- | --- | --- | --- |
| 4 x B200 | 2 | 2 | 28.6 | 28.6 kW profile, fits | 61.7 kW |
| 8 x B200 | 4 | 2 | 28.6 | 28.6 kW profile, fits | 119.0 kW |
| 4 x H100 or H200 | 1 | 4 | 40.8 | H100 RA allows 1, 2 or 4 per rack; its example exceeds 40 kW [6] | 45.3 kW |
| 8 x H100 or H200 | 2 | 4 | 40.8 | as above | 86.2 kW |

Derived elevations, for templates:

- BasePOD 4-node B200: 3 racks.
  - Racks 1 and 2 each hold 2 DGX B200 (20U) plus PDUs. Rackula has no 0U devices, so templates use rack-mounted PDUs.
  - Rack 3 is the network and control rack.
- BasePOD 8-node B200: 5 racks, laid out the same way with 4 compute racks.
- A one-rack 4-node BasePOD is faithful only for H100 or H200 at 4 per rack. That is 32U of DGX, 7 to 8U of switches and the control plane, in a 48U or 52U rack at about 45 kW plus the control plane.
  - B200 at 4 per rack needs 40U and 57.2 kW, which NVIDIA restricts to high-density sites.
  - A homelab-style "one rack" B200 starter therefore misrepresents the RA.

SuperPOD with DGX B200 [4]:

- Figure 3.1, "Complete single SU rack layout": 16 compute racks in two rows of 8.
  - Each rack holds 2 DGX B200 and 3 PDUs, with no switches.
  - 28.6 kW per rack meets the RA's "exceeds 25 kW".
  - 457.6 kW per SU; the deck says 458 kW [11].
- Figure 3.2, "Management rack configuration", sized for the 4-SU build:
  - Racks 1 and 2: 16 compute leaves, 2 compute UFMs and 16 compute spines. Derived 28.2 kW each.
  - Racks 3 and 4: 16 compute leaves, 2 SN5600 in-band spines, 2 SN5600 in-band leaves, 2 storage UFMs, 2 SN2201 in-band leaves and 7 management nodes. Derived 32.9 kW, plus the nodes.
  - Rack 5: 8 storage leaves, 4 storage spines and 16 SN2201 out-of-band leaves. Derived 22.2 kW.
- One SU plus its management racks, as a template, is about 18 racks (derived). Table 4.1 counts 31 DGX per SU plus a UFM, because the UFM displaces one node. Table 3.1 idealises 32.
  - 16 compute racks.
  - About 2 management racks, holding the 1-SU fabric from Table 4.1 (8 compute leaves and 4 spines) plus UFMs, in-band, storage fabric and out-of-band.
- The 4-SU reference build is about 69 racks and 1.93 MW (derived): 64 compute racks plus 5 management racks, and 127 DGX, because one UFM displaces one node [4].

Cabling, for pre-wired templates (see section 7 of [3287-external.md](3287-external.md) for the full tables):

- BasePOD at 8 nodes has 64 NDR400 links, 8 per node.
  - RA Table 4.2 lists 32 NDR fibres, which equals the twin-port transceiver count. Treat it as a counting slip [3][30].
  - A pre-wired 8-node BasePOD is 173 connections at link level, excluding storage. Rackula requires link level, because a port takes one connection (`src/lib/stores/connection.svelte.ts:93-105`).
- One B200 SU is about 700 to 750 connections, and 4 SU about 2,800 to 3,000 (derived).

## 4. Shape comparison

The full analysis is in [3287-patterns.md](3287-patterns.md).

|  | A. Brand pack | B. Single-rack starters | C. Multi-rack POD templates | D. Pre-wired fabric |
| --- | --- | --- | --- | --- |
| What ships | `nvidia.ts` with DGX B200, H200 and H100, QM9700, SN4600C, SN5600, SN2201 and the UFM appliance, plus a trademark notice | 1 to 3 small YAML starters | A generator script, plus BasePOD 4-node, BasePOD 8-node and one-SU templates in a "Data centre" menu group | Connection lists on C's templates: 99 to 173 links for BasePOD, about 700 to 750 for one SU |
| Schema changes | Tolerant reader, then three interface types (section 6) | None of its own | None of its own | None of its own |
| UI changes | Registry entry, with a neutral icon | Menu group, palette entries | Lazy grouped manifest with generated palette commands; rack cap and fit-all floor for one SU | Dense-port anchors (#356), cross-rack drawing (#272), cross-face drawing (#612) |
| Maintenance | Low and append-only: new generations become new entries | Low | Medium: RA revisions become spec edits in the generator | High: port names and rail maps ripple into every template |
| Upgrade corpus | A fixture for the new interface values. The pack data sits outside the gate | None | None: `static/templates` is outside the gate, and the CI parse test covers it | None beyond the interface values |
| Fidelity risk | Low when sourced from NVIDIA guides | High: no RA has a one-rack BasePOD, and B200 at 4 per rack is for specialised sites only | Medium: BasePOD elevations are Rackula's own, and SU management racks are derived from a 4-SU figure | Medium: links are not cables, and twin-port transceivers carry two links |
| Renders fully today | Yes | Yes | Yes, up to one SU | No: 0 of 2,920 connections draw |
| Verdict | Ship first | Do not ship as a separate shape | Ship second | Ship last |

Why the shapes land where they do:

- Single-rack starters serve neither driver.
  - The only faithful single racks are RA building blocks, such as a 2 x DGX B200 compute rack at 28.6 kW, which a user can build from the pack in a minute.
  - A one-rack BasePOD at B200 density contradicts NVIDIA guidance (section 3).
- Unwired does not mean port-free.
  - A template must carry every `PlacedPort` to be wireable later (section 7).
  - C and D therefore share one authoring cost and one generator. Connections add only about 51 KB to a one-SU file (su1 against su1-bare).
- Pre-wired fabric fails on the switch side.
  - At the 8 px port pitch (`src/lib/utils/port-geometry.ts:22`), 64 per-link anchors need 512 px, but a 19-inch rack face is 220 px wide.
  - 32 cage anchors in two rows of 16 fit (derived).
  - So: model per link, draw per cage (#356).
- Pack entries are snapshots.
  - Placing a device copies its type into the layout, and layout types resolve before pack types.
  - A revised pack entry therefore reaches new placements only.
  - Ship each DGX entry with its full port inventory the first time. Adding ports later leaves early layouts without them.

## 5. Data sourcing

NetBox devicetype-library coverage, searched 2026-09-13 [32]:

| Device | NetBox file | Verdict | Notes |
| --- | --- | --- | --- |
| QM9700 | Nvidia/QM9700.yaml | Import the body, fix the ports | 62 of 64 ports as `400gbase-x-osfp` (P22.1 and P23.0 missing), airflow `rear-to-front`, no power ports |
| SN5600 | Nvidia/SN5600.yaml | Import the body, fix the ports | 64 x `800gbase-x-osfp`, with the SFP28 port missing |
| SN2201 | Nvidia/SN2201.yaml | Import, without the image | 49 x `1000base-t` (the mgmt port is not flagged `mgmt_only`) and 4 x QSFP28. The console type disagrees with NVIDIA. The front image is vendor-derived (section 10) |
| SN4600C | Mellanox/SN4600C.yml | Import | 64 x QSFP28 plus mgmt, with no weight. Filed under Mellanox |
| SN4600 | Mellanox/SN4600.yml | Import | 64 x QSFP56 plus mgmt, with no weight. Filed under Mellanox |
| QM9790 | none | Hand-author | Derive it from QM9700 (unmanaged variant) |
| DGX B200, H200, H100, B300 | none (the only DGX entry is DGX Spark) | Hand-author | From the NVIDIA user guides [12][13][14] |
| UFM Enterprise Appliance | none | Hand-author | Body only; the port inventory is not published [27] |
| SN3420 | Nvidia/SN3420.yml | Skip | Not used by any in-scope RA |

Every device, including the Mellanox-filed Spectrum-3 switches, goes into one NVIDIA pack with one `manufacturer: NVIDIA`.

- The script importer writes one file per `--vendor` (`3287-codebase.md` section 2), so the Mellanox files need a manual merge.
- The script also downloads elevation images by default. The SN2201 image must be dropped.

Importers:

- The documented script pipeline:
  - `scripts/import-netbox-devices.ts` reads only identity, height, depth, image flags, airflow, weight and comments (`scripts/import-netbox-devices.ts:52-65`).
  - It never reads interfaces, power or console ports, and it writes no weight.
  - It works for a device body plus images, but not for ports.
- The in-app importer:
  - It reads interfaces and power ports, but maps any interface type outside the enum to "other" with a warning (`src/lib/utils/netbox-import.ts:363-377`).
  - It classes any device with a `*base*` interface as network (`src/lib/utils/netbox-import.ts:214`).
  - A DGX imported this way would become a network device with `other` ports.
- With either importer, fabric switch ports need the new interface types (section 6) before an import can keep them.

Partner and unspecified gear:

- A template can define unbranded types for control-plane nodes and storage:
  - A layout carries its own `device_types[]`, and `manufacturer` is optional.
  - Examples are "x86 control-plane node (2U)" and "Storage appliance (4U)".
  - These appear in that layout's Generic section and match the "Custom only" filter (`src/lib/components/DevicePalette.svelte:303-322`, `3287-codebase.md` section 8).
- Naming rules:
  - The model describes role and form factor, never a vendor.
  - `manufacturer` stays empty.
  - `notes` cites the RA section and says the vendor is the buyer's choice.
  - The pack itself carries only NVIDIA-branded hardware.

## 6. Schema gaps

Verdict:

- OSFP and InfiniBand interface types are needed for a faithful DGX node or Quantum switch port inventory.
- Adding them is backward-compatible, since old files never contain the new values, so no migration is needed.
- It is not forward-compatible: every release before the change rejects any file that uses them.
- Ship a tolerant reader first, then the new values with an upgrade-corpus fixture.

Values to add. They are NetBox-compatible, copied from `netbox/dcim/choices.py` on main and checked 2026-09-13 [36][39]:

| Value | Use | In NetBox since |
| --- | --- | --- |
| `400gbase-x-osfp` | DGX B200, H200 and H100 compute ports, one per link; QM9700 ports | v2.7.0 |
| `400gbase-x-qsfp112` | BlueField-3 and ConnectX-7 storage and in-band ports | v3.6.2 |
| `800gbase-x-osfp` | SN5600 ports; DGX B300 later | v3.4.3 |
| `800gbase-x-qsfpdd` | Optional: completes the 800G set alongside OSFP | v3.4.3 |

Use the Ethernet OSFP type for InfiniBand ports, as devicetype-library does for QM9700 [32]:

- The cage is what Rackula draws and connects.
- `infiniband-ndr` without a suffix means a single 100 Gbps lane.
- The 400G `infiniband-ndr-4x` value arrived only in NetBox v4.6.9 (2026-08-25), so exports that use it will not import into older NetBox.

Add `infiniband-ndr-4x` and `infiniband-xdr-4x` later only if a real need appears, such as fabric filtering or B300 XDR.

Two further notes:

- NetBox device-type interfaces have no speed field [38], so the type string carries the speed.
- A twin-port OSFP cage is two interfaces, one per link. That matches Rackula's one-connection-per-port rule.

Adding these values also fixes the in-app NetBox importer for them, because it maps types through `InterfaceTypeSchema.safeParse`.

What an older release does with a new value:

- `InterfaceTypeSchema` is a strict `z.enum` (`src/lib/schemas/index.ts:136-192`). `.passthrough()` keeps unknown keys, but not unknown enum values.
- File door: the version gate compares only the MAJOR of `metadata.schema_version` (`src/lib/schemas/migrations.ts:50`), so a same-MAJOR file passes. Then `LayoutSchemaBase.safeParse` fails, and the whole file is rejected with "must be one of the supported options" (`src/lib/utils/yaml.ts:355-361`).
- Browser storage door: `parseLayoutObject` returns null (`src/lib/utils/yaml.ts:281-284`), and the tab lands in the error state.
- Share links are unaffected, because they carry no ports.
- Policy conflict: `docs/reference/SCHEMA.md:56` classes enum widening as MINOR, and `SCHEMA.md:45` promises that same-MAJOR files load under a tolerant reader. With a strict enum, widening breaks every prior release.

What adding the values costs:

1. Edit both `InterfaceTypeSchema` and the separate `InterfaceType` union (`src/lib/types/index.ts:130`). Nothing links them at compile time.
2. Run `npm run generate-schema`. The drift guard byte-compares `static/schemas/rackula-layout.schema.json`, which embeds the enum.
3. Add an upgrade-corpus fixture.
   - `scripts/check-corpus-freshness.sh` fails the release gate if `src/lib/schemas` changed since the last tag without a new `*.rackula.yaml` fixture (`scripts/check-corpus-freshness.sh:12-18`, `:39-42`).
   - Keep every rack-level device at position 6 or above, or allow-list `\.version$` in the sidecar, to avoid the position-migration version stamp.
4. No migration.
5. Optional: port colours and tooltip labels are partial maps with fallbacks, so new types render in the generic network colour.

Sequencing to contain the forward-compatibility break:

- Release N: a tolerant reader.
  - Accept any string for an interface or port `type` on read.
  - Render unknown values as generic network ports.
  - Write them back unchanged.
  - This must not coerce to "other" the way the in-app NetBox importer does, because an older release that resaved a newer file would then silently lose port types.
- Release N+1 or later: add the OSFP and InfiniBand values.
  - Releases from N onward open the new files with generic port styling.
  - Only releases before N reject them.
- Stamp the new format.
  - Since PR #3280 (#3108), every writer stamps `SCHEMA_VERSION` and keeps a newer same-MAJOR stamp.
  - Bumping it from 1.1 to 1.2 alongside the new values tells readers and tools which format a file needs.
  - Readers still gate only on the MAJOR, so the stamp alone does not stop older releases rejecting the values. The tolerant reader does that.

No new device category is needed. A DGX node is `server`. A new category would be another strict-enum widening, and it touches about eight maps (`3287-codebase.md` section 1).

Other gaps that limit fidelity but do not block shipping:

- Millimetre depth is not shipped (#2627, M021). `is_full_depth: true` renders correctly, and the chassis depth goes in `notes`.
- Power:
  - `power_ports[].maximum_draw` is stored but never shown or summed.
  - There is no rack or group power budget (`3287-codebase.md` section 7).
  - As a result, the per-rack power checks in section 3 cannot be surfaced in the app.
- Console ports have no schema field of their own, and the in-app importer drops them (`3287-codebase.md` section 2). A pack can still list them as interfaces of the existing `console` type.
- Rack groups have no metadata (section 7).

## 7. Multi-rack starters

Verdict: the loader and the "+" menu accept a multi-rack template with rack groups and connections as-is. A POD starter still needs careful authoring and four small code changes before it ships.

What already works:

- Loading keeps groups and connections:
  - `LayoutSchemaInput` accepts `racks[]`, `rack_groups` and `connections` (`src/lib/schemas/index.ts:768-774`).
  - Store `loadLayout` keeps groups and connections, and remaps their ids only when an id had to be regenerated (`src/lib/stores/layout/layout-lifecycle.ts:128-138`, `:140-215`).
- The scale check loaded 4- to 71-rack files with row groups and up to 2,920 connections, through the same `parseLayoutYaml` that starters use, with no errors (section 8).
- Menu and typing:
  - The menu row already pluralises ("12 racks, 71 devices") through `starterRackSummary` (`src/lib/templates/starter-templates.ts:71-80`).
  - `StarterTemplateId` derives from `TEMPLATE_FILES`, so a `STARTER_COLOURS` entry is the only compile-time requirement (`src/lib/templates/starter-templates.ts:41-60`).
- CI parses every shipped template and checks that each placed device resolves to an embedded type (`src/tests/starter-templates.test.ts:112-136`).

Authoring rules (data only, but easy to get wrong):

- Write positions in internal units (U x 6), with an app `version` of 0.7.0 or later.
  - The three shipped starters store U values. They load only because each has a device at U1 to U5, which trips the legacy heuristic (`src/lib/schemas/migrations.ts:103-108`).
  - A 48U POD rack with nothing below U6 would fail the whole-U rule. At runtime the template silently drops out of the menu (`src/lib/templates/starter-templates.ts:98-119`), though the CI test above would catch it first.
- Embed every device type in `device_types`. A placement whose slug does not resolve is not rendered (`src/lib/components/Rack.svelte:583`).
- A pre-wired template must write out every `PlacedPort` and point `connections[]` at those ids. Ports are created on placement and duplication (for example `src/lib/stores/layout/device-actions.ts:124`), never on load.

Changes needed before a POD starter ships:

1. Lazy fetch.
   - `loadStarterTemplates` fetches every template in parallel the first time the menu opens (`src/lib/templates/starter-templates.ts:128-135`).
   - A one-SU template is about 400 KB at RA density, so the manifest needs per-template metadata (name, rack and device counts), with the file fetched only when it is selected.
2. Menu grouping. Starters sit in one flat "From template" group (`src/lib/components/NewLayoutMenu.svelte:93-116`). A separate "Data centre" group below the homelab starters keeps the default menu unchanged.
3. Command palette. Starter commands are hard-coded per id (`src/lib/actions/registry.ts:35-37`, `:493-515`, `src/lib/actions/dispatch.ts:203-206`). Generate them from the manifest.
4. Rack limit.
   - `MAX_RACKS = 10` (`src/lib/types/constants.ts:90`) is enforced only on the add, duplicate and bay paths.
   - A one-SU template (about 18 racks at RA density) loads, then refuses "Add rack" until the user deletes nine racks.
   - Raise the limit, or make it a warning.

Rack groups are one flat level:

- There is no SU, row-of-rows or POD hierarchy, and no group metadata such as a power budget or fabric.
- Unknown group fields survive in memory but are not written back on save (`docs/reference/SCHEMA.md:610`). A template therefore cannot carry SU metadata through `.passthrough()`.

## 8. Scale check

The full method and data are in [3287-scale.md](3287-scale.md).

The generated layouts:

- 4-node and 8-node BasePOD, at 2 DGX per rack;
- one SU at RA density: 32 DGX B200, 20 racks, 2,557 ports and 749 connections;
- 4 SU at RA density: 71 racks, 9,428 ports and 2,920 connections, close to the 69-rack reference build;
- denser variants at 4 DGX per rack (12 and 39 racks), and a control with no connections.

Each was measured on a production build in Chromium on an Apple M4, at 1x and 4x CPU throttle. Figures are medians of 3 runs.

| Layout | Racks | Load 1x | Load 4x | Longest task 4x | Select 4x | Zoom p95 4x | Pan p95 4x | Connections drawn |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BasePOD 8-node | 6 | 68 ms | 302 ms | 178 ms | 138 ms | 17.5 ms | 17.4 ms | 0 of 145 |
| One SU | 20 | 150 ms | 616 ms | 488 ms | 216 ms | 34.2 ms | 17.5 ms | 0 of 749 |
| 4 SU | 71 | 529 ms | 2,238 ms | 1,719 ms | 529 ms | 117.0 ms | 17.5 ms | 0 of 2,920 |

Verdict:

- BasePOD is comfortable.
- One SU loads and navigates acceptably today, although zoom falls to about 30 fps at 4x.
- 4 SU needs performance work before it ships as a template.

Flags before shipping:

- Pre-wired fabric draws nothing.
  - Every link either ends on a switch with more than 24 ports (grouped mode, with no anchors: `src/lib/utils/port-geometry.ts:33`) or crosses racks (#272).
  - The data loads and round-trips but is invisible, and its render cost is untested.
- The 25% zoom floor (`src/lib/stores/canvas.svelte.ts:34`, commented "allows fitting 6+ large racks") cannot frame one SU at 1600 px.
- 4 SU at 4x CPU:
  - It freezes the main thread for about 1.7 s on load.
  - Zoom runs at about 8 fps, and selecting a device takes more than 0.5 s.
  - Nothing culls or virtualises racks today.
- Every starter is fetched on the first "+" menu open, so a one-SU template would add about 400 KB to that fetch.
- Pan holds 60 fps at every size, because panzoom only moves a CSS transform.

## 9. Library fit

Verdict: a 10 to 15 device NVIDIA pack fits alongside the homelab packs without changing the default experience, as long as it ships as an ordinary brand pack and POD templates reuse its slugs.

- Browse, in the default Brand mode:
  - Generic is expanded first, then one collapsed accordion per pack in A-Z order (`src/lib/data/brandPacks/index.ts:184-199`).
  - An NVIDIA pack adds one collapsed row.
  - Under 30 devices, it renders as plain DOM rather than a virtual list (`src/lib/components/DevicePalette.svelte:65`).
- Category and A-Z modes: DGX nodes join Server, and switches join Network. The "4U+" height filter gains the 8U and 10U systems. These modes are opt-in and already mix 685 brand-pack devices.
- Search:
  - Fuse keys are model (weight 3), manufacturer (2), slug (1) and category (1), with threshold 0.3 (`src/lib/utils/deviceFilters.ts:72-82`).
  - Because category is a key, "server" already returns every server-category device.
  - 10 to 15 more rows against 685 is about 2 percent more noise. Generic terms such as "server" or "switch" will surface DGX and Spectrum rows next to homelab gear. No change is needed.
- Template interaction, observed in the scale check:
  - Embedded device types whose slugs are not in any brand pack appear in the layout's Generic section, even with `manufacturer: NVIDIA` (`src/lib/components/DevicePalette.svelte:303-322`). The scale-check layouts listed DGX B200, QM9700 and SN2201 under Generic.
  - If the pack ships first and templates reuse its slugs, those devices land in the NVIDIA section instead. That is one reason to ship the pack before POD templates.
- Gaps (`3287-codebase.md` section 9):
  - There is no pack hide setting, no brand filter, and no persisted collapse state.
  - This does not block one pack. It becomes a problem only if data-centre packs multiply.
- Bundle cost:
  - Brand packs are statically imported into the initial bundle, which has a gzip budget with about 30 KB of headroom (`3287-codebase.md` section 10).
  - A 15-device pack is a few KB gzipped. Images are separate hashed assets.

## 10. Image licensing

Verdict:

- Do not bundle NVIDIA product images.
- Ship the pack and templates with plain-text names, labelled colour blocks and a trademark notice.
- Get a Canadian legal check before shipping NVIDIA-named content. Only the US position was researched.

Evidence:

- NVIDIA's own terms rule out bundling:
  - The Terms of Service, updated 2026-07-15, allow downloads "for your personal, non-commercial internal use only" and forbid "any public display". They grant no copyright or trademark licence [41].
  - The brand guidelines forbid use "in any manner that isn't expressly authorized in writing by NVIDIA", and any implied affiliation [42].
  - The Networking terms allow reproduction "solely for editorial use by industry analysts", unaltered and credited [43].
  - A cropped, scaled panel in an open-source app meets none of these conditions.
- RA figures, including the rack layout renders, may be reproduced only "if approved in advance by NVIDIA in writing" [3][4]. Facts taken from them (U heights, counts, power) are data and can be used. The drawings cannot be copied.
- devicetype-library is CC0 [33], but its only NVIDIA-family images (the Nvidia SN2201 front and the Mellanox SN2100 front) look vendor-derived and state no source [34][35].
  - A CC0 dedication by someone who does not own the artwork does not clear it.
  - Exclude both.
- Rackula's current image sources are NetBox CC0 and "freely shareable" draw.io images. There is no precedent for vendor imagery under other terms (`3287-codebase.md` section 10).
- Names:
  - Plain-text "NVIDIA DGX B200" as manufacturer and model fits US nominative use: words only, no logo, no implied endorsement [45]. It is also what NetBox does.
  - The pack's section icon is a separate question. simple-icons ships an NVIDIA glyph, and other packs use vendor glyphs, but NVIDIA's guidelines explicitly cover its logo [42]. Use a neutral icon until the legal check clears it.

Fallback, in order of effort:

1. No images.
   - Devices render as labelled colour blocks when no image resolves (`3287-codebase.md` section 10), as the scale-check layouts showed.
   - Label display mode is already the starter default.
2. Rackula-drawn schematic panels, later.
   - SVG generated from the port inventory: OSFP cage blocks, QSFP112 pairs, RJ45 and PSU bays, labelled by port name, with no logos or photographic texture.
   - This is new pipeline work, because the image pipeline takes raster sources and writes WebP (`3287-codebase.md` section 10).
3. User photos. Users can still attach their own images per placement, and those stay in their own layouts.

Notice for ACKNOWLEDGEMENTS.md and the pack header: "NVIDIA, DGX, Quantum, Spectrum and BlueField are trademarks of NVIDIA Corporation. Rackula is not affiliated with or endorsed by NVIDIA."

## Follow-up issues

Filed from this spike:

| Issue | Title | Milestone | Phase |
| --- | --- | --- | --- |
| #3289 | feat: tolerant reader for unknown interface and port types | M003 | 1 |
| #3290 | feat: OSFP, QSFP112 and 800G OSFP interface types | M005 | 2 |
| #3291 | feat: NVIDIA DGX and fabric switch brand pack | M007 | 2 |
| #3292 | feat: lazy, grouped starter manifest with generated palette commands | M007 | 3 |
| #3293 | feat: raise the rack cap and lower the fit-all zoom floor for POD-scale layouts | M007 | 3 |
| #3294 | feat: POD template generator and DGX BasePOD starters | M007 | 3 |
| #3295 | feat: DGX SuperPOD B200 one-SU starter | M007 | 3 |
| #3296 | feat: pre-wired fabric variants of the DGX POD templates | M009 | 4 |
| #3297 | perf: cull off-screen racks so 4-SU layouts stay responsive | Backlog | Later |

Spike findings were also added as comments on these existing issues:

- #356: dense-port anchors (M009).
- #272: cross-rack drawing (M009).
- #2537: power totals. It is in Backlog; the comment suggests moving it to M009.
- #2627: millimetre depth (M021).

One decision stays with the maintainers: the Canadian trademark check, which must happen before #3291 ships.

## Sources

Numbering follows [3287-external.md](3287-external.md). Only sources cited in this document are listed; that file has the full list.

- [2] NVIDIA DGX SuperPOD documentation hub. https://docs.nvidia.com/dgx-superpod/
- [3] NVIDIA DGX BasePOD Reference Architecture featuring DGX B200, H200 and H100, RA-11127-001 V5. https://docs.nvidia.com/dgx-basepod/reference-architecture-infrastructure-foundation-enterprise-ai/latest/index.html
- [4] NVIDIA DGX SuperPOD Reference Architecture featuring DGX B200, RA-11334-001 V08. https://docs.nvidia.com/dgx-superpod/reference-architecture-scalable-infrastructure-b200/latest/index.html
- [5] NVIDIA DGX SuperPOD Reference Architecture, DGX H200, RA-11336-001 V2. https://docs.nvidia.com/dgx-superpod/reference-architecture/scalable-infrastructure-h200/latest/index.html
- [6] NVIDIA DGX SuperPOD Reference Architecture, DGX H100, RA-11333-001 V11. https://docs.nvidia.com/dgx-superpod/reference-architecture-scalable-infrastructure-h100/latest/index.html
- [7] NVIDIA SuperPOD DGX B300, Spectrum-4 Ethernet and DC Busbar Power RA, RA-11337-001 V01. https://docs.nvidia.com/dgx-superpod/reference-architecture/scalable-infrastructure-b300/latest/index.html
- [8] NVIDIA SuperPOD DGX B300, Quantum-X800 InfiniBand and AC Power RA, RA-11339-001 V01. https://docs.nvidia.com/dgx-superpod/reference-architecture/scalable-infrastructure-b300-xdr/latest/index.html
- [9] NVIDIA DGX SuperPOD Rubin NVL8, DGX SuperPOD Architecture. https://docs.nvidia.com/dgx-superpod/reference-architecture/scalable-infrastructure-rubinx86/latest/dgx-superpod-architecture.html
- [10] NVIDIA DGX SuperPOD and BasePOD Deployment Guides for DGX B200 and B300 with Mission Control. https://docs.nvidia.com/dgx-basepod/deployment-guides/dgx-basepod-b200/latest/index.html
- [11] Data Center Best Practices with DGX B200 (NVIDIA slide deck). https://docs.nvidia.com/dgx-pdf/nvidia-dgx-superpod-data-center-best-practices-with-dgx-b200.pdf
- [12] NVIDIA DGX B200 User Guide, Introduction. https://docs.nvidia.com/dgx/dgxb200-user-guide/introduction-to-dgxb200.html
- [13] NVIDIA DGX H100/H200 User Guide, Introduction. https://docs.nvidia.com/dgx/dgxh100-user-guide/introduction-to-dgxh100.html
- [14] NVIDIA DGX B300 User Guide, Introduction. https://docs.nvidia.com/dgx/dgxb300-user-guide/introduction-to-dgxb300.html
- [15] NVIDIA DGX BasePOD product page. https://www.nvidia.com/en-us/data-center/dgx-basepod/
- [16] Microway, NVIDIA DGX H100 (secondary). https://www.microway.com/product/nvidia-dgx-h100/
- [17] Boston Limited, End-of-Sale Alert: NVIDIA DGX H100 (secondary). https://www.facebook.com/bostonlimited/posts/end-of-sale-alert-nvidia-dgx-h100-products-starting-january-25-2025-nvidia-will-/1172433931554944/
- [19] QM97x0 hardware user manual, Specifications. https://networking-docs.nvidia.com/qm97x0hw/specifications
- [20] QM97x0 hardware user manual, Interfaces. https://networking-docs.nvidia.com/qm97x0hw/interfaces
- [22] NVIDIA Spectrum-3 SN4000 Hardware User Manual, Specifications. https://networking-docs.nvidia.com/sn4000hw/specifications
- [23] NVIDIA Spectrum SN4000 Series datasheet. https://www.nvidia.com/content/dam/en-zz/Solutions/networking/br-sn4000-series.pdf
- [24] NVIDIA SN5000 hardware user manual, Specifications. https://networking-docs.nvidia.com/sn5000hw/Specifications
- [25] SN2201 user manual, Specifications. https://networking-docs.nvidia.com/sn2201hw/specifications
- [26] SN2201 user manual, Interfaces. https://networking-docs.nvidia.com/sn2201hw/interfaces
- [27] NVIDIA UFM Enterprise Appliance (NDR) Hardware User Manual, Technical Specifications. https://networking-docs.nvidia.com/ufmenterprisendrhwum/technical-specifications
- [28] Reseller listings for MQM9700-NS2F (P2C) and MQM9700-NS2R (C2P) (secondary). https://www.serversupply.com/NETWORKING/SWITCH/64%20PORT/NVIDIA/920-9B210-00FN-0M0_391726.htm
- [30] NVIDIA MFP7E10-Nxxx Optical Multimode Fiber Cable Product Specifications. https://docs.nvidia.com/nvidia-mfp7e10-nxxx-optical-multimode-fiber-cable-product-specifications.pdf
- [32] netbox-community/devicetype-library, device-types/Nvidia and device-types/Mellanox. https://github.com/netbox-community/devicetype-library/tree/master/device-types/Nvidia
- [33] devicetype-library LICENSE.txt (CC0-1.0). https://github.com/netbox-community/devicetype-library/blob/master/LICENSE.txt
- [34] devicetype-library PR #3560, Add Nvidia Spectrum SN2201 switch. https://github.com/netbox-community/devicetype-library/pull/3560
- [35] devicetype-library PR #2865, Added Mellanox Switch SN2100 and its front-image. https://github.com/netbox-community/devicetype-library/pull/2865
- [36] NetBox `netbox/dcim/choices.py` (main). https://github.com/netbox-community/netbox/blob/main/netbox/dcim/choices.py
- [38] NetBox `netbox/dcim/models/device_component_templates.py` (InterfaceTemplate). https://github.com/netbox-community/netbox/blob/main/netbox/dcim/models/device_component_templates.py
- [39] NetBox releases and issues (#3619, #4476, #11429, #13245, #21387, #21480). https://github.com/netbox-community/netbox/releases
- [41] NVIDIA Terms of Service. https://www.nvidia.com/en-us/about-nvidia/terms-of-service/
- [42] NVIDIA Brand Guidelines, logo and brand usage. https://www.nvidia.com/en-eu/about-nvidia/legal-info/logo-brand-usage/
- [43] NVIDIA Networking Terms of Use. https://www.nvidia.com/en-us/networking/policy/terms/
- [45] Nominative use. https://en.wikipedia.org/wiki/Nominative_use
