# NetBox Device Library Audit for Homelab Relevance

**Date:** 2025-12-19 **Related Issue:** [#96](https://github.com/RackulaLives/Rackula/issues/96) **Repository:** [netbox-community/devicetype-library](https://github.com/netbox-community/devicetype-library)

---

## Executive Summary

This research spike audits the NetBox community device library to identify homelab-relevant devices for inclusion in Rackula's device library. The goal is to expand from the current 39 devices to comprehensive brand packs with front/rear elevation images.

### Key Findings

| Metric                                  | Value        |
| --------------------------------------- | ------------ |
| **Total Vendors Audited**               | 12           |
| **Total Device Types in Library**       | ~10,000+     |
| **Homelab-Relevant Devices Identified** | ~500+        |
| **Devices with Complete Images**        | ~150         |
| **Recommended for Phase 1**             | ~200 devices |

### Current Rackula Library

- Ubiquiti: 10 devices
- MikroTik: 5 devices
- Generic Starter: 24 devices
- **Total: 39 devices**

---

## Vendor Priority Matrix

### Tier 1: High Priority (Immediate Implementation)

| Vendor | Total Devices | Rack-Mount | Image Coverage | Recommendation |
| --- | --- | --- | --- | --- |
| **Ubiquiti** | 139 | 60 | 40% | Expand to full catalog |
| **MikroTik** | 107 | 85 | 16% | Expand to full catalog |
| **Synology** | 48 | 19 | 47% | Full rack NAS coverage |
| **APC** | 130+ | 13 | 8% | UPS/PDU essentials |

### Tier 2: Medium Priority (Phase 2)

| Vendor | Total Devices | Rack-Mount | Image Coverage | Recommendation |
| --- | --- | --- | --- | --- |
| **Dell** | 151 | 57 | 25% | Popular PowerEdge models |
| **Supermicro** | 81 | 40+ | 15% | Homelab server selection |
| **HPE** | 200+ | 120+ | 75% | Aruba switches only |
| **CyberPower** | 12 | 10 | 0% | UPS/PDU (need images) |

### Tier 3: Lower Priority (Phase 3)

| Vendor | Total Devices | Rack-Mount | Image Coverage | Recommendation |
| --- | --- | --- | --- | --- |
| **QNAP** | 47 | 25 | 35% | Rack NAS selection |
| **TP-Link** | 42 | 18 | 12% | Budget switches |
| **Cisco** | 1000+ | 200+ | <5% | Small business only |
| **Netgear** | 37 | 25 | 8% | Managed switches |

---

## Detailed Vendor Audits

### 1. Ubiquiti Networks

**Current in Rackula:** 10 devices **Available in NetBox:** 139 devices **Rack-Mountable:** 60 devices

#### Device Categories

| Category                  | Count   | With Images | Priority |
| ------------------------- | ------- | ----------- | -------- |
| UniFi Switches            | 25      | 17 (68%)    | High     |
| Dream Machines            | 3       | 3 (100%)    | High     |
| EdgeRouter Series         | 12      | 0 (0%)      | Medium   |
| EdgeSwitch Series         | 12      | 1 (8%)      | Medium   |
| Network Video Recorders   | 3       | 2 (67%)     | High     |
| Cloud Gateways            | 2       | 2 (100%)    | High     |
| PoE Injectors/Accessories | Various | Varies      | Low      |

#### Recommended Additions (50 devices)

**High Priority (with images):**

- USW-Pro-24-PoE, USW-Pro-48-PoE (PoE switches)
- USW-Enterprise-24-PoE, USW-Enterprise-48-PoE
- USW-Aggregation, USW-Pro-Aggregation
- UDM-Pro, UDM-Pro-Max, UDM-SE
- UNVR, UNVR-Pro, ENVR
- USG-Pro-4, Cloud Gateway Ultra

**Medium Priority (missing images):**

- EdgeRouter 4, 6P, 8, 12, 12P
- EdgeSwitch 24-250W, 24-500W, 48-500W, 48-750W

---

### 2. MikroTik

**Current in Rackula:** 5 devices **Available in NetBox:** 107 devices **Rack-Mountable:** 85 devices

#### Device Categories

| Category                    | Count | With Images | Priority |
| --------------------------- | ----- | ----------- | -------- |
| Cloud Core Routers (CCR)    | 19    | 5 (26%)     | High     |
| Cloud Router Switches (CRS) | 31    | 4 (13%)     | High     |
| RouterBOARD High-End        | 10    | 1 (10%)     | Medium   |
| Carrier Switches (CSS)      | 3     | 1 (33%)     | Low      |
| Desktop/Non-Rack            | 44    | 6           | Skip     |

#### Recommended Additions (40 devices)

**High Priority (with images):**

- CCR2004-16G-2S+, CCR2116-12G-4S+
- CRS326-24G-2S+-RM, CRS326-24S+2Q+-RM
- CRS328-24P-4S+-RM
- CSS318-16G-2S+-IN

**Medium Priority (missing images):**

- CCR1009-7G-1C-1S+, CCR1016-12G, CCR1036-12G-4S
- CRS312-4C+8XG-RM, CRS317-1G-16S+-RM
- CRS354-48G-4S+2Q+-RM, CRS354-48P-4S+2Q+-RM
- RB1100AHx4, RB4011iGS+RM

---

### 3. Synology

**Current in Rackula:** 0 devices **Available in NetBox:** 48 devices **Rack-Mountable:** 19 devices

#### Rack-Mount NAS by Form Factor

| Form Factor   | Models                               | With Images |
| ------------- | ------------------------------------ | ----------- |
| 1U (4-bay)    | RS815+, RS816, RS819, RS820+, RS422+ | 3           |
| 2U (8-12 bay) | RS1219+, RS1221+, RS2416+, RS2418+   | 5           |
| 2U (16+ bay)  | RS3614xs+, RS3617RPxs, RS3621xs+     | 3           |
| 2U High-Perf  | FS6400                               | 1           |

#### Recommended Additions (19 devices)

**All rack-mount models recommended:**

- RS815+, RS819, RS820+, RS820RP+ (1U)
- RS1219+, RS1221+, RS1221RP+ (2U 12-bay)
- RS2416RP+, RS2418+, RS2418RP+, RS2421+, RS2421RP+ (2U 16+ bay)
- RS3614xs+, RS3617RPxs, RS3621xs+ (Enterprise)
- FS6400 (Flash Storage)

---

### 4. APC (Schneider Electric)

**Current in Rackula:** 0 devices **Available in NetBox:** 130+ devices **Rack UPS/PDU:** 13 devices

#### Rack-Mount Power Devices

| Type        | Models                                    | With Images |
| ----------- | ----------------------------------------- | ----------- |
| 1U Rack UPS | SMT1500RM1U, SMT1500RM1UC                 | 0           |
| 2U Rack UPS | SMT1000RMI2UC, SMT1500RMI2UC, SMC1500-2UC | 1           |
| 1U PDU      | AP9559, AP9560, AP9562, AP9570, AP9571A   | 0           |
| 0U PDU      | AP9568, APDU10350SW                       | 0           |

#### Recommended Additions (13 devices)

**All rack UPS/PDU models recommended** (images need sourcing):

- Smart-UPS 1U: SMT1500RM1U
- Smart-UPS 2U: SMT1000RMI2UC, SMT1500RMI2UC, SMC1500-2UC
- Basic PDU: AP9559, AP9560, AP9562, AP9570

---

### 5. Dell

**Current in Rackula:** 0 devices **Available in NetBox:** 151 devices **PowerEdge Servers:** 57 models

#### Homelab-Popular PowerEdge Models

| Generation | Models                     | With Images | eBay Availability |
| ---------- | -------------------------- | ----------- | ----------------- |
| 11th Gen   | R710                       | No          | High (affordable) |
| 12th Gen   | R720, R720xd               | R720 yes    | High              |
| 13th Gen   | R730, R730xd               | R730xd yes  | Medium            |
| 14th Gen   | R740, R740xd               | No          | Medium            |
| 15th Gen   | R750, R750xs               | R750 yes    | Low               |
| EPYC       | R6515, R6525, R7515, R7525 | Yes         | Medium            |

#### Recommended Additions (25 devices)

**High Priority (popular + images):**

- R620, R630 (1U with images)
- R720, R730xd (2U with images)
- R540, R550, R750, R760 (2U with images)
- R6515, R6525, R7515, R7525 (EPYC with images)

**Medium Priority (popular, no images):**

- R710, R730, R740 (need image sourcing)

---

### 6. Supermicro

**Current in Rackula:** 0 devices **Available in NetBox:** 81 devices **Rack Servers:** 40+ models

#### Server Categories

| Category            | Models | With Images |
| ------------------- | ------ | ----------- |
| SYS- (Intel)        | 30+    | 3           |
| AS- (AMD EPYC)      | 10+    | 3           |
| SSG- (SuperStorage) | 15+    | 3           |
| Chassis             | 8+     | 1           |

#### Recommended Additions (15 devices)

**High Priority (with images):**

- SYS-6029P-TR (2U dual Intel)
- AS-1115SV-WTNRT (1U AMD)
- AS-2124BT-HTR (2U AMD Twin)
- SSG-6049P-E1CR36H (4U storage)
- SSE-G3648B (3U storage)

**Medium Priority (popular, partial/no images):**

- SYS-5018D-FN8T, SYS-5019D-FN8TP (1U entry)
- SYS-6028R-TR (popular 2U)

---

### 7. HPE / Aruba

**Current in Rackula:** 0 devices **Available in NetBox:** 200+ devices **Network Switches:** 120+ models

#### Important Finding

**No ProLiant DL servers in repository** - only networking equipment.

#### Aruba Switch Categories

| Series  | Models | With Images | Priority |
| ------- | ------ | ----------- | -------- |
| 6100    | 10+    | 8 (80%)     | High     |
| 6000    | 8+     | 6 (75%)     | High     |
| 6200F   | 6+     | 5 (83%)     | Medium   |
| 2930M/F | 10+    | 7 (70%)     | Medium   |
| 2540    | 6+     | 3 (50%)     | Low      |

#### Recommended Additions (20 devices)

**High Priority (with images):**

- Aruba 6100-48G-4SFP+, 6100-24G-4SFP+
- Aruba 6000-48G-4SFP, 6000-24G-4SFP
- Aruba 2930M-48G, 2930F-48G-4SFP+
- Aruba 1930-48G

---

### 8. CyberPower

**Current in Rackula:** 0 devices **Available in NetBox:** 12 devices **Rack UPS/PDU:** 10 devices

#### Critical Gap: Zero Images

| Type   | Models                                | Form Factor |
| ------ | ------------------------------------- | ----------- |
| 1U UPS | OR1000LCDRM1U, OR600ELCDRM1U          | Rack        |
| 2U UPS | OR1500LCDRTXL2U, OR2200LCDRT2U        | Rack        |
| 1U PDU | CPS1215RM, CPS1215RMS, CPS1220RMS     | Rack        |
| 1U PDU | PDU15M2F12R, PDU20BHVIEC12R, PDU81005 | Rack        |

#### Recommended Additions (10 devices)

**All models recommended** - images must be sourced externally:

- UPS: OR1000LCDRM1U, OR1500LCDRTXL2U, OR2200LCDRT2U
- PDU: CPS1215RMS, CPS1220RMS, PDU15M2F12R

---

### 9. QNAP

**Current in Rackula:** 0 devices **Available in NetBox:** 47 devices **Rack-Mount NAS:** 25 devices

#### Rack NAS by Form Factor

| Form Factor | Models                                    | With Images |
| ----------- | ----------------------------------------- | ----------- |
| 1U          | TS-431U, TS-453U-RP, TS-469U-RP           | 1           |
| 2U          | TS-883XU-RP, TS-h1277AXU-RP, TS-1283XU-RP | 4           |
| 4U          | TS-2483XU-RP                              | 0           |

#### Recommended Additions (12 devices)

**High Priority (with images):**

- TS-432PXU-RP, TS-832PXU-RP
- TS-883XU-RP, TS-h1277AXU-RP
- TVS-EC1580MU-SAS-RP

---

### 10. TP-Link

**Current in Rackula:** 0 devices **Available in NetBox:** 42 devices **Rack Switches:** 18 devices

#### Switch Categories

| Series              | Models | With Images |
| ------------------- | ------ | ----------- |
| TL-SG3xxx (Managed) | 12     | 1           |
| T-Series            | 5      | 2           |
| TL-SX (10G)         | 1      | 0           |

#### Recommended Additions (8 devices)

**Budget-friendly managed switches:**

- TL-SG3428, TL-SG3452X (managed L2)
- TL-SG3428MP, TL-SG3428XMP (PoE)
- T1600G-28PS (with image)

---

### 11. Cisco

**Current in Rackula:** 0 devices **Available in NetBox:** 1000+ devices **Homelab-Relevant:** ~50 devices

#### Homelab-Friendly Categories

| Category             | Models | With Images |
| -------------------- | ------ | ----------- |
| SG250 Small Business | 10+    | 0           |
| Catalyst 2960        | 15+    | 2           |
| Catalyst 9200L       | 8+     | 0           |
| Catalyst 9300        | 10+    | 4           |

#### Recommended Additions (15 devices)

**Small Business (affordable):**

- SG250-10P, SG250-26P, SG250-48P

**Legacy (eBay popular):**

- Catalyst 2960S-24TS-L (with images)
- Catalyst 2960X-48FPD-L

---

### 12. Netgear

**Current in Rackula:** 0 devices **Available in NetBox:** 37 devices **Rack Switches:** 25 devices

#### Switch Categories

| Series          | Models | With Images |
| --------------- | ------ | ----------- |
| GS7xx (Managed) | 8      | 2           |
| M4300 (10G)     | 4      | 0           |
| ProSafe M5300   | 4      | 0           |

#### Recommended Additions (10 devices)

- GS724T, GS728TP, GS752TX
- M4300-12X12F (10GbE)
- ProSafe M5300-28G, M5300-52G

---

## Implementation Recommendations

### Phase 1: Expand Existing + Core New (Target: 150 devices)

| Vendor            | Devices | Priority  |
| ----------------- | ------- | --------- |
| Ubiquiti (expand) | +40     | Immediate |
| MikroTik (expand) | +35     | Immediate |
| Synology (new)    | 19      | Immediate |
| APC (new)         | 13      | Immediate |
| Dell PowerEdge    | 15      | Immediate |
| Supermicro        | 10      | Immediate |
| HPE Aruba         | 15      | Week 2    |

### Phase 2: Budget Networking (Target: +50 devices)

| Vendor     | Devices | Priority           |
| ---------- | ------- | ------------------ |
| CyberPower | 10      | High (need images) |
| QNAP       | 12      | Medium             |
| TP-Link    | 8       | Medium             |
| Cisco SB   | 15      | Medium             |
| Netgear    | 10      | Low                |

### Image Sourcing Strategy

| Status              | Devices | Action                      |
| ------------------- | ------- | --------------------------- |
| Has images          | ~150    | Direct import               |
| Missing images      | ~200    | Source from vendor sites    |
| No images available | ~50     | Create generic placeholders |

---

## Appendix: Data Quality Notes

### Repository Structure

```
netbox-community/devicetype-library/
├── device-types/           # YAML device definitions by vendor
│   ├── Ubiquiti/          # 139 files
│   ├── MikroTik/          # 107 files
│   ├── Dell/              # 151 files
│   └── ...
├── elevation-images/       # Front/rear PNG images by vendor
│   ├── Ubiquiti/          # 97 images
│   ├── Dell/              # ~30 images
│   └── ...
└── schema/                 # JSON schema validation
```

### Image Naming Convention

- Front: `<slug>.front.png`
- Rear: `<slug>.rear.png`

### Known Gaps

1. **HPE ProLiant servers** - Not in repository (networking only)
2. **CyberPower images** - Zero coverage
3. **Popular Dell models** - R710, R730, R740 lack images
4. **MikroTik CRS series** - Many switches missing images

---

## Next Steps

1. [ ] Create implementation issue (#97) sub-tasks per vendor
2. [ ] Begin Phase 1 implementation with Ubiquiti expansion
3. [ ] Source missing images from vendor documentation
4. [ ] Set up automated import pipeline from NetBox YAML
