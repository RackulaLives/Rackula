# Spike #3287: external research

Research date: 2026-09-13. Scope: NVIDIA DGX BasePOD and DGX SuperPOD (DGX B200, H200, H100) reference architectures (RAs) as Rackula device packs and templates. GB200 and GB300 NVL72 are out of scope. Values marked "derived" are my arithmetic from cited inputs, not NVIDIA statements. Values marked "secondary" come from resellers, press or third parties.

## 1. DGX generations

### Status as of September 2026

| System | Status | Evidence |
| --- | --- | --- |
| DGX B200 | Current. Product page live. Listed on the BasePOD product page. In BasePOD RA V5 and the SuperPOD B200 RA. Covered by the B200/B300 deployment guide updated 2026-09-10. No EOL or last-time-buy notice found. | [3][4][10][15][18] |
| DGX H200 | In BasePOD RA V5 and the SuperPOD H200 RA (page updated 2026-09-02). Product URL now 301-redirects to the generic DGX platform page. Not named on the BasePOD product page. No NVIDIA EOL notice found. Cisco's HGX H200 server (a partner product, not DGX) had last order date 2026-06-25 (secondary). | [3][5][15][18][61] |
| DGX H100 | End of sale: final purchases by 2025-01-25, with NVIDIA recommending DGX H200 (secondary). Product URL redirects to the DGX H200 URL. Still in BasePOD RA V5 and the SuperPOD H100 RA V11. | [3][6][16][17][18] |
| DGX B300 | Current. Product page live. Listed on the BasePOD product page. Covered by the B200/B300 deployment guide. Two SuperPOD RAs. Not in BasePOD RA V5. | [7][8][10][14][15] |
| DGX Rubin NVL8 | Listed on the BasePOD product page. SuperPOD RA published (page last updated 2026-05-05). Eight per rack at about 225 kW per rack. No BasePOD RA. Shipping status not confirmed from NVIDIA. | [9][15] |

### Does anything newer supersede B200, H200 and H100 in the RAs?

- BasePOD: the latest BasePOD RA is still RA-11127-001 V5 (2025-08-06), covering DGX B200, H200 and H100 only [3]. No BasePOD RA for B300 or Rubin was found. However, NVIDIA's BasePOD product page now names only DGX Rubin NVL8, DGX B300 and DGX B200 (no Hopper) [15]. The deployment guide covers B200 and B300 with Mission Control [10].
- SuperPOD: B300 has two RAs (72-node SU, four DGX B300 per rack at about 56 kW) [7][8]. Rubin NVL8 has one (72-node SU, eight per rack at about 225 kW) [9]. The B200, H200 and H100 RAs remain listed and are not marked superseded [2].

### RA documents

| Document | Number and version | Publication date | Web page last updated |
| --- | --- | --- | --- |
| DGX BasePOD RA, DGX B200, H200 and H100 ("Infrastructure Foundation for Enterprise AI") | RA-11127-001 V5 | 2025-08-06 (PDF built 2025-08-20) | not shown |
| DGX SuperPOD RA, DGX B200 | RA-11334-001 V08 | 2025-04-24 | not shown |
| DGX SuperPOD RA, DGX H200 | RA-11336-001 V2 | 2025-04-14 | 2026-09-02 |
| DGX SuperPOD RA, DGX H100 | RA-11333-001 V11 | not found (PDF created 2024-04-17) | 2025-11-19 |
| SuperPOD with DGX B300, Spectrum-4 Ethernet and DC busbar | RA-11337-001 V01 | 2025-05-29 | 2025-11-19 |
| SuperPOD with DGX B300, Quantum-X800 InfiniBand and AC power | RA-11339-001 V01 | 2025-07-23 | 2026-09-02 |
| DGX SuperPOD Rubin NVL8 | not found | not found | 2026-05-05 |
| SuperPOD and BasePOD deployment guides for DGX B200 and B300 with Mission Control | not stated | not stated | 2026-09-10 |
| Data Center Best Practices with DGX B200 (slide deck) | n/a | PDF created 2024-06-07 | n/a |

Sources for the table: [1][2][3][4][5][6][7][8][9][10][11].

### Recommendation

1. Ship DGX B200 first, with the BasePOD RA V5 switch set (QM9700, SN4600C, SN2201) and the SuperPOD B200 extras (SN5600, UFM appliance). Reasons:
   - It is current, and it is the only system in both the BasePOD RA and a live SuperPOD RA.
   - It is air-cooled, AC-powered and fits a standard 19-inch rack.
   - It has a published rack power profile: two per rack at 28.6 kW [11].
   - Its switches are the same as the Hopper builds.
2. Add DGX H200 and DGX H100 in the same pass. They share one chassis spec (8U, 10.2 kW max, identical ports) and the same fabric, so they cost two device types and no new switches [13]. H100 is end of sale but has a large installed base.
3. DGX B300 next, as its own pack. It needs ConnectX-8 800G OSFP ports and 12 PSUs. Its RAs use different switches (Quantum-X800 Q3400-RA or Spectrum-4 SN5610/SN5600D), a 72-node SU and four per rack at about 56 kW [8][14]. There is no BasePOD RA for it yet.
4. Defer DGX Rubin NVL8. It is liquid-cooled at about 225 kW per rack [9], far outside homelab and most enterprise rooms.

## 2. Hardware bill

Conventions: depth and width in mm, weight in kg, power in kW. For switches, "P2C" is power-to-connector airflow ("forward": air enters at the PSU side and exits at the port side). "C2P" is the reverse [28]. In NetBox device-relative terms, with the port side as the front, P2C is `rear-to-front`.

### DGX B200

| U | Depth | Width | Weight | Max power | PSUs | Airflow |
| --- | --- | --- | --- | --- | --- | --- |
| 10 (444 mm) | 897.1 | 482.3 | 142.4 max [12] (deck says ">130 kg" estimated [11]) | 14.3 [12] | 6 x 3.3 kW, 200-240 V, 16 A, 5+1 redundancy, six locking C19/C20 cords [12] | 1,550 CFM; direction not stated in the B200 guide |

| Port class | Count | Cage | Speed | Notes |
| --- | --- | --- | --- | --- |
| Compute fabric | 4 cages, 8 logical ports (OSFP1P1 to OSFP4P2) | OSFP, twin-port | 8 x 400G, NDR InfiniBand by default or 400GbE | Eight single-port ConnectX-7 cards on two network module trays, joined to the dual-port OSFP cages by internal DensiLink cables [12]. The RA uses flat-top 2x400G twin-port transceivers on the DGX [3]. |
| Storage and in-band | 2 cards, 4 ports | QSFP112 | Each card: 1 Ethernet port (up to 400GbE) and 1 InfiniBand port (up to 400G) | Two dual-port BlueField-3 DPUs in NIC mode [3][12]. SuperPOD Figure 4.1 labels one port per card "In-Band Management" and the other "Storage Single Port QSFP" [4]. |
| In-band system management | 2 ports + 1 port | not stated; RJ45 | 100GbE; 10GbE | "Dual port 100GbE in slot 3 and 10 GbE RJ45 interface" [12]. The LAN port next to the BMC is not used in SuperPOD [4]. |
| BMC | 1 | RJ45 | 1GbE | Out-of-band [12] |
| Console | not stated |  |  | RA Figure 3.2 shows USB, VGA and a serial connector on the rear I/O (identified by eye) [3] |

