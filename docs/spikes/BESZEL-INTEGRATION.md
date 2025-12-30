# Spike: Beszel Integration for Rackula Dashboard

**Issue:** #199
**Date:** 2025-12-28
**Status:** Complete
**Time Box:** 2-4 hours (actual: ~2 hours)

---

## Research Question

Can Beszel be integrated as a monitoring backend while Rackula serves as the frontend, creating a persistent dashboard for rack visualization with live system metrics?

---

## Executive Summary

**YES**, integration is viable and architecturally sound. Beszel's PocketBase foundation provides a well-documented REST API and real-time WebSocket subscriptions that Rackula can consume directly. The primary challenge is device matching, which requires either manual mapping or standardized naming conventions.

### Recommendation

Proceed with a phased implementation:

1. **Phase 1 (MVP):** Manual device-to-system linking with basic metrics display
2. **Phase 2:** Real-time subscriptions and status indicators
3. **Phase 3:** Historical charts and alert integration

---

## 1. Beszel Architecture Overview

### 1.1 Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                      Beszel Hub                              │
│  ┌───────────────┐  ┌─────────────┐  ┌──────────────────┐   │
│  │  PocketBase   │  │  Go Backend │  │  React Frontend  │   │
│  │  (SQLite DB)  │  │   (Custom)  │  │  (Shadcn/Tanstack)│   │
│  └───────────────┘  └─────────────┘  └──────────────────┘   │
│         ▲                  ▲                                 │
│         │                  │                                 │
│    REST API          WebSocket/SSH                           │
│         │                  │                                 │
└─────────┼──────────────────┼────────────────────────────────┘
          │                  │
    ┌─────┴─────┐     ┌──────┴──────┐
    │  Rackula  │     │ Beszel Agent │
    │ (Svelte)  │     │  (Go binary) │
    └───────────┘     └─────────────┘
```

### 1.2 Technology Stack

| Component   | Technology                              |
| ----------- | --------------------------------------- |
| Backend     | Go + PocketBase (SQLite)                |
| Frontend    | React + TypeScript + Shadcn UI          |
| Data Format | JSON (REST) + CBOR (Agent comms)        |
| Real-time   | PocketBase subscriptions (WebSocket)    |
| Agent Comms | SSH or WebSocket                        |
| Auth        | PocketBase auth (email/password, OAuth) |

---

## 2. API Compatibility Assessment

### 2.1 PocketBase REST API

Beszel inherits PocketBase's complete REST API. All collections are queryable:

```typescript
// Example: Fetch all systems
GET /api/collections/systems/records
Authorization: <token>

// Example: Fetch single system with stats
GET /api/collections/systems/records/<id>
GET /api/collections/system_stats/records?filter=system="<id>"&sort=-created&perPage=1

