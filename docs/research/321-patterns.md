# Pattern Analysis - Spike #321: Isometric Rendering Service

**Date:** 2025-12-30
**Author:** Claude (automated research)

---

## Key Insights

### 1. Technical Feasibility is HIGH

The isometric POC from spike #300 is **nearly production-ready** for extraction:
- Pure TypeScript, no browser dependencies
- Uses jsdom (already Node.js compatible)
- SVG generation is self-contained (~1,000 lines)
- Render time estimated at 100-200ms per rack

### 2. NetBox Integration is Straightforward

NetBox provides exactly what's needed:
- `/api/dcim/racks/<id>/elevation/` returns device positions
- JSON format compatible with Rackula's data model
- Device types include all required fields (position, height, face, depth)

### 3. resvg-js is Ideal for PNG Generation

| Tool | Speed | Dependencies | Quality |
|------|-------|--------------|---------|
| resvg-js | ~66ms | Zero (native) | Excellent |
| Puppeteer | 4-10s | Chromium | Browser-accurate |
| Sharp | Fast | Native deps | Good for simple SVG |

**Recommendation:** Use resvg-js for PNG, which is 10-100x faster than Puppeteer.

### 4. Business Model Options

| Model | Pros | Cons |
|-------|------|------|
| Free + Self-hosted | Community adoption | No revenue |
| Freemium SaaS | Revenue + free tier | Hosting costs |
| Pure SaaS | Simplest ops | May limit adoption |

**Recommendation:** Freemium with self-hosted option.

---

## Implementation Approaches

### Option A: Minimal API Service (Recommended for MVP)

**Scope:** Standalone HTTP service, SVG-only initially
**Effort:** 20-30 hours

**Architecture:**
```
┌─────────────────┐     ┌─────────────────────┐     ┌─────────────────┐
│ Client/NetBox   │────▶│ Isometric Service   │────▶│ SVG Response    │
│ POST /render    │     │ (Node.js + jsdom)   │     │                 │
└─────────────────┘     └─────────────────────┘     └─────────────────┘
```

**Components:**
1. Express/Hono HTTP server
2. Zod request validation
3. Isometric renderer (extracted from POC)
4. SVG serialization

**Pros:**
- Fastest to build
- Simplest deployment (single container)
- SVG can be converted client-side if needed

**Cons:**
- No PNG/PDF without additional work
- No caching layer

### Option B: Full-Featured Service

**Scope:** SVG + PNG + PDF, caching, rate limiting
**Effort:** 40-50 hours

**Additional Components:**
- resvg-js for PNG conversion
- jsPDF for PDF generation
- Redis/in-memory cache
- API key authentication
- Rate limiting middleware

**Pros:**
- Production-ready
- Multiple output formats
- Scalable architecture

**Cons:**
- More complex deployment
- Higher initial effort

### Option C: NetBox Plugin Wrapper

**Scope:** Python plugin that calls external service
**Effort:** 50-60 hours (includes service + plugin)

**Architecture:**
```
┌─────────────────┐     ┌─────────────────────┐     ┌─────────────────┐
│ NetBox Plugin   │────▶│ Isometric Service   │────▶│ Rendered Image  │
│ (Django/Python) │     │ (Node.js)           │     │ ← cached        │
└─────────────────┘     └─────────────────────┘     └─────────────────┘
        ↓
  ┌───────────────┐
  │ NetBox UI     │
  │ (embedded img)│
  └───────────────┘
```

**Pros:**
- Native NetBox integration
- Uses NetBox auth
- Automatic rack data access

**Cons:**
- Requires maintaining both service + plugin
- Plugin development complexity
- Two repositories to maintain

---

## Trade-offs

### Build vs. Buy

| Factor | Build In-House | Use Existing |
|--------|----------------|--------------|
| Control | Full | Limited |
| Cost | Dev time | Licensing |
| Features | Custom | Generic |
| Maintenance | Ongoing | External |

**Verdict:** Build - no existing isometric rack rendering service exists.

### Deployment Model

| Factor | Serverless | Container | Hybrid |
|--------|------------|-----------|--------|
| Cost at low volume | Lowest | Higher | Medium |
| Cost at high volume | Highest | Lowest | Lowest |
| Cold start | 500-1000ms | None | Mixed |
| Complexity | Low | Medium | High |

**Verdict:** Start with container (Vercel/Render free tier), migrate if needed.

### Pricing Strategy

| Tier | Price | Renders | Target |
|------|-------|---------|--------|
| Free | $0 | 100/month | Trial |
| Pro | $9/month | 1,000/month | Individual |
| Team | $29/month | 5,000/month | Team |
| Enterprise | Custom | Unlimited | Large org |
| Self-Hosted | Free | Unlimited | DIY |

**Verdict:** Start with free + self-hosted, add paid tiers after validation.