### DGX H200 and DGX H100 (same chassis)

| U | Depth | Width | Weight | Max power | PSUs | Airflow |
| --- | --- | --- | --- | --- | --- | --- |
| 8 (356 mm) | 897.1 | 482.3 | 130.45 max | 10.2 | 6 x 3.3 kW, 200-240 V, 16 A, 4+2 redundancy, C19/C20 locking cords | 1,105 CFM front-to-back at 80% fan PWM |

Source for both tables: [13]. The only difference between H200 and H100 is GPU memory (1,128 GB versus 640 GB) [13].

| Port class | Count | Cage | Speed | Notes |
| --- | --- | --- | --- | --- |
| Compute fabric | 4 cages, 8 logical ports | OSFP, twin-port | 8 x 400G NDR | Eight single-port ConnectX-7 cards via DensiLink, each cable carrying two ports [13][3] |
| Storage and in-band | 2 cards, 4 ports | QSFP112 | up to 400GbE, Ethernet by default | Two dual-port ConnectX-7 cards [3][13] |
| In-band system management | 2 ports + 1 port | not stated; RJ45 | 100GbE; 10GbE | "Dual port 100GbE in slot 3 and 10 GbE RJ45 interface" [13] |
| BMC | 1 | RJ45 | 1GbE | [13] |
| Console | not stated |  |  | RA Figure 3.4 shows the same rear I/O as B200 [3] |

### DGX B300 (appears only in the B300 SuperPOD RAs and the deployment guide)

| U | Depth | Width | Weight | Max power | PSUs | Airflow |
| --- | --- | --- | --- | --- | --- | --- |
| 10 (442 mm) | 904.2 | 482.6 | 168 (PSU version), 123 (busbar version) | 14.5 | 12 x 3.2 kW N+N at 200-240 VAC, or 54 VDC busbar | 1,500 CFM (PSU), 1,350 CFM (busbar) |

Ports: 8 OSFP cages for 8 ConnectX-8 cards at 800G InfiniBand or Ethernet; 2 dual-port BlueField-3 (2 x 400G, cage not confirmed); 1GbE RJ45 BMC; 1GbE RJ45 host port [14].

### NVIDIA QM9700 and QM9790 (compute and storage InfiniBand)

| U | Depth | Width | Weight | Max power | PSUs | Airflow |
| --- | --- | --- | --- | --- | --- | --- |
| 1 (43.6 mm) | 660 | 438 | 14.8 (2 PSUs), 13.6 (1 PSU) | QM9700 1.72 with active cables (0.747 typical, passive); QM9790 1.61 (0.64 typical) | 1 or 2, 200-240 Vac, 10 A | P2C or C2P. The RA part 920-9B210-00FN-0M0 is MQM9700-NS2F, managed, P2C (secondary). |

Sources: [19][3][28]. The spec page swaps the H and W labels on the dimensions [19].

| Port class | Count | Cage | Speed | Notes |
| --- | --- | --- | --- | --- |
| Data | 32 cages, 64 ports | OSFP, twin-port | NDR 400G per port (40 to 400G) | "Each OSFP port consists of 2 logical InfiniBand ports" [20] |
| Management | 1 | RJ45 | 10/100/1000 | On the front (port side) [20] |
| Console | 1 | RJ45 (RS232) |  | Front [20] |
| USB | 1 | USB-A |  | Front [20] |

QM9700 has an on-board subnet manager. QM9790 is externally managed through UFM [21]. The manual footnotes exceptions to the management ports for some managed variants; the QM9790 port list is not verified.

### NVIDIA SN4600C (BasePOD in-band and storage Ethernet)

| U | Depth | Width | Weight | Max power | PSUs | Airflow |
| --- | --- | --- | --- | --- | --- | --- |
| 2 (88 mm) | 566.4 (manual) or 568.5 (datasheet) | 428 | 14.64 | not found (0.466 typical, passive) | 2, hot-swap 1+1, 100-264 VAC | Reversible. The RA part 920-9N302-00F7-0C2 is P2C. |

Sources: [22][23][3].

Ports: 64 x QSFP28 at 1/10/25/40/50/100GbE; 1 x 100/1000 RJ45 management; 1 x RJ45 serial; 1 x USB [22][23].

### NVIDIA SN4600 (BasePOD Ethernet storage option)

2U, same chassis and PSUs as SN4600C, 14.64 kg, 0.6 kW typical with passive cables, max not found [22][23]. Ports: 64 x QSFP56 at 200GbE per the datasheet [23], plus the same management, serial and USB set [23]. BasePOD RA 3.3.2 says SN4600 switches are also used for Ethernet storage [3].

### NVIDIA SN5600 (SuperPOD B200 in-band spine and leaf, Ethernet storage)

| U | Depth | Width | Weight | Max power | PSUs | Airflow |
| --- | --- | --- | --- | --- | --- | --- |
| 2 (88 mm) | 720 (745 with fan levers) | 438 | 23.5 | not found (0.94 typical, passive) | 1 or 2, 220-240 VAC | not stated; devicetype-library says rear-to-front |

Ports: 64 x OSFP at 10 to 800GbE, plus 1 x SFP28 at 1/10/25G [24]. Management RJ45 and console RJ45 come from devicetype-library only [32].

SN5610 (B300 RAs only): 2U, 775 mm deep, 26.9 kg, 64 x OSFP 800G plus 2 x SFP28, 0.9 kW typical, 2.08 kW with 64 optical modules [24]. Quantum-X800 Q3400-RA is used only in the B300 XDR RA [8]; I did not collect its specs.

### NVIDIA SN2201 (out-of-band, and SuperPOD in-band leaf)

| U | Depth | Width | Weight | Max power | PSUs | Airflow |
| --- | --- | --- | --- | --- | --- | --- |
| 1 (43.9 mm) | 432 | 428 | 7.41 | not found (0.098 typical) | 2 inputs: 100-127 Vac at 4 A or 200-240 Vac at 2 A | The RA part 920-9N110-00F1-0C0 is P2C |

Sources: [25][3].

Ports: 48 x RJ45 1GbE and 4 x QSFP28 100GbE [25]. Also an RJ45 "MGT" port (100M/1G), an RS232 "Console" port with no connector type stated, and USB 2.0 [26]. The SN2201_M variant is DC-powered (40-60 V), 781 mm deep and 11.39 kg [25].

