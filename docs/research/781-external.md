# Research Spike #781: Share URL Strategy for Multi-Rack Layouts

## Executive Summary

This research investigates constraints and alternatives for encoding multi-rack layouts in shareable URLs. The current system uses gzip + base64url encoding in query parameters. As layouts grow with multi-rack support, URL length becomes a critical constraint.

**Key findings:**

1. **Safe URL length limit: 2,000 characters** (conservative cross-platform)
2. **Best compression for URLs: lz-string** (designed for URL encoding, ~1KB bundle)
3. **QR codes: Practical limit ~100-200 characters** (use short URL redirects)
4. **Recommended approach: Hybrid** - URL encoding for small layouts, serverless shortener for large ones
5. **Cheapest backend: Cloudflare Workers + KV** (100K reads/day free, no cold starts)

---

## 1. URL Length Limits

### Browser Address Bar Limits

| Browser         | Maximum URL Length                  | Notes                             |
| --------------- | ----------------------------------- | --------------------------------- |
| Google Chrome   | 32,779 characters (some report 2MB) | Most permissive                   |
| Mozilla Firefox | 65,536+ characters                  | Display truncates after 65K       |
| Apple Safari    | 80,000+ characters                  | May show errors after this        |
| Microsoft Edge  | **2,083 characters**                | **Lowest limit - path max 2,048** |
| Opera           | Unlimited                           | No practical limit                |

**Practical limit: 2,083 characters** (Edge is the bottleneck)

### Server-Side Limits

| Server/Service     | Default URL Limit     | Configurable?                          |
| ------------------ | --------------------- | -------------------------------------- |
| Apache             | 8,177 characters      | `LimitRequestLine` (max ~8190 for 2.2) |
| nginx              | 4,096 characters      | `large_client_header_buffers`          |
| Microsoft IIS      | 16,384 characters     | Yes                                    |
| Cloudflare CDN     | **32,768 characters** | No (414 error beyond)                  |
| Amazon CloudFront  | 8,192 characters      | No                                     |
| Fastly CDN         | 8,192 characters      | No                                     |
| Cloudflare Workers | 16,000 characters     | No                                     |

**Rackula consideration:** Currently on GitHub Pages (no server config needed). If using Cloudflare in front, 32KB limit applies.

### Social Media Platform URL Handling

| Platform  | URL Handling                                    | Effective Limit        |
| --------- | ----------------------------------------------- | ---------------------- |
| Twitter/X | t.co shortener auto-applied, counts as 23 chars | Any length (shortened) |
| LinkedIn  | Accepts long URLs, 700-1300 char post limits    | URL itself unlimited   |
| Discord   | 512 char limit for link-style buttons           | Embeds allow longer    |
| Reddit    | Accepts long URLs                               | No documented limit    |

**Key insight:** Social platforms auto-shorten or have generous limits. The bottleneck is browsers and QR codes, not social sharing.

### URL Shortener Input Limits

| Service   | Maximum Input URL Length | Output Format     |
| --------- | ------------------------ | ----------------- |
| **Bitly** | **2,048 characters**     | bit.ly/xxxxx      |
| TinyURL   | ~3,000+ (undocumented)   | tinyurl.com/xxxxx |
| is.gd     | 5,000 characters         | is.gd/xxxxx       |

**Critical constraint:** Bitly's 2,048 char limit means users cannot use Bitly to shorten very long Rackula URLs. This is a UX problem if layouts exceed ~2KB encoded.

### Recommendations for URL Length

1. **Target: Keep URLs under 2,000 characters** for universal compatibility
2. **Fallback:** Implement own shortener for layouts exceeding this
3. **Never exceed 8,000 characters** (nginx default, common proxy limit)

---

## 2. Compression Algorithms for URL Data

### Algorithm Comparison

| Algorithm     | Compression Ratio | Speed (Browser)       | Bundle Size      | URL-Safe Output                           |
| ------------- | ----------------- | --------------------- | ---------------- | ----------------------------------------- |
| **lz-string** | 50-70% reduction  | Fast (~10x LZMA)      | **~1KB gzipped** | **Yes** (`compressToEncodedURIComponent`) |
| pako (gzip)   | 60-75% reduction  | Fast                  | ~26KB gzipped    | No (needs base64url)                      |
| LZMA-JS       | 70-85% reduction  | Slow (use Web Worker) | 9KB gzipped      | No                                        |
| Brotli (WASM) | 75-90% reduction  | Medium                | **681KB**        | No                                        |
| lz4           | 40-50% reduction  | Very fast             | ~5KB             | No                                        |