// Example: Subscribe to real-time updates
pb.collection('systems').subscribe('*', (data) => {
  // Handle create/update/delete events
})
```

### 2.2 Custom Beszel Endpoints

| Endpoint                      | Method | Purpose                      |
| ----------------------------- | ------ | ---------------------------- |
| `/api/beszel/getkey`          | GET    | Hub version + SSH public key |
| `/api/beszel/first-run`       | GET    | Check if first-time setup    |
| `/api/beszel/containers/logs` | GET    | Container logs               |
| `/api/beszel/containers/info` | GET    | Container details            |
| `/api/beszel/systemd/info`    | GET    | Systemd service details      |
| `/api/beszel/smart/refresh`   | POST   | Refresh SMART data           |

### 2.3 Data Collections

| Collection        | Purpose               | Key Fields                                              |
| ----------------- | --------------------- | ------------------------------------------------------- |
| `systems`         | Monitored systems     | `name`, `host`, `port`, `status`, `info` (JSON)         |
| `system_stats`    | Time-series metrics   | `system`, `stats` (JSON), `type` (1m/10m/20m/120m/480m) |
| `system_details`  | Static system info    | `hostname`, `os`, `kernel`, `cpu`, `cores`, `memory`    |
| `containers`      | Docker/Podman         | `name`, `image`, `cpu`, `memory`, `status`              |
| `container_stats` | Container time-series | `system`, `stats` (JSON), `type`                        |
| `alerts`          | User-defined alerts   | `system`, `name`, `value`, `triggered`                  |
| `smart_devices`   | Disk health           | `system`, `name`, `model`, `state`, `capacity`          |

---

## 3. Data Model Mapping

### 3.1 Beszel System Info Structure

```typescript
// Real-time system info (what's displayed on dashboard)
interface SystemInfo {
  h: string; // hostname
  cpu: number; // CPU usage %
  mp: number; // Memory usage %
  dp: number; // Disk usage %
  u: number; // Uptime (seconds)
  b: number; // Bandwidth (MB)
  bb?: number; // Bandwidth (bytes)
  t?: number; // Threads
  v: string; // Agent version
  g?: number; // GPU usage %
  dt?: number; // Dashboard temperature
  la?: [number, number, number]; // Load average 1/5/15
  bat?: [number, number]; // Battery [percent, state]
  sv?: [number, number]; // Services [total, failed]
  efs?: Record<string, number>; // Extra filesystem %
}

// Detailed stats (for charts)
interface SystemStats {
  cpu: number; // CPU %
  cpub?: number[]; // [user, system, iowait, steal, idle]
  m: number; // Total memory (GB)
  mu: number; // Used memory (GB)
  mp: number; // Memory %
  d: number; // Disk total (GB)
  du: number; // Disk used (GB)
  dp: number; // Disk %
  ns: number; // Network sent (MB)
  nr: number; // Network recv (MB)
  t?: Record<string, number>; // Temperatures
  g?: Record<string, GPUData>; // GPU data
  // ... more fields
}
```

### 3.2 Rackula Device Types (Current)

```typescript
interface PlacedDevice {
  id: string; // UUID
  device_type: string; // Reference to DeviceType.slug
  position: number; // Bottom U position (1-indexed)
  face: DeviceFace;
  name?: string; // Custom instance name
  notes?: string;
  custom_fields?: Record<string, unknown>;
}
```

### 3.3 Proposed Extension

```typescript
// Extended PlacedDevice for Beszel integration
interface PlacedDevice {
  // ... existing fields ...

  // Beszel integration (optional)
  beszel_system_id?: string; // Link to Beszel system record
  beszel_hostname?: string; // Cached hostname for display
}

// Configuration store
interface BeszelConfig {
  hub_url?: string; // Beszel hub URL
  api_token?: string; // PocketBase auth token
  auto_match?: "hostname" | "name" | "manual";
  refresh_interval?: number; // Polling interval (if not using WebSocket)
}
```

---

## 4. Device Matching Strategy

### 4.1 Identification Fields

| Beszel Field | Location                | Example         |
| ------------ | ----------------------- | --------------- |
| `name`       | systems.name            | "proxmox-01"    |
| `host`       | systems.host            | "192.168.1.100" |
| `hostname`   | system_details.hostname | "pve-node1"     |

| Rackula Field | Location                               | Example          |
| ------------- | -------------------------------------- | ---------------- |
| `name`        | PlacedDevice.name                      | "Proxmox Node 1" |
| `hostname`    | PlacedDevice.custom_fields?.hostname   | "pve-node1"      |
| `ip_address`  | PlacedDevice.custom_fields?.ip_address | "192.168.1.100"  |

### 4.2 Matching Options

#### Option A: Manual Mapping (Recommended for MVP)

User explicitly links Rackula devices to Beszel systems via UI picker.

**Pros:**

- No guesswork, always accurate
- Works with any naming convention
- Clear user intent

**Cons:**

- Requires manual setup per device
- Extra work for large deployments

**Implementation:**

```typescript
// Device edit dialog: "Link to Monitoring"
<BeszelSystemPicker
  onSelect={(systemId) => updateDevice({ beszel_system_id: systemId })}
