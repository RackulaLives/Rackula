# External Research - Spike #321: Isometric Rendering Service

**Date:** 2025-12-30
**Author:** Claude (automated research)

---

## Executive Summary

This research investigates the feasibility of providing a backend service that generates isometric 3D rack visualizations for NetBox users. Key findings:

1. **NetBox API provides all necessary data** via `/api/dcim/racks/<id>/elevation/` endpoint
2. **resvg-js is ideal for server-side SVG→PNG** (Rust-powered, ~66ms per render)
3. **Multiple integration patterns available**: webhook, API proxy, or embedded plugin
4. **Pricing models range from free tier to per-render** ($0.001-0.01 typical)

---

## NetBox API Analysis

### Rack Elevation Endpoint

NetBox provides a dedicated endpoint for rack data:
```
GET /api/dcim/racks/<id>/elevation/
```

Parameters:
- `render=svg` - Render as SVG (NetBox's basic 2D view)
- `face=front|rear` - Which face to show
- `unit_width=300` - Unit width in pixels
- `unit_height=35` - Unit height in pixels

### Device Position Data

NetBox returns:
- Device position (U number, supports decimals like 1.5)
- Face (front/rear)
- Device type with height (`u_height`)
- Half-depth flag
- Device metadata (name, status, role, etc.)

### API Access Requirements

- REST API token required for all operations
- JSON response format
- Pagination with `limit` and `offset` parameters
- Config context can be excluded for performance: `?exclude=config_context`

**Sources:**
- [NetBox REST API Overview](https://netboxlabs.com/docs/netbox/integrations/rest-api/)
- [Racks Documentation](https://netboxlabs.com/docs/netbox/models/dcim/rack/)

---

## Server-Side SVG Rendering Options

### Option 1: resvg-js (Recommended)

**Description:** Rust-powered SVG renderer with Node.js bindings via napi-rs.

| Metric | Value |
|--------|-------|
| Render speed | ~55-66ms per image |
| Memory | Low footprint |
| Dependencies | Zero (native binary) |
| Platform support | Windows, macOS, Linux, WebAssembly |

**Pros:**
- Fast: 12 ops/s vs 9 ops/s for sharp
- Consistent cross-platform output
- No browser required
- Supports custom fonts and system fonts

**Cons:**
- Limited to PNG output (no AVIF, WebP)
- No dynamic SVG features (animations, scripting)

**Source:** [resvg-js GitHub](https://github.com/thx/resvg-js)

### Option 2: Puppeteer/Playwright

**Description:** Headless browser for rendering.

| Metric | Value |
|--------|-------|
| Render speed | 4-10 seconds for batch |
| Memory | High (full browser) |
| Dependencies | Chromium |
| Platform support | All major platforms |

**Pros:**
- Browser-accurate rendering
- Supports all CSS/SVG features
- PDF generation built-in

**Cons:**
- Slower (5-10s for 20 images)
- Higher memory usage
- Occasional rendering inconsistencies

**Source:** [Puppeteer Issues](https://github.com/puppeteer/puppeteer/issues/2556)

### Option 3: Sharp (via librsvg)

**Description:** High-performance image processing library.

| Metric | Value |
|--------|-------|
| Render speed | Fast for bulk operations |
| Memory | Moderate |
| Dependencies | Native dependencies |

**Pros:**
- 3x faster than resvg-js for bulk simple icons
- Wide format support (WebP, AVIF, etc.)

**Cons:**
- May not handle complex SVGs as well
- Less consistent emoji/text rendering

**Source:** [sharp-vs-resvgjs Benchmark](https://github.com/privatenumber/sharp-vs-resvgjs)

### Recommendation

**Use resvg-js for isometric renders** because:
1. Our SVGs are static (no animations)
2. ~66ms per render is acceptable latency
3. Consistent output across environments
4. Zero dependencies simplifies deployment

---

## NetBox Integration Patterns

### Pattern 1: External API Service

NetBox → HTTP request → Isometric Service → PNG/SVG response

**Pros:**
- Decoupled architecture
- Independent scaling
- Can serve multiple NetBox instances

**Cons:**
- Requires external hosting
- Network latency
- Authentication complexity

### Pattern 2: NetBox Plugin + Webhook

NetBox event → Webhook → Isometric Service → Stores result

**Pros:**
- Event-driven (auto-regenerate on changes)
- Uses NetBox's built-in webhook system
- Can cache rendered images

**Cons:**
- More complex setup
- Webhook configuration per instance

### Pattern 3: NetBox Plugin with Embedded Rendering

Plugin directly calls rendering service API.

**Pros:**
- Seamless integration
- Single deployment
- Access to NetBox auth

**Cons:**
- Plugin must handle async rendering
- Couples service to NetBox version

### Recommendation

**Start with Pattern 1 (External API)** for simplicity, then add plugin wrapper (Pattern 3) for deeper integration.

---

## Pricing Models Research

### Industry Benchmarks (AI Image APIs)

| Provider | Price per Image | Model |
|----------|----------------|-------|
| OpenAI DALL-E | $0.01-0.17 | Pay-per-use |
| Runware | $0.0006-0.24 | Pay-per-use |
| Leonardo.Ai | Custom | Subscription + usage |
| Novita | $0.0015 | Pay-per-use |

### Proposed Pricing Tiers

**Free Tier:**
- 100 renders/month
- SVG output only
- Rate limited (10 req/min)

**Pro Tier ($9/month):**
- 1,000 renders/month
- PNG + SVG output
- Higher rate limit (60 req/min)
- Custom themes

**Enterprise:**
- Unlimited renders
- Self-hosted option
- Priority support
- Custom integrations

### Self-Hosted Option

Offer Docker image for self-hosting:
- Free for self-hosting
- No usage limits
- Requires own infrastructure

---

## Authentication Considerations

### API Key Authentication

```
GET /api/render?rack_id=123
Authorization: Bearer <api_key>
```

**Pros:**
- Simple to implement
- Works for all integration patterns
- Easy to rotate/revoke

### NetBox Token Passthrough

Service accepts NetBox API token, fetches rack data directly.

**Pros:**
- No duplicate data in request
- Respects NetBox permissions
- Simpler client implementation

**Cons:**
- Service needs NetBox URL
- Token exposure to third party

### Recommendation

**Use API key for service auth** + optional NetBox token passthrough for data fetching.

---

## Performance Considerations

### Caching Strategy

| Cache Layer | TTL | Purpose |
|-------------|-----|---------|
| CDN edge cache | 1 hour | Reduce service load |
| In-memory cache | 5 min | Hot requests |
| Persistent cache | 24 hours | Reduce re-renders |

**Cache Key:**
```
{rack_id}:{face}:{theme}:{format}:{hash(device_positions)}
```

### Invalidation

Options:
1. **Time-based**: Cache expires after TTL
2. **Webhook-based**: NetBox webhook on rack/device change
3. **ETag/versioning**: Include rack modified timestamp

### Expected Performance

| Scenario | Latency |
|----------|---------|
| Cache hit | <50ms |
| Cache miss (SVG) | ~100ms |
| Cache miss (PNG) | ~150-200ms |
| Cold start (serverless) | +500-1000ms |

---

## Hosting Options

### Option A: Serverless (AWS Lambda, Vercel, Cloudflare Workers)

**Pros:**
- Pay-per-use
- Auto-scaling
- Low maintenance

**Cons:**
- Cold start latency
- Size limits for Puppeteer (if needed)
- Platform lock-in

**Best for:** Low-moderate volume, variable traffic

### Option B: Container (Docker on VPS/ECS/GKE)

**Pros:**
- Predictable performance
- Full control
- Persistent cache

**Cons:**
- Always-on costs
- Manual scaling
- More ops burden

**Best for:** Consistent traffic, enterprise self-hosting

### Option C: Hybrid

Serverless edge + container origin:
- CDN caches at edge
- Container handles cache misses
- Best of both worlds

### Recommendation

**Start with Vercel/Cloudflare Workers** for MVP (free tier available), migrate to container if needed.

---

## Technical Requirements Summary

### Minimum Viable Service

1. **Endpoint:** `POST /render`
2. **Input:** Rack data JSON (from NetBox API)
3. **Output:** SVG (default), PNG (optional)
4. **Dependencies:** Node.js 18+, resvg-js
5. **Auth:** API key

### Input Schema

```typescript
interface RenderRequest {
  rack: {
    id: number;
    name: string;
    height: number;  // U
  };
  devices: Array<{
    name: string;
    position: number;
    height: number;
    face: 'front' | 'rear';
    is_full_depth: boolean;
    device_type: {
      model: string;
      manufacturer: string;
    };
  }>;
  options?: {
    theme?: 'dracula' | 'light' | 'dark';
    format?: 'svg' | 'png';
    width?: number;
  };
}
```

### Response

```typescript
interface RenderResponse {
  format: 'svg' | 'png';
  width: number;
  height: number;
  data: string;  // Base64 for PNG, raw for SVG
  cache_key: string;
}
```

---

## External Sources

- [NetBox REST API Overview](https://netboxlabs.com/docs/netbox/integrations/rest-api/)
- [NetBox Webhooks Documentation](https://netboxlabs.com/docs/netbox/integrations/webhooks/)
- [resvg-js GitHub](https://github.com/thx/resvg-js)
- [sharp-vs-resvgjs Benchmark](https://github.com/privatenumber/sharp-vs-resvgjs)
- [Runware Pricing](https://runware.ai/pricing)
- [NetBox Plugin Architecture](https://deepwiki.com/netbox-community/netbox/2.2-plugin-architecture)
