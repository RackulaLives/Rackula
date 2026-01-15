# GitHub/Git Integration Research for Layout Sync

**Issue:** #622
**Date:** 2026-01-14
**Purpose:** Research technical approaches for syncing Rackula layouts via GitHub

---

## Technical Approaches

### isomorphic-git

[isomorphic-git](https://isomorphic-git.org/) is a pure JavaScript implementation of git that works in both Node.js and browser environments.

**Capabilities:**

- Clone, fetch, push, pull operations
- Branch and tag management
- Commit creation and history viewing
- Raw git object access
- PGP signing support
- Works in WebWorkers and ServiceWorkers

**Browser Requirements:**

- Requires a virtual filesystem (see LightningFS below)
- Requires CORS proxy for cross-origin git operations
- Supported: Chrome, Edge, Firefox, Safari, Android, iOS

**Critical Limitation - CORS:**
Due to same-origin policy, isomorphic-git can only clone from the same origin as the webpage by default. For GitHub operations, a CORS proxy is required.

**CORS Proxy Options:**

1. **[@isomorphic-git/cors-proxy](https://github.com/isomorphic-git/cors-proxy)** - Self-hosted proxy
2. **CloudFlare Workers** - Serverless proxy option
3. **<https://cors.isomorphic-git.org>** - Free proxy (sponsored by Clever Cloud, for testing/small projects only)

**File System - LightningFS:**
[LightningFS](https://github.com/isomorphic-git/lightning-fs) is the recommended virtual filesystem:

- Uses IndexedDB for persistence
- Only implements the subset of `fs` API needed by isomorphic-git
- 500ms debounce for IndexedDB writes
- Alternative: ZenFS, Filer

**Bundler Considerations (Vite):**
With Vite, you may encounter "Module 'buffer' has been externalized for browser compatibility" error. Fix by adding the `buffer` package.

**Performance Note:**
May not match native git performance for large repositories due to lack of native bindings.

**Verdict:** Full git operations possible but requires CORS proxy infrastructure. Best for scenarios requiring actual git history/branching.

---

### GitHub REST API

The [GitHub REST API](https://docs.github.com/en/rest) provides direct file operations without needing full git clone.

**CORS Support:**
GitHub REST API **fully supports CORS** for browser requests:

- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Headers: Authorization, Content-Type, If-Match, If-Modified-Since, If-None-Match, If-Unmodified-Since, X-Requested-With`
- `Access-Control-Allow-Methods: GET, POST, PATCH, PUT, DELETE`

**Contents API Operations:**

- `GET /repos/{owner}/{repo}/contents/{path}` - Read file
- `PUT /repos/{owner}/{repo}/contents/{path}` - Create/update file (requires `sha` for updates)
- `DELETE /repos/{owner}/{repo}/contents/{path}` - Delete file

**Important Constraints:**

- 1MB file size limit per file
- Concurrent requests to same file will conflict (use serial operations)
- Content must be Base64 encoded
- Requires `workflow` scope for workflow files

**Committing Multiple Files:**
Process requires creating Blobs, Trees, and Commits via Git Data API:

1. Create Blobs for each file
2. Create Tree with Blob SHAs
3. Create Commit with Tree SHA
4. Update branch ref

**Rate Limits (as of May 2025):**

| Type                      | Limit                                          |
| ------------------------- | ---------------------------------------------- |
| Unauthenticated           | 60 requests/hour                               |
| Authenticated (PAT/OAuth) | 5,000 requests/hour                            |
| GitHub Enterprise Cloud   | 15,000 requests/hour                           |
| GitHub App (installation) | 5,000+ requests/hour (scales with repos/users) |

**JavaScript Libraries:**

- **[Octokit](https://github.com/octokit/octokit.js)** - Official GitHub SDK for browsers, Node.js, Deno
  - Full TypeScript support
  - Both REST and GraphQL APIs
  - 100% test coverage
  - Modular packages: `@octokit/core`, `@octokit/rest`, `@octokit/graphql`
- **[GitHub.js](https://www.audero.it/blog/2015/10/17/upload-files-on-github-using-github-js/)** - Lighter alternative
- **Octokat.js** - Good for commit operations with CORS support

**Verdict:** Best for simple file sync without full git history. Native CORS support is a major advantage.

---

### GitHub Gist API

An alternative approach using Gists for layout storage.

**Advantages:**

- Simpler than repository operations
- Built-in versioning
- Can be public or secret (unlisted)
- Easy sharing via URL

**Libraries:**

- [simple-github-gist-api](https://www.npmjs.com/package/simple-github-gist-api) - Promise-based, in-memory edits with explicit save
- [gists (npm)](https://github.com/jonschlinkert/gists) - Full Gist API methods

**Considerations:**

- Less organized than repository structure
- No folder hierarchy
- Commit-based updates (each save = new commit ID)

**Verdict:** Good for quick sharing, less suitable for structured project files.

---

## OAuth/Authentication

### Authentication Options Comparison

| Method                      | Best For                               | Browser SPA Support          | Security           |
| --------------------------- | -------------------------------------- | ---------------------------- | ------------------ |
| Personal Access Token (PAT) | Personal tools, dev workflows          | Requires user to paste token | User manages token |
| OAuth App                   | User-centric access, broad permissions | Yes (legacy)                 | Less granular      |
| GitHub App                  | Production apps, fine-grained control  | Yes (2025 SPA support!)      | Best               |

### Personal Access Tokens

**Fine-grained vs Classic:**

- **Fine-grained (Recommended):** Per-repository access, specific permissions, required expiration, org approval support
- **Classic:** Blanket repository access, never expires, simpler setup

**For Rackula layouts, minimum permissions needed:**

- `Contents: Read and write` (for file operations)
- `Metadata: Read` (always required)

### OAuth Flow (Legacy Approach)

Traditional OAuth requires a backend server for token exchange because:

- Client secret must be kept secure
- Token endpoint historically lacked CORS headers

**Workaround:** Use a serverless function (Cloudflare Worker, Vercel Edge) for token exchange.

### GitHub Apps with PKCE (Announced July 2025)

As of [July 2025](https://github.blog/changelog/2025-07-14-pkce-support-for-oauth-and-github-app-authentication/), GitHub added PKCE support for OAuth and GitHub Apps.

**What This Means:**

- SPAs can authenticate without a backend!
- No client secret required for public clients
- Uses `code_challenge`/`code_verifier` pattern
- Only S256 method supported

**Limitations (as of January 2026):**

- CORS on token endpoint still being implemented
- Client secret still required (public client distinction not yet available)
- Native apps/SPAs need to wait for these restrictions to be removed

**Implementation:**

1. Generate code verifier (random string)
2. Create code challenge (SHA256 hash, base64url encoded)
3. Include `code_challenge` and `code_challenge_method=S256` in auth URL
4. Include `code_verifier` when exchanging code for token

**Benefits of GitHub Apps over OAuth Apps:**

- Short-lived tokens (1-hour, auto-refresh)
- Fine-grained permissions
- Higher rate limits (scales with usage)
- Works independently of user
- Persists when users leave org

---

## Similar Implementations

### Excalidraw

**Current State:** No native GitHub integration built-in.

**Proposed Features (Discussion #2716):**

- "Edit on Excalidraw" button that opens JSON from GitHub
- "Update on GitHub" button to create/update PRs
- @octokit maintainer offered implementation help

**Current Workarounds:**

1. **PNG with Embedded Scene:** Export as PNG with "Embed Scene" option. The JSON is embedded in the PNG metadata, allowing the PNG to be re-edited by dragging onto Excalidraw.
2. **NotesHub App:** Third-party app with GitHub integration for Excalidraw SVG files
3. **MCP Integration:** WebSocket-based real-time sync (for AI collaboration)

**Key Insight:** Embedding data in export files (PNG/SVG) is a clever approach that sidesteps sync complexity.

---

### Obsidian Git Plugin

[obsidian-git](https://github.com/Vinzent03/obsidian-git) provides full git integration for Obsidian vaults.

**Architecture:**

- Uses native git (not isomorphic-git) since Obsidian is Electron-based
- Automatic commit-and-sync on schedule
- Pull on startup
- Source Control View for staging/unstaging
- History View for commit log
- Diff View with line-by-line changes

**Key Features:**

- Stage/reset changes from editor signs
- Navigate between hunks
- Submodule support

**Alternative - Obsidian-GitHub-Sync:**
A simpler ~200 SLOC alternative:

- No branching (main only)
- Uses Node.js Git API
- Push-to-main workflow

**Relevance:** Demonstrates that auto-commit intervals work well for document sync. Users don't need manual save-to-GitHub actions.

---

### Logseq

**Approach:** External git sync (not built into core app).

**Implementation Options:**

1. **Desktop:** Local git with scripts or GitHub Desktop
2. **Android:** Termux with pull/push scripts + Termux Widget
3. **iOS:** a-shell or Working Copy + Shortcuts automation

**Third-party Backend:**
[logseq-sync](https://github.com/bcspragu/logseq-sync) - Self-hosted open-source Logseq Sync backend:

- SQLite persistence
- Signed blob downloads
- Requires a modified Logseq codebase

**Key Insight:** Platform diversity requires different sync strategies. Mobile is particularly challenging without native git.

---

### draw.io (diagrams.net)

[draw.io](https://www.drawio.com/) has mature GitHub integration via OAuth.

**Implementation:**

- Uses OAuth for GitHub authentication
- Diagrams saved directly to repositories
- 1MB file size limit
- Supports `.png`, `.svg`, `.html`, `.xml` formats

**Architecture (Embed Mode):**

- Host application handles storage/auth
- draw.io runs in iframe
- Communication via HTML5 postMessage API
- `edit-diagram.html` handles GitHub I/O

**URL Parameters:**

- `user`, `pass`, `repo`, `path`, `ref`
- `action=open` for direct diagram editing links

**VS Code Extension Approach:**

- No OAuth required!
- Files stored in repo with code
- Access controlled by repository permissions
- Edits `.drawio`, `.drawio.svg`, `.drawio.png` files
- `.drawio.svg` can be embedded in GitHub READMEs

**GitHub.dev Integration:**

- Web-based VS Code in browser
- Install draw.io extension
- Edit diagrams without leaving browser

**Key Insights:**

1. Multiple integration levels: OAuth for web, extension for local
2. SVG format allows GitHub preview AND editing capability
3. Embedding diagram data in image files reduces storage complexity

---

## Relevant Libraries

### Core Libraries

| Library                                                       | Purpose            | Browser Support  | Notes                       |
| ------------------------------------------------------------- | ------------------ | ---------------- | --------------------------- |
| [Octokit](https://github.com/octokit/octokit.js)              | GitHub API client  | Yes              | Official, full TypeScript   |
| [@octokit/rest](https://www.npmjs.com/package/@octokit/rest)  | REST API only      | Yes              | Smaller bundle              |
| [@octokit/graphql](https://github.com/octokit/graphql.js)     | GraphQL API only   | Yes              | For complex queries         |
| [isomorphic-git](https://isomorphic-git.org/)                 | Full git in JS     | Yes (with proxy) | For git history needs       |
| [LightningFS](https://github.com/isomorphic-git/lightning-fs) | Browser filesystem | Yes (IndexedDB)  | Required for isomorphic-git |

### Utility Libraries

| Library                                                                    | Purpose             | Notes                                    |
| -------------------------------------------------------------------------- | ------------------- | ---------------------------------------- |
| [localforage](https://localforage.github.io/localForage/)                  | Storage abstraction | localStorage-like API, IndexedDB backend |
| [@isomorphic-git/cors-proxy](https://github.com/isomorphic-git/cors-proxy) | CORS proxy          | Self-host for git operations             |
| [buffer](https://www.npmjs.com/package/buffer)                             | Buffer polyfill     | Required for Vite + isomorphic-git       |

### OAuth/Auth Libraries

| Library                                                 | Purpose             | Notes                       |
| ------------------------------------------------------- | ------------------- | --------------------------- |
| [oauth2-pkce](https://github.com/Archelyst/oauth2-pkce) | PKCE implementation | TypeScript, browser-focused |

---

## Storage Considerations

### IndexedDB Limits (for isomorphic-git/LightningFS)

| Browser | Limit                                     |
| ------- | ----------------------------------------- |
| Chrome  | 60% of available disk                     |
| Firefox | 10% of disk or 10 GiB (whichever smaller) |
| Safari  | Much smaller, aggressive eviction         |
| Edge    | Similar to Chrome                         |

**Persistent Storage:**

- Use `navigator.storage.persist()` to request persistence
- Firefox prompts user; Chrome/Safari auto-decide based on engagement
- Use `navigator.storage.estimate()` to check current usage

**Risk:** Safari aggressively clears IndexedDB data. Not reliable for sole storage.

---

## Key Findings

### Recommended Approach for Rackula

### Simplest Path: GitHub REST API with PAT

1. User provides Personal Access Token (fine-grained, contents:write only)
2. Store token in localStorage (encrypted if paranoid)
3. Use Octokit REST client directly from browser
4. CORS is fully supported - no proxy needed
5. Simple file read/write via Contents API

**Pros:**

- No backend infrastructure required
- No CORS proxy to maintain
- User controls their own token and permissions
- Works immediately with existing GitHub repos

**Cons:**

- User must generate PAT manually
- Token visible in browser DevTools (if inspected)
- Less polished than OAuth flow

### Alternative: GitHub App with OAuth (When PKCE Fully Lands)

When GitHub removes client secret requirement for public clients:

1. Create GitHub App with minimal permissions
2. Implement PKCE flow in browser
3. No backend needed
4. Better UX (OAuth popup vs PAT copy-paste)

**Status (January 2026):** PKCE was announced in July 2025 (~6 months ago), but the client secret requirement for public clients has not yet been removed. Monitor [GitHub's changelog](https://github.blog/changelog/) for updates on public client support.

### Draw.io-Inspired Approach

For maximum simplicity:

1. Store layout data embedded in export format (PNG metadata or SVG)
2. Users manually save/load files to their repos
3. No integration code needed

This sidesteps all auth complexity but requires manual user action.

### Full Git History (If Needed Later)

If version history, branching, or merge capabilities become important:

1. Use isomorphic-git with LightningFS
2. Deploy CORS proxy (self-hosted or Cloudflare Worker)
3. More infrastructure but full git semantics

### What NOT to Do

1. **Don't use unauthenticated API** - 60 req/hour is too low
2. **Don't embed OAuth client secret in SPA** - Security risk
3. **Don't rely on Safari IndexedDB persistence** - Gets evicted
4. **Don't use classic PAT scopes** - Fine-grained is more secure

---

## Implementation Recommendations

### Phase 1: PAT-Based Sync (MVP)

```typescript
// Simple implementation sketch
import { Octokit } from "@octokit/rest";

const octokit = new Octokit({ auth: userProvidedPAT });

// Read layout
const { data } = await octokit.rest.repos.getContent({
  owner: "user",
  repo: "rackula-layouts",
  path: "layouts/main.json",
});

// Write layout (update)
await octokit.rest.repos.createOrUpdateFileContents({
  owner: "user",
  repo: "rackula-layouts",
  path: "layouts/main.json",
  message: "Update rack layout",
  content: btoa(JSON.stringify(layout)),
  sha: existingFileSha, // Required for updates
});
```

### Phase 2: OAuth (When Ready)

Monitor [GitHub PKCE support](https://github.blog/changelog/2025-07-14-pkce-support-for-oauth-and-github-app-authentication/) for client secret removal announcement.

### Storage Location Options

| Option             | Format    | Pros                       | Cons                     |
| ------------------ | --------- | -------------------------- | ------------------------ |
| User's repo        | JSON file | Familiar, version control  | Requires repo setup      |
| Gist               | JSON      | Simple, shareable URL      | Less organized           |
| Dedicated org repo | JSON      | Central, community layouts | More complex permissions |

---

## Sources

- [isomorphic-git](https://isomorphic-git.org/)
- [isomorphic-git GitHub](https://github.com/isomorphic-git/isomorphic-git)
- [LightningFS GitHub](https://github.com/isomorphic-git/lightning-fs)
- [GitHub CORS Documentation](https://docs.github.com/en/rest/using-the-rest-api/using-cors-and-jsonp-to-make-cross-origin-requests)
- [GitHub REST API Rate Limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)
- [GitHub PKCE Support Changelog](https://github.blog/changelog/2025-07-14-pkce-support-for-oauth-and-github-app-authentication/)
- [GitHub PAT Documentation](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
- [GitHub Apps vs OAuth Apps](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/differences-between-github-apps-and-oauth-apps)
- [Octokit.js](https://github.com/octokit/octokit.js)
- [Excalidraw GitHub Discussion](https://github.com/excalidraw/excalidraw/discussions/2716)
- [Obsidian Git Plugin](https://github.com/Vinzent03/obsidian-git)
- [Logseq-Git-Sync-101](https://github.com/charliie-dev/Logseq-Git-Sync-101)
- [draw.io GitHub Integration](https://github.com/jgraph/drawio-github)
- [draw.io OAuth Blog](https://www.drawio.com/blog/github-support)
- [IndexedDB Storage Quotas (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
- [Auth0 PKCE Documentation](https://auth0.com/docs/get-started/authentication-and-authorization-flow/authorization-code-flow-with-pkce)
- [GitHub SPA Roadmap Issue](https://github.com/github/roadmap/issues/1153)