### Detailed Analysis

#### lz-string (Recommended for URLs)

```typescript
import LZString from "lz-string";

// Compress to URL-safe string (no base64 needed!)
const compressed = LZString.compressToEncodedURIComponent(jsonString);
const url = `https://racku.la/?d=${compressed}`;

// Decompress
const original = LZString.decompressFromEncodedURIComponent(urlParam);
```

**Pros:**

- Designed specifically for URL and localStorage encoding
- Native URL-safe output (no additional encoding step)
- Tiny bundle size (~1KB gzipped when served)
- Synchronous, no Web Workers needed
- Works great for strings < 750KB

**Cons:**

- Lower compression ratio than LZMA/Brotli for large data
- Not as efficient as gzip for very large strings (750K+)

**Benchmark (100KB JSON):**

- lz-string: 99,884 bytes -> 11,862 bytes (88% reduction)
- pako: 99,884 bytes -> 17,563 bytes (82% reduction)

#### pako (Current Rackula Choice)

```typescript
import pako from "pako";

const compressed = pako.deflate(jsonString);
const base64url = btoa(String.fromCharCode(...compressed))
  .replace(/\+/g, "-")
  .replace(/\//g, "_")
  .replace(/=/g, "");
```

**Pros:**

- Good compression ratio
- Battle-tested, produces identical output to zlib
- 26KB is reasonable for most apps

**Cons:**

- Requires base64url encoding step (adds ~33% size)
- Bundle larger than lz-string

#### LZMA-JS (Best Compression, Slowest)

**Pros:**

- Best compression ratio (can reduce gzipped content by another 33%)
- Supports Web Workers for non-blocking compression

**Cons:**

- Significantly slower than lz-string/pako
- Overkill for URL encoding where size differences matter less

#### Brotli (WASM)

**Pros:**

- Excellent compression ratio

**Cons:**

- **681KB bundle size** (static dictionary embedded in WASM)
- Async-only in browsers (WASM limitation)
- Not worth it for client-side URL encoding

### Recommendation

**Switch from pako to lz-string for URL encoding:**

1. **Smaller bundle:** ~1KB vs ~26KB
2. **Better URL output:** Native URL-safe encoding, no base64 overhead
3. **Simpler code:** One function call vs compression + encoding
4. **Better compression for typical layout sizes:** ~88% vs ~82% for JSON

**Migration example:**

```typescript
// Before (pako)
const compressed = pako.deflate(JSON.stringify(layout));
const encoded = base64url.encode(compressed);

// After (lz-string)
const encoded = LZString.compressToEncodedURIComponent(JSON.stringify(layout));
```

### Binary Serialization Note (msgpack)

**Not recommended for URL encoding:**

- MessagePack provides ~30-50% size reduction vs JSON uncompressed
- When gzipped, JSON and MessagePack have nearly identical sizes
- Adds complexity without meaningful benefit for URL use case
- MessagePack shines in server-to-server communication, not browser URLs

---

## 3. QR Code Capacity Constraints

### Maximum Data Capacity (Version 40, 177x177 modules)

| Error Correction | Numeric | Alphanumeric | Binary (bytes) | Kanji |
| ---------------- | ------- | ------------ | -------------- | ----- |
| Low (L)          | 7,089   | 4,296        | **2,953**      | 1,817 |
| Medium (M)       | 5,596   | 3,391        | 2,331          | 1,435 |
| Quartile (Q)     | 3,993   | 2,420        | 1,663          | 1,024 |
| High (H)         | 3,057   | 1,852        | 1,273          | 784   |

**Theoretical max: 2,953 bytes** (binary mode, low error correction)

### Practical Scanning Limits

| Version | Modules | Capacity (Alphanumeric) | Practical Use                          |
| ------- | ------- | ----------------------- | -------------------------------------- |
| 3-4     | 29-33   | ~134 characters         | Business cards, marketing              |
| 6       | 41      | ~224 characters         | Maximum for reliable scanning          |
| 10      | 57      | ~395 characters         | Requires good lighting, steady camera  |
| 40      | 177     | ~4,296 characters       | **Nearly impossible to scan reliably** |

### Key Insights

1. **Never encode full layout URLs in QR codes**
   - Version 40 codes are theoretically possible but practically unscannable
   - Dense modules require perfect printing and camera positioning

2. **Use dynamic QR codes (short redirects)**
   - Dynamic QR codes contain only 20-30 characters
   - Always Version 2-3 size (25-29 modules)
   - Consistent scanning reliability regardless of content complexity

3. **Recommended approach:**

```
QR Code -> https://racku.la/s/abc123 -> (server redirect) -> full URL
```

### Best Practices for QR + Long URLs

1. **URL length in QR: Max 100-200 characters**
2. **Error correction: Level M** (balance between capacity and resilience)
3. **Use redirects:** Short URL in QR, full URL behind server
4. **Test at print size:** Always test QR scanning before production use

---

## 4. How Similar Tools Handle Long URLs

### draw.io / diagrams.net

**Approach:** Compressed XML in URL + size limits

```
https://app.diagrams.net/#U{uri_encoded_url}
https://app.diagrams.net/?lightbox=1&edit=_blank&title=...#R{compressed_xml}
```

**Implementation:**

- Uses compressed XML encoding in URL hash
- Export as URL option available (File > Export > Export as URL)
- **Size limit exists** - very large diagrams cannot be encoded
- Embedded diagram data included in exports (SVG, PNG, PDF)
- Provides conversion tools at `jgraph.github.io/drawio-tools/`

**Lesson:** Accept that URL encoding has limits; provide file export alternatives.

### Excalidraw

**Approach:** End-to-end encrypted server storage

```
https://excalidraw.com/#json={id},{encryption_key}
```

**Implementation:**

1. Generate random encryption key (client-side)
2. Encrypt drawing data with AES
3. Upload encrypted blob to server (server cannot read content)
4. URL contains: short ID + encryption key in hash fragment
5. Key never sent to server (stays in URL hash)

**Key insight:** The encryption key is in the URL hash (`#`), which browsers don't send to servers. This enables E2E encryption while using server storage.

**Version control for collaboration:**

- Each element has a `version` number and `versionNonce`
- Higher version wins; random nonce breaks ties
- Tombstoning for deletions (isDeleted flag)

**Lesson:** Server storage + client-side encryption = privacy + unlimited size.

### Figma

**Approach:** Server-stored files with permission system

```
https://figma.com/design/{file_key}/{file_name}
```

**Implementation:**

- All state stored server-side
- URL is just a pointer (file_key)
- Permissions controlled via sharing settings
- No state in URL beyond file identifier

**Lesson:** For complex tools, server storage is the norm. URLs are identifiers, not data containers.

### CodePen / JSFiddle

**Approach:** Server storage with unique IDs

```
https://codepen.io/user/pen/abc123
https://jsfiddle.net/user/abc123/
```

- All code stored server-side
- URLs are short identifiers
- No URL-based state sharing (requires account)

### JSPen (Serverless Alternative)

**Approach:** Full state in URL (like current Rackula)

```
https://jspen.co/#v=1&code={lz-string-compressed-code}
```

**Implementation:**

- Uses lz-string compression
- Entire page state encoded in URL hash
- No server storage (truly serverless)
- Built own URL shortener for very long URLs (stored in BunnyCDN)

**Lesson:** URL-only approach works but needs a shortener fallback.

### Compiler Explorer (Godbolt)

**Approach:** Evolved from URL-only to hybrid

**History:**

1. **2012:** Entire state in URL
2. **2014:** Added goo.gl shortener integration
3. **2018:** Built own shortener (goo.gl sunset)

**Current implementation:**

```
https://godbolt.org/z/{short_hash}
```

- Hash the state, store on S3
- DynamoDB maps short hash -> full S3 path
- Handles partial collisions
- **Lesson learned:** "Never trust a third-party service with your core infrastructure"

**Lesson:** Start with URL encoding, add own shortener when needed. Don't depend on external shorteners.

### Summary: State Sharing Patterns

| Tool                  | State Location         | URL Length            | Requires Server |
| --------------------- | ---------------------- | --------------------- | --------------- |
| draw.io               | URL (compressed)       | Variable (has limits) | No              |
| Excalidraw            | Server (E2E encrypted) | Short                 | Yes             |
| Figma                 | Server                 | Short                 | Yes             |
| CodePen               | Server                 | Short                 | Yes             |
| JSPen                 | URL (compressed)       | Long                  | Shortener only  |
| Godbolt               | Server                 | Short                 | Yes             |
| **Rackula (current)** | URL (gzip+base64)      | Long                  | No              |

**Recommendation for Rackula:**

1. Keep URL encoding for small-medium layouts (< 2KB)
2. Add optional shortener for large layouts
3. Consider E2E encrypted storage for collaboration features

---

## 5. Serverless URL Shortener Options

### Option 1: Cloudflare Workers + KV (Recommended)

**Free tier:**

- 100,000 reads/day
- 1,000 writes/day
- 1 GB total storage
- No cold starts (edge deployment)

**Implementation complexity:** Low (12-50 lines of code)

**Example minimal implementation:**

```javascript
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const slug = url.pathname.slice(1);

    if (slug) {
      const target = await env.KV.get(slug);
      if (target) return Response.redirect(target, 301);
      return new Response("Not found", { status: 404 });
    }

    // Create short URL
    if (request.method === "POST") {
      const { url: longUrl } = await request.json();
      const slug = crypto.randomUUID().slice(0, 8);
      await env.KV.put(slug, longUrl);
      return new Response(
        JSON.stringify({ short: `https://s.racku.la/${slug}` }),
      );
    }
  },
};
```

**Pros:**

- Generous free tier for a hobby project
- Edge deployment (fast globally)
- Simple KV API
- No cold starts

**Cons:**

- Cloudflare ecosystem lock-in
- KV is eventually consistent (not instant)

### Option 2: Vercel KV

**Free tier:**

- 30,000 requests/month (Hobby plan)
- 0.25 GB storage
- 10,000 requests/day limit

**Implementation complexity:** Low (similar to Cloudflare)

**Pros:**

- Good if already on Vercel
- Redis-based (familiar API)

**Cons:**

- **Lower free tier than Cloudflare**
- Cold starts on Edge Functions
- More expensive at scale ($0.25/GB, $0.20/100K requests)

### Option 3: Supabase

**Free tier:**

- 500 MB database
- 10K monthly active users
- 1 GB bandwidth/month

**Implementation complexity:** Medium (need to set up table, API)

**Critical limitation:**

- **Projects auto-pause after 7 days of inactivity**
- Not suitable for production without ping workaround

**Pros:**

- Full PostgreSQL database
- Row-level security available
- Good for apps needing more than just KV storage

**Cons:**

- Overkill for just URL shortening
- Auto-pause makes it unsuitable for always-on services
- Higher complexity than KV solutions

### Option 4: Firebase Realtime Database

**Free tier:**

- 1 GB storage
- 10 GB/month download
- 100 simultaneous connections

**Implementation complexity:** Medium

```javascript
import { getDatabase, ref, set, get } from "firebase/database";

