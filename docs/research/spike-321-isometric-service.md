# Spike #321: Isometric Rendering Service for NetBox

**Date:** 2025-12-30
**Status:** Complete
**Time Spent:** ~4 hours

---

## Executive Summary

This spike investigated the feasibility of providing a backend service that generates isometric 3D rack visualizations for NetBox users, leveraging Rackula's isometric export work from spike #300.

**Key Finding:** The isometric POC is **production-ready for extraction**. Combined with resvg-js for fast PNG conversion (~66ms) and NetBox's comprehensive rack API, we can build a viable service in ~42 hours of development.

**Recommendation:** **GO** - Proceed with a two-phase MVP:
1. Phase 1: Extract renderer + minimal API (20 hours)
2. Phase 2: Add PNG/PDF + caching + auth (22 hours)

---

## Research Question

> Can we provide a backend service that generates isometric 3D rack visualizations for NetBox users, leveraging Rackula's isometric export work?

## Answer

**Yes.** All technical pieces exist:
- Isometric POC from spike #300 is self-contained and Node.js compatible
- resvg-js provides 100x faster PNG conversion than Puppeteer
- NetBox API exposes all required rack/device data
- Freemium SaaS model is standard and proven

---

## Technical Findings

### Isometric Renderer Status

From spike #300, we have a working POC (`scripts/isometric-poc.ts`):

| Component | Status | Notes |
|-----------|--------|-------|
| Isometric projection math | ✅ Production-ready | Pure functions, tested |
| Cabinet drawing | ✅ Complete | Frame, rails, vents, LEDs |
| Device rendering | ✅ Complete | Full/half-depth, colors |
| Dual-view layout | ✅ Complete | Front + rear side-by-side |
| Legend generation | ✅ Complete | Device swatches |
| SVG output | ✅ Valid | Exports to PNG/PDF |

**Estimated render time:** 100-200ms per rack (jsdom + SVG generation)

### Server-Side Rendering Options

| Tool | Speed | Use Case |
|------|-------|----------|
| **resvg-js** | ~66ms | ✅ Best for isometric (static SVG) |
| Puppeteer | 4-10s | Overkill (browser needed) |
| Sharp | Fast | Better for simple icons |

**Recommendation:** Use resvg-js for PNG conversion.

### NetBox API Compatibility

NetBox provides the `/api/dcim/racks/<id>/elevation/` endpoint with:
- Device positions (supports decimals like 1.5U)
- Face (front/rear)
- Device types with height and depth
- Full metadata (name, role, status)

Data can be fetched directly or passed in request body.

---

## Architecture Recommendation

### MVP Service Architecture

```
┌─────────────────┐     ┌─────────────────────┐     ┌─────────────────┐
│ NetBox/Client   │────▶│ Isometric Service   │────▶│ SVG/PNG/PDF     │
│ POST /render    │     │ (Node.js + jsdom)   │     │                 │
└─────────────────┘     └─────────────────────┘     └─────────────────┘
```

**Stack:**
- Runtime: Node.js 18+
- HTTP: Hono (lightweight, edge-compatible)
- Validation: Zod (already in Rackula stack)
- SVG Generation: jsdom + extracted POC
- PNG Conversion: resvg-js
- PDF Generation: jsPDF
- Deployment: Docker container

### API Design

```
POST /render
  Input:  { rack, devices, options }
  Output: SVG string or PNG base64

GET /health
  Output: Service status
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
      color: string;         // Hex
    }>;
  };
  options?: {
    format?: 'svg' | 'png';
    theme?: 'dracula' | 'light' | 'dark';
    dualView?: boolean;
    includeLegend?: boolean;
  };
}
```

---

## Business Model

### Pricing Tiers

| Tier | Price | Renders/month | Target |
|------|-------|---------------|--------|
| Free | $0 | 100 | Trial/hobby |
| Pro | $9 | 1,000 | Individual |
| Team | $29 | 5,000 | Teams |
| Self-Hosted | Free | Unlimited | Enterprise |

### Deployment Options

1. **SaaS** (hosted by Rackula): Fast start, no ops burden
2. **Self-Hosted** (Docker): Full control, no limits
3. **Hybrid**: Self-host with paid support

---

## Implementation Roadmap

### Phase 1: MVP (20 hours)

| Task | Hours |
|------|-------|
| Extract isometric math to module | 4 |
| Create HTTP service wrapper | 6 |
| Add Zod validation | 2 |
| Write unit tests | 4 |
| Docker containerization | 2 |
| Documentation | 2 |

**Deliverable:** Docker image with SVG endpoint

### Phase 2: Production Features (22 hours)

| Task | Hours |
|------|-------|
| Add resvg-js PNG export | 4 |
| Add jsPDF PDF export | 4 |
| Add caching layer | 4 |
| Add API key auth | 4 |
| Rate limiting | 2 |
| Integration tests | 4 |

**Deliverable:** Full-featured API with PNG/PDF

### Phase 3: NetBox Plugin (DEFERRED)

Wait for:
- Demand validation from Phase 1/2
- Spike #320 findings (Rackula as NetBox plugin)
- Community feedback

---

## Go/No-Go Summary

| Item | Verdict | Rationale |
|------|---------|-----------|
| MVP API Service | **GO** | Low effort, validates demand |
| resvg-js for PNG | **GO** | Fast (66ms), zero deps |
| Freemium pricing | **GO** | Standard model |
| Self-hosted Docker | **GO** | Increases adoption |
| NetBox plugin | **DEFER** | Wait for demand |
| Puppeteer for PNG | **NO-GO** | Too slow |
| GraphQL API | **NO-GO** | REST sufficient |

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Low demand | Free tier + self-hosted reduces barrier |
| Performance issues | resvg-js is 100x faster than browser-based |
| NetBox API changes | Input schema is generic, not NetBox-specific |
| Competition | First-mover advantage, unique isometric style |

---

## Success Metrics

**Phase 1:**
- [ ] Docker image runs locally
- [ ] SVG renders in <200ms
- [ ] 10 unique users try the API

**Phase 2:**
- [ ] PNG renders in <300ms (including resvg-js)
- [ ] 50+ renders/week
- [ ] 1 paying customer

---

## Related Research Files

- `docs/research/321-codebase.md` - Isometric POC analysis
- `docs/research/321-external.md` - Server-side rendering research
- `docs/research/321-patterns.md` - Architecture trade-offs

## Related Issues

- Spike #300: Isometric export POC
- Issue #303: Isometric export feature
- Spike #320: Rackula as NetBox plugin

---

## Conclusion

The isometric rendering service is technically feasible and strategically valuable. The existing POC from spike #300 provides 80% of the rendering logic. With resvg-js for PNG conversion and a simple HTTP wrapper, we can deliver an MVP in 20 hours.

**Next Step:** Create implementation issues for Phase 1 tasks.