/>
```

#### Option B: Hostname Match

Automatically match by hostname if devices have matching values.

**Implementation:**

```typescript
function findBeszelSystem(
  device: PlacedDevice,
  systems: BeszelSystem[],
): string | null {
  const deviceHostname = device.custom_fields?.hostname?.toLowerCase();
  if (!deviceHostname) return null;

  const match = systems.find(
    (s) => s.expand?.system_details?.hostname?.toLowerCase() === deviceHostname,
  );
  return match?.id ?? null;
}
```

#### Option C: Name Match (Fuzzy)

Match by similar names (e.g., "Dell R650" matches Beszel system "dell-r650").

**Implementation:** Use string similarity algorithms (Levenshtein, fuzzy match).

**Cons:** High false-positive risk, not recommended.

### 4.3 Recommendation

**Start with manual mapping** (Option A) for the MVP. It's:

- Most reliable
- Simplest to implement
- Gives users control
- Can add auto-match later as enhancement

---

## 5. Integration Options

### 5.1 Option 1: Direct API Client (Recommended)

Rackula fetches data directly from Beszel's PocketBase API.

```
┌─────────────────┐         ┌─────────────────┐
│     Rackula     │  HTTP   │   Beszel Hub    │
│  (Svelte App)   │────────▶│  (PocketBase)   │
│                 │◀────────│                 │
└─────────────────┘         └─────────────────┘
```

**Implementation:**

```typescript
// src/lib/services/beszel.ts
import PocketBase from "pocketbase";

class BeszelService {
  private pb: PocketBase;

  constructor(hubUrl: string) {
    this.pb = new PocketBase(hubUrl);
  }

  async authenticate(email: string, password: string) {
    return this.pb.collection("users").authWithPassword(email, password);
  }

  async getSystems() {
    return this.pb.collection("systems").getFullList();
  }

  async getSystemStats(systemId: string) {
    return this.pb
      .collection("system_stats")
      .getFirstListItem(`system="${systemId}"`, { sort: "-created" });
  }

  subscribeToSystem(systemId: string, callback: (data: SystemInfo) => void) {
    return this.pb.collection("systems").subscribe(systemId, callback);
  }
}
```

**Pros:**

- No backend changes to Beszel
- Real-time subscriptions built-in
- Full API access
- PocketBase SDK handles auth, caching

**Cons:**

- CORS configuration required
- Auth credentials stored in browser
- Both apps must be accessible

### 5.2 Option 2: Proxy Through Rackula Backend

Add a backend to Rackula that proxies Beszel requests.

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│     Rackula     │  HTTP   │  Rackula API    │  HTTP   │   Beszel Hub    │
│  (Svelte App)   │────────▶│  (New Backend)  │────────▶│  (PocketBase)   │
└─────────────────┘         └─────────────────┘         └─────────────────┘
```

**Pros:**

- No CORS issues
- Centralized auth (store Beszel token server-side)
- Can cache/transform data

**Cons:**

- Requires building a backend (major scope increase)
- Adds deployment complexity
- Against Rackula's "no backend" principle

**Recommendation:** Avoid for now; keep Rackula lightweight.

### 5.3 Option 3: Embed Beszel UI

Use iframes or web components to embed Beszel's system pages.

**Pros:**

- Zero API integration
- Full Beszel experience

**Cons:**

- Awkward UX (nested scrolling, style conflicts)
- Auth complexity (two login flows)
- Limited customization

**Recommendation:** Not suitable for primary integration.

### 5.4 Option 4: Deep Link Only

Simply link from Rackula devices to their Beszel system pages.

**Implementation:**

```svelte
{#if device.beszel_system_id}
  <a href="{beszelUrl}/system/{device.beszel_system_id}" target="_blank">
    View Monitoring
  </a>
{/if}
```

**Pros:**