// Write
await set(ref(db, `urls/${slug}`), { target: longUrl, created: Date.now() });

// Read
const snapshot = await get(ref(db, `urls/${slug}`));
```

**Pros:**

- Generous free tier
- Real-time updates (useful for collaboration)
- Good documentation

**Cons:**

- Firebase SDK is heavy (~100KB)
- Google ecosystem lock-in
- More complex setup than Cloudflare KV

### Option 5: BunnyCDN Storage (Budget Option)

**Pricing:**

- $0.01/GB storage/month
- $0.01/GB bandwidth

**Implementation:** Used by JSPen for their shortener

**Pros:**

- Extremely cheap
- Simple storage API
- Good for static content

**Cons:**

- Not a database (just file storage)
- Need to build redirect logic separately
- Less developer-friendly than KV solutions

### Comparison Summary

| Service           | Free Tier      | Complexity | Cold Starts | Best For         |
| ----------------- | -------------- | ---------- | ----------- | ---------------- |
| **Cloudflare KV** | 100K reads/day | Low        | None        | **Recommended**  |
| Vercel KV         | 30K/month      | Low        | Minimal     | Vercel users     |
| Supabase          | 500MB, pauses  | Medium     | Yes         | Apps needing SQL |
| Firebase          | 1GB            | Medium     | Minimal     | Real-time needs  |
| BunnyCDN          | $0.01/GB       | High       | N/A         | Budget priority  |

### Minimal Requirements for a Persistent URL Shortener

1. **Key-value storage:** Map short IDs to full URLs
2. **Read endpoint:** Redirect short URL to full URL
3. **Write endpoint:** Create new short URL (authenticated)
4. **Collision handling:** Ensure unique short IDs

**Estimated usage for Rackula:**

- Assume 1,000 active users
- Average 5 layouts shared/user/month = 5,000 writes/month
- Each shared layout viewed 10 times = 50,000 reads/month

**Cloudflare free tier handles this easily** (100K reads/day = 3M/month)

---

## 6. Recommendations for Rackula

### Immediate Actions

1. **Switch compression library:**
   - Replace pako with lz-string
   - Smaller bundle, better URL output
   - Migration is straightforward

2. **Set URL length threshold:**
   - If compressed URL < 2,000 chars: Use URL encoding (current approach)
   - If compressed URL >= 2,000 chars: Show "URL too long" with shortener option

### Short-Term (Next Release)

3. **Implement Cloudflare Workers shortener:**
   - Subdomain: `s.racku.la` or `l.racku.la`
   - Simple KV-based redirect
   - Only create short URLs when needed

4. **QR code feature:**
   - Always use shortened URL for QR codes
   - Target Version 3-4 QR codes (max ~100 chars)

### Medium-Term (Multi-Rack Support)

5. **Consider E2E encrypted storage:**
   - Follow Excalidraw pattern
   - Encryption key in URL hash (never sent to server)
   - Enables larger layouts without URL length concerns
   - Enables future collaboration features

6. **Fallback export options:**
   - "URL too long? Download layout file instead"
   - Provide `.rackula` file export as alternative

### URL Strategy Decision Tree

```
User clicks "Share"
    |
    v