### SN3420

SN3420 is not used by any in-scope RA. BasePOD V5 uses SN4600C and SN2201 [3]. SuperPOD B200 uses SN5600 and SN2201 [4].

### Control-plane and management nodes

- BasePOD: five dual-socket x86 servers. Two are Base Command Manager head nodes; three host services such as Slurm login or Kubernetes. "Any OEM server that meets the minimum requirements" can be used [3].
  - Minimum spec per server: 2 x Intel Xeon Gold or better, 512 GB memory, 1 x 6.4 TB NVMe, 2 x 480 GB M.2 RAID for the OS, 4 x 200 Gbps network and 2 x 100 GbE network (RA section 3.4) [3].
  - Form factor, U height and power are not stated.
- SuperPOD B200: Figure 3.2 shows 7 management nodes; no spec is given [4].
- SuperPOD H100, Table 7: 4 BCM management servers, "Intel based x86 2 x Socket, 24 core or greater, 384 GB RAM, OS (2x480GB M.2 or SATA/SAS SSD in RAID 1), NVME 7.68 TB (raw), 4x HDR200 VPI Ports, TPM 2.0" [6].
- SuperPOD B300 XDR: 2 BCM HA nodes, 3 Kubernetes management nodes and 2 Slurm login nodes, all AC EIA form factor for the PDU variant [8].

### UFM appliance

- BasePOD RA V5 has no UFM [3].
- SuperPOD B200 lists "NVIDIA Unified Fabric Manager Appliance, Enterprise Edition" (Table 2.1). Figure 3.2 shows 2 compute UFMs and 2 storage UFMs [4].
- One UFM displaces one DGX in SU 1, which is why a full SU has 31 nodes (Table 4.1 footnote) [4].
- UFM Enterprise Appliance (NDR): 1U (42.8 mm), 809 mm deep, 482 mm wide, 17 kg, 1+1 1,100 W PSUs, 0.689 kW max, 52.1 CFM [27]. Port inventory not found.

### Storage

- The BasePOD RA names no storage vendor, only "NVIDIA validated storage partners" [3].
- The BasePOD product page names DDN, Dell PowerScale, HPE GreenLake for File Storage, Hitachi Vantara iQ, IBM Storage Scale System, NetApp, Pure Storage FlashBlade//S (AIRI), VAST Data and WEKA [15]. None are NVIDIA-branded.
- SuperPOD-certified storage suppliers were reported in 2024 as DDN, Dell PowerScale, IBM Storage Scale System 6000, NetApp EF600, VAST Data and WEKA (secondary) [47].
- SuperPOD B200 has two storage systems [4]:
  - High-performance storage from a certified partner, over InfiniBand (QM9700 storage fabric) or RoCE (SN5600). Each DGX needs at least 40 GBps.
  - NFS user storage on the in-band network, at 100 Gb/s minimum.
- The partner sets the storage topology and components [4].
- No in-scope RA states a rack-unit footprint for storage. SuperPOD B200 Figure 3.2 mentions storage arrays in its text but none are drawn [4].

### PDUs and power

- BasePOD RA V5: no PDU model, voltage, phase or rack budget [3].
- SuperPOD B200 RA: per-rack consumption "exceeds 25 kW". Figure 3.1 draws three PDUs in each compute rack [4].
- Data Center Best Practices with DGX B200 [11], "DGX B200 Rack Power Profiles" and "Power Provisioning" slides:
  - Use N provisioning with two circuits, each rated for 50% of rack peak.
  - Two B200 per rack: 28.6 kW, 42U (52U recommended and shown), 2 x 380 V 3-phase 32 A, 4,290 CFM.
  - Four B200 per rack: 57.2 kW, 52U, 2 x 415 V 3-phase 60 A, 8,580 CFM, for high-density sites only.
  - Racks must be EIA-310, at least 600 x 1100 mm and at least 48U. NVIDIA recommends 700 x 1200 mm x 52U (FAQ slide). This contradicts the 42U figure above.
  - NVIDIA names no PDU brand. It recommends switched, metered, networked rPDUs with locking receptacles.
  - One SU draws 458 kW.
- SuperPOD H100 RA, Table 7 [6]:
  - 38 Legrand NVIDPD13 racks.
  - 96 Raritan PX3-5878I2R-P1Q2R1A15D5 and 12 Raritan PX3-5747V-V2. By my arithmetic, that is 3 PDUs per compute rack across 32 compute racks and 2 per management rack across 6.
  - The exact PDU spec was not found. The nearest Raritan sheet (PX3-5878I2R-P1Q1R1A5D5) is 415 V 3-phase 60 A input, 18 x C19 plus 6 x C13, 34.5 kVA [31].
- SuperPOD B300 XDR: three 2U PDUs per rack, about 56 kW per rack [8].

## 3. Rack elevations and power

### BasePOD

- BasePOD RA V5 has no rack elevation figures for 4-node or 8-node builds [3]. Its figures are:
  - product images;
  - rear-port diagrams (Figures 3.2 and 3.4);
  - one logical diagram (Figure 4.1, "DGX BasePOD with up to eight systems with NDR400").
- Table 4.2 gives counts only. Rack size, U positions and a per-rack budget are "not found".
- The Pure Storage (Everpure) AIRI BasePOD guide reuses the logical diagram as its Figure 10 and has no elevation either [46].

Derived per-build power, using DGX max figures and switch figures:

- QM9700: max (1.72 kW each).
- SN4600C: typical (0.466 kW each), because its max was not found.
- SN2201: typical (0.098 kW each).
- Control-plane power is unknown and excluded.

| Build | DGX | DGX kW | Switch kW | Total kW, excluding 5 control-plane nodes |
| --- | --- | --- | --- | --- |
| BasePOD, 4 x B200 | 4 | 57.2 | 4.47 | 61.7 |
| BasePOD, 8 x B200 | 8 | 114.4 | 4.57 | 119.0 |
| BasePOD, 4 x H100/H200 | 4 | 40.8 | 4.47 | 45.3 |
| BasePOD, 8 x H100/H200 | 8 | 81.6 | 4.57 | 86.2 |

Rack fit (derived):

- B200, two per rack: 28.6 kW per rack. This fits NVIDIA's 2 x 380 V 32 A profile with 3.4 kW headroom at 80% breaker derating [11]. A 4-node build needs 2 compute racks; an 8-node build needs 4.
- B200, four per rack: 57.2 kW in 52U [11]. A 4-node build fits one rack and an 8-node build two. This is the density a homelab-style "one rack" starter implies, and NVIDIA restricts it to specialised sites.
- Four B200 take 40U before PDUs, so a 42U or 48U rack cannot also hold the switches.
- H100/H200: the H100 RA allows 1, 2 or 4 per rack, and its example exceeds 40 kW per rack [6]. Four per rack is 40.8 kW, so a 4-node build fits one rack and an 8-node build two.
- The H200 RA says two per rack (20.4 kW by arithmetic) but also says per-rack consumption "exceeds 25 kW" [5]. The same RA also calls the H200 a Blackwell GPU, which suggests text copied from the B200 RA.
- Network and control rack: 2 QM9700 (2U), 2 SN4600C (4U) and 1 or 2 SN2201 (1 to 2U) come to 7 to 8U. Add five control-plane nodes (height not stated), partner storage and PDUs. Switch power is about 4.5 kW before servers.