- Trivial to implement
- No API integration needed

**Cons:**

- Context switch required
- No inline metrics in Rackula

**Recommendation:** Good fallback, but not the full vision.

---

## 6. Architecture Proposal

### 6.1 Phase 1: MVP (Minimal Integration)

**Goal:** Display basic system status on Rackula devices

**Features:**

- Configure Beszel hub URL
- Manual device-to-system linking
- Display status badge (up/down/paused)
- Show key metrics on hover (CPU, Memory, Disk %)
- Deep link to Beszel system page

**Technical Approach:**

1. Add `beszel_system_id` to PlacedDevice custom_fields
2. Create `BeszelService` class with PocketBase SDK
3. Fetch system info on layout load
4. Store in Svelte context/store
5. Display in device tooltip/info panel

**UI Mockup:**

```
┌─────────────────────────────────────────────┐
│  Dell R650xs                            🟢  │
│  ──────────────────────────────────────     │
│  CPU: 23%  │  Mem: 64%  │  Disk: 45%       │
│  Uptime: 14d 3h                             │
│                        [View in Beszel →]   │
└─────────────────────────────────────────────┘
```

### 6.2 Phase 2: Real-time Updates

**Goal:** Live metrics without page refresh

**Features:**

- WebSocket subscription to linked systems
- Real-time status badge updates
- Animated metric changes
- Alert status indicators

**Technical Approach:**

```typescript
// Subscribe to all linked systems
const linkedSystemIds = getLinkedSystemIds(layout);
for (const id of linkedSystemIds) {
  beszelService.subscribeToSystem(id, (info) => {
    updateDeviceMetrics(id, info);
  });
}
```

### 6.3 Phase 3: Dashboard Mode

**Goal:** Full monitoring dashboard view

**Features:**

- Dedicated dashboard view mode
- Historical charts for selected devices
- Container status display
- Alert history view
- Temperature overlays

---

## 7. Technical Considerations

### 7.1 CORS Configuration

Beszel must allow requests from Rackula's origin:

```yaml
# Beszel config or reverse proxy
Access-Control-Allow-Origin: https://app.racku.la
Access-Control-Allow-Credentials: true
```

### 7.2 Authentication

Options:

1. **User provides Beszel credentials** - Rackula authenticates on behalf of user
2. **API token** - Generate long-lived token in Beszel, paste into Rackula
3. **OAuth** - If same OAuth provider, could share session

**Recommendation:** Start with option 2 (API token) for simplicity.

### 7.3 Data Caching

- Cache system list on initial load
- Refresh on visibility change (tab focus)
- Real-time updates for active metrics
- Expire stale data after 5 minutes

### 7.4 Error Handling

```typescript
try {
  const systems = await beszelService.getSystems();
} catch (error) {
  if (error.status === 401) {
    // Show "Re-authenticate with Beszel" prompt
  } else if (error.status === 0) {
    // Network error: "Cannot reach Beszel hub"
  }
}
```

---

## 8. Deliverables Checklist

- [x] API compatibility assessment: Document Beszel's API and data model
- [x] Architecture proposal: How Rackula and Beszel would communicate
- [x] Identify device matching strategy (hostname, IP, manual mapping)
- [x] Document integration options (embedded, linked, API proxy)

---

## 9. Next Steps

If proceeding with integration:

1. **Create feature issue** for Phase 1 MVP
2. **Add PocketBase SDK** to Rackula dependencies
3. **Design settings UI** for Beszel configuration
4. **Implement BeszelService** with authentication
5. **Add device linking UI** in device edit panel
6. **Create metrics display component**
7. **Write integration tests** with mock Beszel API

---

## 10. References

- [Beszel GitHub](https://github.com/henrygd/beszel)
- [Beszel Documentation](https://beszel.dev)
- [PocketBase JS SDK](https://github.com/pocketbase/js-sdk)
- [PocketBase API Docs](https://pocketbase.io/docs/api-records/)