---

## Recommendation

### Phase 1: MVP (GO)

**Scope:** Minimal API service with SVG output
**Effort:** 20-30 hours
**Deliverable:** Docker image + API documentation

**Why:**
1. Validates demand before investing in full service
2. SVG can be converted to PNG client-side
3. Fast iteration on core rendering

**Components:**
- Extract isometric-poc.ts → @rackula/isometric-renderer npm package
- HTTP wrapper with Hono (lightweight, edge-compatible)
- Zod validation for NetBox-compatible input
- SVG string output

### Phase 2: Production Features (GO if Phase 1 succeeds)

**Scope:** PNG/PDF export, caching, authentication
**Effort:** 20-25 hours additional

**Components:**
- Add resvg-js for PNG (~66ms per image)
- Add jsPDF for PDF generation
- Redis cache with rack hash keys
- API key authentication
- Rate limiting (100 req/min free, higher for paid)

### Phase 3: NetBox Plugin (CONDITIONAL)

**Scope:** Django plugin wrapper
**Effort:** 15-20 hours

**Prerequisites:**
- Demand validation from Phase 1/2
- Spike #320 (Rackula as NetBox plugin) informs plugin patterns
- Community interest

### Phase 4: SaaS Infrastructure (CONDITIONAL)

**Scope:** Paid tiers, billing, analytics
**Effort:** 30-40 hours

**Components:**
- Stripe integration
- Usage metering
- Dashboard for API key management
- Analytics (requests, formats, latency)

---

## Go/No-Go Assessment

| Item | Verdict | Rationale |
|------|---------|-----------|
| MVP API Service | **GO** | Low effort, validates demand |
| resvg-js for PNG | **GO** | Fast, zero deps, quality output |
| Puppeteer for PNG | **NO-GO** | Too slow (4-10s), overkill |
| Freemium pricing | **GO** | Standard SaaS model |
| Self-hosted option | **GO** | Increases adoption |
| NetBox plugin wrapper | **DEFER** | Wait for demand signal |
| GraphQL API | **NO-GO** | REST is simpler, sufficient |
| Real-time WebSocket | **NO-GO** | Unnecessary for static renders |

---

## MVP Definition

### Endpoints

```
POST /render
  - Input: Rack + DeviceTypes JSON
  - Output: SVG string or base64 PNG
  - Auth: API key (optional for free tier)

GET /health
  - Output: Service status

GET /docs
  - Output: OpenAPI spec
```

### Input Schema

```typescript
interface RenderRequest {
  rack: {
    name: string;
    height: number;          // 1-100 U
    devices: Array<{
      name: string;
      position: number;      // Starting U
      height: number;        // U height
      face: 'front' | 'rear';
      is_full_depth: boolean;
      color: string;         // Hex color
      category?: string;     // For icon
    }>;
  };
  options?: {
    format?: 'svg' | 'png';
    theme?: 'dracula' | 'light' | 'dark';
    dualView?: boolean;
    includeLegend?: boolean;
    width?: number;          // Override default
  };
}
```

### Output

- SVG: Raw XML string, Content-Type: image/svg+xml
- PNG: Base64 string or binary, Content-Type: image/png

### Constraints

- Max rack height: 100U
- Max devices: 100 per rack
- Max request size: 1MB
- Rate limit: 100 req/min (free), 1000 req/min (paid)

---

## Effort Estimate (Refined)

| Phase | Task | Hours |
|-------|------|-------|
| 1.1 | Extract isometric math to module | 4 |
| 1.2 | Create HTTP service wrapper | 6 |
| 1.3 | Add Zod validation | 2 |
| 1.4 | Write unit tests | 4 |
| 1.5 | Docker containerization | 2 |
| 1.6 | Documentation | 2 |
| **Phase 1 Total** | | **20** |
| 2.1 | Add resvg-js PNG export | 4 |
| 2.2 | Add jsPDF PDF export | 4 |
| 2.3 | Add caching layer | 4 |
| 2.4 | Add API key auth | 4 |
| 2.5 | Rate limiting | 2 |
| 2.6 | Integration tests | 4 |
| **Phase 2 Total** | | **22** |
| **MVP Total** | | **42 hours** |

---

## Summary

**Question:** Can we provide a backend service that generates isometric 3D rack visualizations for NetBox users?

**Answer:** **Yes, with clear path to production.**

The isometric POC is technically ready for extraction. resvg-js provides fast PNG conversion. NetBox's API provides all necessary data. The recommended approach is:

1. **Phase 1:** Extract renderer, build minimal API (20 hours)
2. **Phase 2:** Add PNG/PDF, caching, auth (22 hours)
3. **Evaluate:** Measure demand before building NetBox plugin

**Final Verdict: GO for Phase 1 + 2 (MVP)**