### SuperPOD with DGX B200

- SU composition: 32 DGX B200 per SU, fully tested to 4 SU, two DGX B200 per rack (section 2.5.1) [4].
- Figure 3.1, "Complete single SU rack layout", printed page 12: 16 racks in two rows of 8. Each rack holds 2 DGX B200 and 3 PDUs in the top half; no switches sit in compute racks (read from the figure) [4]. Rack height is not labelled.
- Compute rack power: 2 x 14.3 = 28.6 kW, matching "exceeds 25 kW" in the RA and 28.6 kW in the deck [4][11]. SU compute power: 32 x 14.3 = 457.6 kW; the deck says 458 kW [11].
- Figure 3.2, "Management rack configuration", printed page 13: five racks. Group labels span rack pairs [4]:
  - Racks 1 and 2: 16 x QM9700 compute leaves, 2 x compute UFMs, 16 x QM9700 compute spines.
  - Racks 3 and 4: 16 x QM9700 compute leaves, 2 x SN5600 in-band spines, 2 x SN5600 in-band leaves, 2 x storage UFMs, 2 x SN2201 in-band leaves, 7 x management nodes.
  - Rack 5: 8 x QM9700 storage leaves, 4 x QM9700 storage spines, 16 x SN2201 out-of-band leaves.
  - U positions and rack size are not labelled.
- Derived management rack power, using QM9700 max, SN5600 and SN2201 typical, UFM max:
  - Racks 1 and 2: 56.4 kW, about 28.2 kW each.
  - Racks 3 and 4: 32.9 kW plus 7 management nodes (not stated).
  - Rack 5: 22.2 kW.
  - Total: 111.5 kW plus the management nodes.
- 4-SU reference build, stated [4]:
  - 127 DGX B200 and 1,016 GPUs.
  - 32 compute leaf switches and 16 compute spine switches.
  - 1,020 compute and UFM cables, and 1,024 spine-to-leaf cables (Table 4.1).
  - Storage fabric: 8 leaves and 4 spines (Figure 3.2).
- 4-SU reference build, derived:
  - DGX power: 127 x 14.3 = 1,816 kW.
  - About 1.93 MW including the management racks, before management nodes and storage.
  - 64 compute racks (63 with two DGX, one with one) plus 5 management racks, 69 in total. The RA does not state a rack total.
- Table 3.1 idealises 4 SU as 128 nodes with 1,024 and 1,024 cables. Table 4.1 uses 127 nodes because of the UFM displacement [4].
- Cables per SU are stated only for the compute fabric. At 1 SU: 8 leaves, 4 spines, 252 compute and UFM cables, 256 spine-to-leaf cables (Table 4.1) [4]. Storage, in-band and OOB cable counts per SU are "not found".

## 4. NetBox devicetype-library

I searched the full repository tree (not truncated) on 2026-09-13 for "dgx", "hgx", "h100", "h200", "b200", "b300", "gb200", "nvidia" and "mellanox", plus common HGX server model names [32].

| File | u_height | is_full_depth | airflow | weight | Interfaces by type | Console | Power ports | Images |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Nvidia/QM9700.yaml | 1 | true | rear-to-front | 14.8 kg | 62 x 400gbase-x-osfp (P0.0 to P31.1; P22.1 and P23.0 missing) | 1 x rj-45 (uart) | none (2 PSU module-bays) | none |
| Nvidia/SN2201.yaml | 1 | false | not set | 7.41 kg | 49 x 1000base-t (eth0 not flagged mgmt_only), 4 x 100gbase-x-qsfp28 | 1 x usb-mini-a | none (2 PSU module-bays) | front |
| Nvidia/SN3420.yml | 1 | true | not set | 8.5 kg | 1 x 1000base-t, 48 x 25gbase-x-sfp28, 12 x 100gbase-x-qsfp28 | 1 x rj-45 | none (2 PSU module-bays) | none |
| Nvidia/SN5600.yaml | 2 | true | rear-to-front | 23.5 kg | 1 x 1000base-t (mgmt_only), 64 x 800gbase-x-osfp (SFP28 port 65 missing) | 1 x rj-45 | none (2 PSU module-bays) | none |
| Mellanox/QM8790.yaml | 1 | true | not set | 11.4 kg | 40 x 200gbase-x-qsfp56 | none | none (2 PSU module-bays) | none |
| Mellanox/SN4600.yml | 2 | true | not set | not set | 1 x 1000base-t (mgmt_only), 64 x 200gbase-x-qsfp56 | 1 x rj-45 | 2 x iec-60320-c14 | none |
| Mellanox/SN4600C.yml | 2 | true | not set | not set | 1 x 1000base-t (mgmt_only), 64 x 100gbase-x-qsfp28 | 1 x rj-45 | 2 x iec-60320-c14 | none |

- Not present: QM9790, and any DGX H100, H200, B200 or B300, or HGX baseboard system, under any vendor. The only DGX entry is Nvidia/DGX-Spark.yaml, a desktop.
- The nearest 8-GPU server is Lenovo/ThinkSystem-SR680a-v3.yaml [60]: 8U, full depth, front-to-rear, 102.9 kg, 8 PSU module-bays, front and rear images.
- module-types/Nvidia has three NIC modules (MCX755106AS-HEAT, MCX753436MS-HEAB, 08P2T2), which I did not inspect.
- Images: the only NVIDIA or Mellanox elevation images are elevation-images/Nvidia/nvidia-sn2201.front.png and elevation-images/Mellanox/mellanox-sn2100.front.png. Neither vendor has any rear image.
- InfiniBand modelling:
  - QM9700 is 64 logical ports named per cage half (Px.0, Px.1). It uses the Ethernet OSFP type `400gbase-x-osfp`, not an InfiniBand type.
  - QM8790 (HDR InfiniBand) uses `200gbase-x-qsfp56`.
  - None of these files uses an `infiniband-*` type.
- Licence:
  - The repository is CC0-1.0 (LICENSE.txt) [33]. The README defines the `front_image` and `rear_image` flags but gives no separate image licence, and no image carries a per-file licence.
  - PR #3560, which added the SN2201 and its image, states no image source [34]. By inspection the image is a low-resolution product photo showing the NVIDIA logo.
  - PR #2865 (SN2100) says "I could only find a stencil containing the front-image", meaning vendor artwork; the Mellanox logo is visible [35].
  - A CC0 dedication by a contributor who does not own the artwork does not clear the vendor's copyright, so treat both images as vendor-derived with unclear provenance.