Compress layout with lz-string
    |
    v
URL length < 2,000 chars?
    |
   YES -> Use direct URL (no server needed)
    |
    NO -> Create short URL via Cloudflare KV
          |
          v
          Show short URL to user
```

### Cost Projection

**For a hobby project with ~1,000 users:**

- Cloudflare Workers: **Free** (well within limits)
- Custom domain for shortener: ~$10/year

**At scale (10,000+ users):**

- Cloudflare Workers paid: $5/month base
- Still very affordable

---

## Sources

### URL Length Limits

- [Maximum length of a URL in different browsers - GeeksforGeeks](https://www.geeksforgeeks.org/computer-networks/maximum-length-of-a-url-in-different-browsers/)
- [What Is the Maximum Length of a URL? - Baeldung](https://www.baeldung.com/cs/max-url-length)
- [Bitly Character Limit for Links](https://support.bitly.com/hc/en-us/articles/16463240477069-What-s-the-character-limit-for-Bitly-Links)
- [Cloudflare Community - URL Length](https://community.cloudflare.com/t/loadbalancing-url-length-16k-vs-32k/379870)

### Compression Algorithms

- [npm-compare: compression vs pako vs lz-string](https://npm-compare.com/compression,lz-string,lz4,lzutf8,pako)
- [lz-string GitHub](https://github.com/pieroxy/lz-string)
- [lz-string: JavaScript compression, fast!](https://pieroxy.net/blog/pages/lz-string/index.html)
- [LZMA-JS GitHub](https://github.com/LZMA-JS/LZMA-JS)
- [brotli-wasm GitHub](https://github.com/httptoolkit/brotli-wasm)
- [Msgpack vs JSON with gzip](https://www.peterbe.com/plog/msgpack-vs-json-with-gzip)

### QR Codes

- [QR Code Information Capacity and Versions - DENSO WAVE](https://www.qrcode.com/en/about/version.html)
- [QR Code Storage Capacity Guide - QRCodeChimp](https://www.qrcodechimp.com/qr-code-storage-capacity-guide/)
- [QR Code Data Size Best Practices](https://www.the-qrcode-generator.com/blog/qr-code-data-size)

### Similar Tools

- [Encode a diagram in a URL - draw.io](https://www.drawio.com/doc/faq/export-to-url)
- [Excalidraw End-to-End Encryption](https://plus.excalidraw.com/blog/end-to-end-encryption)
- [Excalidraw P2P Collaboration](https://plus.excalidraw.com/blog/building-excalidraw-p2p-collaboration-feature)
- [Creating JSPen - Medium](https://medium.com/swlh/creating-jspen-a-codepen-like-editor-that-stores-pages-in-urls-b163934f06c8)
- [Compiler Explorer's New State Storage](https://xania.org/201808/compiler-explorer-new-state-storage)
- [Compiler Explorer URLs Forever](https://xania.org/202505/compiler-explorer-urls-forever)

### Serverless URL Shorteners

- [Cloudflare Workers KV Pricing](https://developers.cloudflare.com/kv/platform/pricing/)
- [Build a Link Shortener with Cloudflare Workers](https://dev.to/mmascioni/build-a-link-shortener-with-cloudflare-workers-1j3i)
- [Vercel KV Pricing](https://vercel.com/docs/storage/vercel-kv/usage-and-pricing)
- [Supabase Limits](https://supabase.com/docs/guides/functions/limits)
- [Firebase URL Shortener Tutorial](https://medium.com/firebase-developers/firebase-url-shortener-7754377478e0)
- [Shorty - Cloudflare URL Shortener](https://github.com/lklynet/shorty)