## 5. NetBox interface types

Strings are copied from netbox-community/netbox `main`, `netbox/dcim/choices.py`, InterfaceTypeChoices, as of 2026-09-13 [36]. "First release" is the earliest tag containing the adding commit, checked with the GitHub compare API [39].

| Group | String | Label | First release (commit or issue) |
| --- | --- | --- | --- |
| OSFP 400G | `400gbase-x-osfp` | OSFP (400GE) | v2.7.0 (#3619) |
| OSFP 400G, riding heat sink | `400gbase-x-osfp-rhs` | OSFP-RHS (400GE) | v3.6.2 (#13245) |
| OSFP 800G | `800gbase-x-osfp` | OSFP (800GE) | v3.4.3 (#11429) |
| OSFP 1.6T | `1.6tbase-x-osfp1600`, `1.6tbase-x-osfp1600-rhs` | OSFP1600 (1.6TE), OSFP1600-RHS (1.6TE) | v4.5.6 (#21480, PR #21723) |
| QSFP112 | `400gbase-x-qsfp112` | QSFP112 (400GE) | v3.6.2 (#13245) |
| QSFP-DD 800G | `800gbase-x-qsfpdd` | QSFP-DD (800GE) | v3.4.3 (#11429) |
| QSFP-DD 1.6T | `1.6tbase-x-qsfpdd1600` | QSFP-DD1600 (1.6TE) | v4.5.6 (#21480) |
| InfiniBand 1X | `infiniband-sdr`, `infiniband-ddr`, `infiniband-qdr`, `infiniband-fdr10`, `infiniband-fdr`, `infiniband-edr`, `infiniband-hdr`, `infiniband-ndr`, `infiniband-xdr` | SDR (2 Gbps), DDR (4 Gbps), QDR (8 Gbps), FDR10 (10 Gbps), FDR (13.5 Gbps), EDR (25 Gbps), HDR (50 Gbps), NDR (100 Gbps), XDR (200 Gbps) | Present in NetBox 2.x; current slugs fixed in v2.8.0 (#4476) |
| InfiniBand 4X | `infiniband-sdr-4x`, `infiniband-ddr-4x`, `infiniband-qdr-4x`, `infiniband-fdr10-4x`, `infiniband-fdr-4x`, `infiniband-edr-4x`, `infiniband-hdr-4x`, `infiniband-ndr-4x`, `infiniband-xdr-4x` | SDR 4X (8 Gbps) up to NDR 4X (400 Gbps) and XDR 4X (800 Gbps) | v4.6.9, released 2026-08-25 (#21387, PR #23016) |

Notes:

- The original InfiniBand strings are per-lane (1X). A 400G NDR port is `infiniband-ndr-4x`, not `infiniband-ndr` (100 Gbps).
- The 1X group was relabelled when the 4X group was added. For example, XDR was "XDR (250 Gbps)" in v4.0.0 and is now "XDR (200 Gbps)".
- The 4X strings only exist from v4.6.9. A pack using them would not import into older NetBox, which is why devicetype-library still uses `400gbase-x-osfp` for QM9700.
- NetBox has no single type for a twin-port OSFP cage. The library convention is two interfaces per cage.
- Speed field: the Interface model has a separate `speed` field (Kbps, PositiveBigIntegerField) [37]. InterfaceTemplate, which device types use, has no speed field [38]. In device types, speed is carried by the type string alone.
- Minimum additions for Rackula's InterfaceTypeSchema:
  - DGX B200/H100 compute: `400gbase-x-osfp` or `infiniband-ndr-4x`.
  - BlueField-3 and ConnectX-7 storage and in-band: `400gbase-x-qsfp112`.
  - SN5600: `800gbase-x-osfp`.
  - DGX B300 later: `800gbase-x-osfp` or `infiniband-xdr-4x`.

## 6. Image and trademark licensing

- NVIDIA Terms of Service (last updated 2026-07-15) [41]:
  - Section 3.1: materials may be downloaded "for your personal, non-commercial internal use only".
  - Section 3.2: users may not "modify the Site or use it for any commercial purpose, or any public display".
  - Section 4: grants no licence "under any patent, copyright, trademark".
  - Trademarks: "You may not use NVIDIA's trademarks without NVIDIA's prior written permission". "Fair use of NVIDIA's trademarks in advertising and promotion of NVIDIA products requires proper acknowledgment."
- NVIDIA brand guidelines [42]:
  - "These assets may not be used in any manner that isn't expressly authorized in writing by NVIDIA."
  - "Do not use NVIDIA branding (logo, names, visual style) in any way that implies affiliation, endorsements, or sponsorship that isn't approved or where the relationship doesn't exist."
  - "Do not appropriate NVIDIA intellectual trademarks (logo, names) with your own names, brands, logos, website, slogan, or design."
- NVIDIA Networking Terms of Use [43]:
  - Reproduction is allowed "solely for editorial use by industry analysts", not to promote or sell a product.
  - Notices must be retained, material credited "Courtesy of NVIDIA", and nothing altered.
  - A Rackula elevation (cropped and scaled product art in an app) meets none of these conditions.
- NVIDIA Newsroom media assets require a login; I could not read their terms [44].
- RA documents: "Reproduction of information in this document is permissible only if approved in advance by NVIDIA in writing, reproduced without alteration" (Notices) [3][4]. RA figures, including the rack layout renders, cannot be copied. Plain facts from them (U heights, counts, power) are data, not expression.
- Nominative use: US law allows naming another party's product when necessary, using only as much of the mark as needed (words, not logo or font) and implying no endorsement (New Kids on the Block test) [45]. NetBox devicetype-library uses "Nvidia" and "QM9700" as manufacturer and model on this basis. Naming devices "NVIDIA DGX B200" as plain text fits that test. The Canadian position was not researched.
- devicetype-library images: neither NVIDIA nor Mellanox image carries a licence other than the repository CC0, and both look vendor-derived (see section 4).

Verdict:

- Do not ship NVIDIA product photos, RA figures, or the devicetype-library SN2201 and SN2100 images.
- Use product names as plain-text device names, with no logos and no NVIDIA visual style.
- Add a trademark attribution line ("NVIDIA, DGX and Quantum are trademarks of NVIDIA Corporation"), and state that Rackula is not affiliated with NVIDIA.

Fallback: Rackula draws its own schematic front and rear panels. These are generated SVG from the port inventory: OSFP cage blocks, QSFP112 pairs, RJ45 and PSU bays, labelled by port name, drawn from the dimensions and port counts in section 2. No logos and no photographic texture.

## 7. Cabling scale

### BasePOD bill (RA V5, Table 4.2, printed page 13) [3]

| Item | Part | 4 nodes | 8 nodes |
| --- | --- | --- | --- |
| QM9700 switch | 920-9B210-00FN-0M0 | 2 | 2 |
| NDR fibre, 400 Gbps, DGX to IB switches | 980-9I570-00N030 | 16 | 32 |
| 2x400G OSFP flat-top multimode transceivers on DGX | 980-9I51A-00NS00 | 16 | 32 |
| 2x400G OSFP finned-top multimode transceivers on switches | 980-9I510-00NS00 | 16 | 32 |
| NDR DAC for switch ISL | 980-9IA0J-00N002 | 8 | 16 |
| SN2201, 48 RJ45, P2C | 920-9N110-00F1-0C0 | 1 | 2 |
| SN4600C, 64 QSFP28, P2C | 920-9N302-00F7-0C2 | 2 | 2 |
| 1 GbE Cat 6 | n/a | 29 | 45 |
| 100GbE AOC 30 m, DGX to in-band | 980-9I13N-00C030 | 8 | 16 |
| 100G QSFP passive, in-band ISL | 980-9I54C-00V001 | 2 | 2 |
| 100GbE AOC 10 m, OOB to in-band | 980-9I13N-00C010 | 2 | 4 |
| BCM management servers | varies | 5 | 5 |
| 100GbE AOC 10 m, management servers to in-band | 980-9I13N-00C010 | 10 | 10 |

Observations:

- The fibre count does not match the link count. The RA says each node uses "eight compute connections" at NDR400, so 8 nodes means 64 links. 980-9I570-00N030 (MFP7E10-N030) is a single MPO-12 cable carrying one 400G link [30]. The table's 32 equals the number of twin-port transceivers, not links.
- The SuperPOD H100 cable bill counts one cable per link: 2,040 NDR cables = 1,016 node-to-leaf + 1,024 leaf-to-spine [6]. That supports reading BasePOD's 32 as cage-level (or an error). Treat 64 fibre runs as the physical count.
- The ISL DAC is MCP4Y10-N002, a twin-port 2x400G OSFP passive DAC [29]. So 16 DACs carry 32 NDR ISL links, and 8 carry 16.
- The table has no storage cables. They are partner-specific.

Rackula connection counts for a pre-wired BasePOD template (derived):

| Scope | 4 nodes, cage-level | 4 nodes, link-level | 8 nodes, cage-level | 8 nodes, link-level |
| --- | --- | --- | --- | --- |
| Compute, DGX to QM9700 | 16 | 32 | 32 | 64 |
| Compute ISL | 8 | 16 | 16 | 32 |
| In-band (DGX, management servers, ISL, OOB uplinks) | 22 | 22 | 32 | 32 |
| OOB Cat 6 | 29 | 29 | 45 | 45 |
| Total, excluding storage | 75 | 99 | 125 | 173 |

### SuperPOD per SU

- Stated for DGX B200, compute fabric only [4]:
  - 1 SU: 31 nodes, 252 compute and UFM cables, 256 spine-to-leaf cables.
  - 4 SU: 1,020 and 1,024 cables (Table 4.1).
- Derived for a full 32-node B200 SU:
  - 256 node-to-leaf and 256 leaf-to-spine InfiniBand links.
  - 64 in-band links: two per DGX, since in-band connections "operate at 200 Gbps and are bonded" [4].
  - 64 storage links: one storage port per DPU.
  - At least 32 BMC links, plus switch management and 48 PDU links (16 racks x 3 PDUs).
  - That totals roughly 700 to 750 connections per SU, and about 2,800 to 3,000 at 4 SU.
- The only published full 4-SU cable bill is for H100 (Table 8) [6]:
  - In-band: 304 cables.
  - OOB: 333 Cat5e and AOC, plus storage.
  - Compute InfiniBand: 2,042 cables.
  - Storage InfiniBand: 548 cables, plus storage.
  - Total: about 3,227 cables, plus 1,536 switch transceivers and 508 DGX transceivers on the compute fabric.

## 8. Comparable tools

- NetBox has no rack, bundle or site template:
  - NetBox 4.1.0 (2024-09-03) added Rack Types, which work "similarly to device types" by defining a make and model of rack whose attributes populate new racks [40][48].
  - Module types cover field-replaceable components, not bundles.
  - No multi-rack or pre-wired template exists in core.
  - In the NetBox family, Nautobot's Design Builder app expands design files into racks, devices, IPs and cables for repeatable builds [49].
- Sunbird dcTrack: reuse comes from the Models Library (vendor models with ports and dimensions) and spreadsheet import templates covering locations, cabinets, rack PDUs, devices and data or power connections [50][51]. I found no saved multi-rack or pre-wired cabinet template object; the subagent pass reported "not found".
- Nlyte: marketing pages describe cabinet planning and what-if placement in Nlyte Asset Optimizer [52] (secondary). Documentation was not reachable, and no rack or cabinet template object was confirmed.
- Device42: has "Clone Selected Racks", which clones "the selected racks and all their devices, PDUs, and connections" [53]. It also has Racked Asset Templates, drag-and-drop device blocks under Templates, and hardware models [53][54]. This is the closest match to a pre-wired rack template: clone-based, rack-scoped, connections included.
- RackTables: no rack template or clone feature. Object cloning is a long-open request (bug 1231), only addressed by an unmerged community plugin [55].
- openDCIM: Device Templates, per-device with front and rear images; no rack or POD template [59].
- NVIDIA's own tooling:
  - NVIDIA Air is a network digital twin with a Demo Marketplace of prebuilt topologies, such as EVPN demos. It simulates switches and hosts, not rack elevations. I found no published DGX BasePOD or SuperPOD topology [56].
  - NVIDIA publishes RAs as static documents with fixed figures and BOM tables [3][4].
  - A "DGX SuperPOD and BasePOD BOM Configurator" appears only in search snippets pointing to an internal FAQ page; I could not confirm a public tool.
  - The Omniverse DSX digital-twin blueprint, for facility-scale AI factories [57], and Cadence Reality's DGX SuperPOD GB200 model [58] come from press releases and were not verified further (secondary).

## Open questions

- BasePOD rack elevations: none in RA V5. The DGX B200 and B300 deployment guide (updated 2026-09-10) was not read in depth and may contain rack diagrams.
- Max power for SN4600C, SN4600, SN5600 and SN2201 was not found; only typical power is published on the pages read. Management-rack and BasePOD switch totals mix max and typical figures.
- DGX B200 airflow direction is not stated in the B200 user guide; only CFM is given.
- No NVIDIA end-of-life or last-time-buy notice was found for DGX B200 or DGX H200. The DGX H100 end-of-sale date (2025-01-25) comes only from resellers.
- The Rubin NVL8 RA document number and version were not found. The DGX B300 BlueField-3 cage type was not confirmed.
- Control-plane node U height and power are not specified in any in-scope RA. Storage rack-unit footprint is not stated.
- BasePOD Table 4.2 lists 32 NDR fibres at 8 nodes against 64 NDR400 links. The discrepancy is unresolved; NVIDIA errata not found.
- The exact spec of the Raritan PX3-5878I2R-P1Q2R1A15D5 used in the H100 RA was not found; a sibling model's sheet was used.
- The QM9790 management port set was not verified, because the manual footnotes exceptions.
- The SN2201 console connector type is unresolved: NVIDIA says RS232 "Console", devicetype-library says `usb-mini-a`.
- The SN4600 cage type is unresolved: the datasheet says QSFP56, while the user manual summary said QSFP28 at up to 200GbE.
- NVIDIA Newsroom media asset terms were not read (login required).
- The Canadian trademark position on nominative use was not researched. Legal review is recommended before shipping NVIDIA-named content.
- The H200 SuperPOD RA's "exceeds 25 kW" at two DGX H200 per rack conflicts with the 10.2 kW system maximum.

## Sources

1. NVIDIA DGX BasePOD documentation hub. https://docs.nvidia.com/dgx-basepod/
2. NVIDIA DGX SuperPOD documentation hub. https://docs.nvidia.com/dgx-superpod/
3. NVIDIA DGX BasePOD: The Infrastructure Foundation for Enterprise AI Reference Architecture Featuring NVIDIA DGX B200, H200 and H100 Systems, RA-11127-001 V5. HTML: https://docs.nvidia.com/dgx-basepod/reference-architecture-infrastructure-foundation-enterprise-ai/latest/index.html. PDF: https://docs.nvidia.com/dgx-basepod/reference-architecture-infrastructure-foundation-enterprise-ai/latest/_downloads/487a2093a4564bef969f38abba12a1f5/ra-11127-001-dbphb100-referencearch.pdf
4. NVIDIA DGX SuperPOD: Next Generation Scalable Infrastructure for AI Leadership Reference Architecture Featuring NVIDIA DGX B200, RA-11334-001 V08. HTML: https://docs.nvidia.com/dgx-superpod/reference-architecture-scalable-infrastructure-b200/latest/index.html. PDF: https://docs.nvidia.com/dgx-superpod/reference-architecture-scalable-infrastructure-b200/latest/_downloads/4b3d3302fa4fc6854b595ccff50b9932/RA11334001-DSPB200-ReferenceArch.pdf
5. NVIDIA DGX SuperPOD Reference Architecture, DGX H200, RA-11336-001 V2. https://docs.nvidia.com/dgx-superpod/reference-architecture/scalable-infrastructure-h200/latest/index.html
6. NVIDIA DGX SuperPOD Reference Architecture, DGX H100, RA-11333-001 V11 (Appendix A, Tables 7 and 8). https://docs.nvidia.com/dgx-superpod/reference-architecture-scalable-infrastructure-h100/latest/index.html
7. NVIDIA SuperPOD DGX B300 Systems, Spectrum-4 Ethernet and DC Busbar Power Reference Architecture, RA-11337-001 V01. https://docs.nvidia.com/dgx-superpod/reference-architecture/scalable-infrastructure-b300/latest/index.html
8. NVIDIA SuperPOD with DGX B300 Systems, NVIDIA Quantum-X800 InfiniBand switching and AC Power Reference Architecture, RA-11339-001 V01. https://docs.nvidia.com/dgx-superpod/reference-architecture/scalable-infrastructure-b300-xdr/latest/index.html
9. NVIDIA DGX SuperPOD Rubin NVL8 Systems, DGX SuperPOD Architecture. https://docs.nvidia.com/dgx-superpod/reference-architecture/scalable-infrastructure-rubinx86/latest/dgx-superpod-architecture.html
10. NVIDIA DGX SuperPOD and BasePOD Deployment Guides for DGX B200 and DGX B300 Systems with NVIDIA Mission Control. https://docs.nvidia.com/dgx-basepod/deployment-guides/dgx-basepod-b200/latest/index.html
11. Data Center Best Practices with DGX B200 (NVIDIA slide deck). https://docs.nvidia.com/dgx-pdf/nvidia-dgx-superpod-data-center-best-practices-with-dgx-b200.pdf
12. NVIDIA DGX B200 User Guide, Introduction. https://docs.nvidia.com/dgx/dgxb200-user-guide/introduction-to-dgxb200.html
13. NVIDIA DGX H100/H200 User Guide, Introduction. https://docs.nvidia.com/dgx/dgxh100-user-guide/introduction-to-dgxh100.html
14. NVIDIA DGX B300 User Guide, Introduction. https://docs.nvidia.com/dgx/dgxb300-user-guide/introduction-to-dgxb300.html
15. NVIDIA DGX BasePOD product page. https://www.nvidia.com/en-us/data-center/dgx-basepod/
16. Microway, NVIDIA DGX H100 (secondary). https://www.microway.com/product/nvidia-dgx-h100/
17. Boston Limited, End-of-Sale Alert: NVIDIA DGX H100 (secondary). https://www.facebook.com/bostonlimited/posts/end-of-sale-alert-nvidia-dgx-h100-products-starting-january-25-2025-nvidia-will-/1172433931554944/
18. NVIDIA product URLs checked with curl on 2026-09-13: https://www.nvidia.com/en-us/data-center/dgx-h200/ (301 to /dgx-platform/), https://www.nvidia.com/en-us/data-center/dgx-h100/ (301 to /dgx-h200/), https://www.nvidia.com/en-us/data-center/dgx-b200/ (200), https://www.nvidia.com/en-us/data-center/dgx-b300/ (200)
19. QM97x0 hardware user manual, Specifications. https://networking-docs.nvidia.com/qm97x0hw/specifications
20. QM97x0 hardware user manual, Interfaces. https://networking-docs.nvidia.com/qm97x0hw/interfaces
21. QM97x0 hardware user manual, Introduction. https://networking-docs.nvidia.com/qm97x0hw/introduction
22. NVIDIA Spectrum-3 SN4000 1U and 2U Switch Systems Hardware User Manual, Specifications. https://networking-docs.nvidia.com/sn4000hw/specifications
23. NVIDIA Spectrum SN4000 Series datasheet (April 2022), specifications table. https://www.nvidia.com/content/dam/en-zz/Solutions/networking/br-sn4000-series.pdf
24. NVIDIA SN5000 hardware user manual, Specifications. https://networking-docs.nvidia.com/sn5000hw/Specifications
25. SN2201 and SN2201_M 1G Management Switch Systems User Manual, Specifications. https://networking-docs.nvidia.com/sn2201hw/specifications
26. SN2201 and SN2201_M user manual, Interfaces. https://networking-docs.nvidia.com/sn2201hw/interfaces
27. NVIDIA UFM Enterprise Appliance (NDR) Hardware User Manual, Technical Specifications. https://networking-docs.nvidia.com/ufmenterprisendrhwum/technical-specifications
28. Server Supply, 920-9B210-00FN-0M0 MQM9700-NS2F P2C (secondary). https://www.serversupply.com/NETWORKING/SWITCH/64%20PORT/NVIDIA/920-9B210-00FN-0M0_391726.htm and Network Outlet, MQM9700-NS2R C2P (secondary). https://networkoutlet.com/products/mqm9700-ns2r-nvidia-quantum-2-based-ndr-infiniband-switch-64-ports-ndr-32-osfp-ports-managed-connector-to-power-c2p-airflow-reverse
29. MCP4Y10-Nxxx Twin-port 2x400Gb/s OSFP to 2x400Gb/s OSFP Passive DAC Product Specifications. https://docs.nvidia.com/networking/display/mcp4y10nxxx2x400pub/ordering+information
30. NVIDIA MFP7E10-Nxxx Optical Multimode Fiber Cable Product Specifications. https://docs.nvidia.com/nvidia-mfp7e10-nxxx-optical-multimode-fiber-cable-product-specifications.pdf
31. Raritan PX3-5878I2R-P1Q1R1A5D5 specification sheet (sibling of the H100 RA model). https://d3b2us605ptvk2.cloudfront.net/product-selector/pdus/PX3-5878I2R-P1Q1R1/PX3-5878I2R-P1Q1R1A5D5_spec.pdf
32. netbox-community/devicetype-library, device-types/Nvidia and device-types/Mellanox (fetched via gh api 2026-09-13). https://github.com/netbox-community/devicetype-library/tree/master/device-types/Nvidia and https://github.com/netbox-community/devicetype-library/tree/master/device-types/Mellanox
33. devicetype-library LICENSE.txt (CC0-1.0). https://github.com/netbox-community/devicetype-library/blob/master/LICENSE.txt
34. devicetype-library PR #3560, Add Nvidia Spectrum SN2201 switch. https://github.com/netbox-community/devicetype-library/pull/3560
35. devicetype-library PR #2865, Added Mellanox Switch SN2100 and its front-image. https://github.com/netbox-community/devicetype-library/pull/2865
36. NetBox `netbox/dcim/choices.py` (main). https://github.com/netbox-community/netbox/blob/main/netbox/dcim/choices.py
37. NetBox `netbox/dcim/models/device_components.py` (Interface.speed). https://github.com/netbox-community/netbox/blob/main/netbox/dcim/models/device_components.py
38. NetBox `netbox/dcim/models/device_component_templates.py` (InterfaceTemplate). https://github.com/netbox-community/netbox/blob/main/netbox/dcim/models/device_component_templates.py
39. NetBox releases and issues. https://github.com/netbox-community/netbox/releases, https://github.com/netbox-community/netbox/issues/21387, https://github.com/netbox-community/netbox/issues/21480, https://github.com/netbox-community/netbox/issues/13245, https://github.com/netbox-community/netbox/pull/11429, https://github.com/netbox-community/netbox/issues/3619, https://github.com/netbox-community/netbox/issues/4476
40. NetBox v4.1.0 release notes (Rack Types, #12826). https://github.com/netbox-community/netbox/releases/tag/v4.1.0
41. NVIDIA Terms of Service. https://www.nvidia.com/en-us/about-nvidia/terms-of-service/
42. NVIDIA Brand Guidelines, logo and brand usage. https://www.nvidia.com/en-eu/about-nvidia/legal-info/logo-brand-usage/
43. NVIDIA Networking Terms of Use. https://www.nvidia.com/en-us/networking/policy/terms/
44. NVIDIA Newsroom, Media Assets. https://nvidianews.nvidia.com/multimedia
45. Wikipedia, Nominative use. https://en.wikipedia.org/wiki/Nominative_use
46. Pure Storage (Everpure), AIRI NVIDIA DGX BasePOD Configuration Guide (partner). https://www.purestorage.com/content/dam/pdf/en/reference-architectures/ra-airi-nvidia-dgx-basepod-architecture-config-guide.pdf
47. Blocks and Files, How Nvidia assesses SuperPOD AI storage performance (secondary). https://blocksandfiles.com/2024/09/03/nvidia-superpod-storage-certification/
48. NetBox documentation, Rack Types. https://netboxlabs.com/docs/netbox/models/dcim/racktype/
49. Nautobot Design Builder app. https://github.com/nautobot/nautobot-app-design-builder
50. Sunbird dcTrack, Update your dcTrack Item Models Library. https://www.sunbirddcim.com/help/dcTrack/v720/en/Content/dcTrack/Update_Your_dcTrack_Item_Models_Library.htm
51. Sunbird dcTrack, Use File Import to edit or delete locations and cabinets. https://www.sunbirddcim.com/help/dcTrack/v600/en/Content/dcTrack/Use_File_Import_to_Edit_or_Delete_Locations_Cabinets.htm
52. Nlyte Asset Optimizer (secondary, marketing). https://www.nlyte.com/products/nlyte-asset-optimizer/
53. Device42 documentation, Racks. https://docs.device42.com/infrastructure-management/buildings-rooms-and-racks/racks/
54. Device42 documentation, Hardware Models (Templates). https://docs.device42.com/infrastructure-management/devices/hardware-models-templates/
55. RackTables bug 1231, object cloning request. https://bugs.racktables.org/view.php?id=1231
56. NVIDIA Air documentation and Air Marketplace announcement. https://docs.nvidia.com/networking-ethernet-software/nvidia-air and https://forums.developer.nvidia.com/t/bringing-networking-into-view-with-the-nvidia-air-marketplace/198131
57. NVIDIA Newsroom, Vera Rubin DSX AI Factory reference design and Omniverse DSX Blueprint (not re-verified). https://nvidianews.nvidia.com/news/nvidia-releases-vera-rubin-dsx-ai-factory-reference-design-and-omniverse-dsx-digital-twin-blueprint-with-broad-industry-support
58. Cadence expands digital twin library with NVIDIA DGX SuperPOD model (secondary). https://www.nasdaq.com/press-release/cadence-expands-digital-twin-platform-library-nvidia-dgx-superpod-model-accelerate-ai
59. openDCIM wiki, Device Templates. https://wiki.opendcim.org/wiki/index.php/DeviceTemplates
60. devicetype-library, Lenovo ThinkSystem SR680a V3. https://github.com/netbox-community/devicetype-library/blob/master/device-types/Lenovo/ThinkSystem-SR680a-v3.yaml
61. Cisco, End-of-Sale and End-of-Life Announcement for UCS C885A M8 with NVIDIA HGX H200 (secondary for DGX). https://www.cisco.com/c/en/us/products/collateral/servers-unified-computing/ucs-c-series-rack-servers/ucs-c885a-m8-rs-nvidia-hgx-h200-gpus-eol.html
