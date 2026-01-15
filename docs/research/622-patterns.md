# Git/GitHub Integration Patterns for Rackula

**Issue:** #622
**Date:** 2026-01-14
**Purpose:** Synthesize research into actionable implementation patterns

---

## Key Insights

### 1. GitHub REST API is the Sweet Spot

Unlike most browser-to-GitHub integrations, the GitHub REST API **natively supports CORS**. This eliminates the primary blocker that typically forces applications to use backend proxies. Rackula can call GitHub APIs directly from the browser without infrastructure.

### 2. Authentication is the Main Complexity

The challenge is not technical capability but authentication UX:

- **PAT (Personal Access Token):** User copies token from GitHub settings (friction, but no infrastructure)
- **OAuth:** Smooth popup flow but traditionally requires backend for token exchange
- **PKCE (new in July 2025):** Promises backend-less OAuth but client secret requirement not yet removed

### 3. Rackula's Architecture is Ready

The codebase already has:

- **YAML format:** Git-friendly, human-readable diffs
- **Clean load/save API:** Single `loadLayout()` entry point for all data sources
- **External API pattern:** NetBox import shows fetch-validate-transform-load flow
- **Dialog architecture:** `ImportFromNetBoxDialog.svelte` as template for GitHub dialog

### 4. Similar Apps Chose Pragmatic Solutions

| App        | Approach                                | Reason                                      |
| ---------- | --------------------------------------- | ------------------------------------------- |
| draw.io    | OAuth (web) + VS Code extension (local) | Different contexts need different solutions |
| Excalidraw | Embed data in PNG metadata              | Sidesteps sync entirely                     |
| Obsidian   | Native git (Electron)                   | Has filesystem access                       |
| Logseq     | External git sync                       | Avoids built-in complexity                  |

### 5. File Operations are Simple; Git History is Complex

If you only need read/write, the Contents API is straightforward. If you need branching, merging, or commit history, you need isomorphic-git with a CORS proxy.

---

## Implementation Approaches

### Option A: PAT-Based Direct API (Simplest)

**Description:**
User provides a Personal Access Token (fine-grained). Rackula stores it in localStorage and uses Octokit to read/write layouts directly to a user-specified repository.

**Implementation:**

```typescript
// Minimal implementation
import { Octokit } from "@octokit/rest";
import YAML from "yaml";

// Browser-safe base64 encoding (handles Unicode)
function toBase64(str: string): string {
  return btoa(unescape(encodeURIComponent(str)));
}

async function saveToGitHub(layout: Layout, config: GitHubConfig) {
  const octokit = new Octokit({ auth: config.pat });
  // Use YAML format for git-friendly, human-readable diffs
  const content = toBase64(YAML.stringify(layout));

  // Get current file SHA if exists (required for update)
  let sha: string | undefined;
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner: config.owner,
      repo: config.repo,
      path: config.path,
    });
    sha = (data as { sha: string }).sha;
  } catch {
    /* File doesn't exist yet */
  }

  await octokit.rest.repos.createOrUpdateFileContents({
    owner: config.owner,
    repo: config.repo,
    path: config.path,
    message: `Update layout: ${new Date().toISOString()}`,
    content,
    sha,
  });
}
```

**UI Flow:**

1. User opens "Save to GitHub" dialog
2. First time: Paste PAT, enter repo details (owner/repo/path)
3. Settings stored in localStorage
4. Subsequent saves are one-click

**Pros:**

- Zero infrastructure (no backend, no proxy, no hosting)
- User controls their own token and repository
- Works today with existing GitHub features
- Simple to implement (~200-300 LOC)
- User can revoke token anytime

**Cons:**

- User must manually create PAT on GitHub (friction)
- Token stored in localStorage (visible in DevTools)
- No polished OAuth popup experience
- User must understand repo/path concepts

**Infrastructure:** None

**Complexity:** Low (1-2 days)

**Maintenance:** Minimal (Octokit handles API versioning)

---

### Option B: Gist-Based Sharing (Alternative Simple)

**Description:**
Use GitHub Gists instead of repositories. Simpler model: each layout = one gist.

**Implementation:**

```typescript
import YAML from "yaml";

async function saveToGist(layout: Layout, gistId?: string) {
  const octokit = new Octokit({ auth: pat });

  if (gistId) {
    // Update existing gist
    await octokit.rest.gists.update({
      gist_id: gistId,
      files: { "layout.yaml": { content: YAML.stringify(layout) } },
    });
  } else {
    // Create new gist
    const { data } = await octokit.rest.gists.create({
      files: { "layout.yaml": { content: YAML.stringify(layout) } },
      description: `Rackula layout: ${layout.name}`,
      public: false, // Secret gist
    });
    return data.id; // Store for future updates
  }
}
```

**Pros:**

- Even simpler than repo-based (no owner/repo/path config)
- Built-in versioning (gist history)
- Shareable URLs out of the box
- Secret gists provide unlisted sharing

**Cons:**

- No folder organization (flat list of gists)
- Less discoverable than a repo
- Same PAT friction as Option A
- Not suitable for users who want layouts in their infrastructure repo

**Infrastructure:** None

**Complexity:** Low (1 day)

---

### Option C: OAuth with Serverless Backend (Moderate)

**Description:**
Implement OAuth flow with a minimal Cloudflare Worker to handle token exchange. Better UX than PAT.

**Architecture:**

```text
User → Rackula App → GitHub OAuth Login
                          ↓
                    Authorize popup
                          ↓
                    Redirect to Worker
                          ↓
             Worker exchanges code for token
                          ↓
               Token returned to Rackula
```

**Implementation Components:**

1. **Cloudflare Worker** (~50 LOC):

```typescript
// Token exchange endpoint - uses postMessage for secure token transfer
export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");

    const response = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET, // Stored in Worker secrets
          code,
        }),
      },
    );

    const { access_token } = await response.json();

    // Return HTML that uses postMessage to securely send token to opener
    // This avoids exposing the token in URL query strings or server logs
    // Note: JSON.stringify safely escapes the token to prevent XSS
    const html = `<!DOCTYPE html>
<html>
<head><title>Authenticating...</title></head>
<body>
<script>
  if (window.opener) {
    window.opener.postMessage(
      { type: 'github-oauth', access_token: ${JSON.stringify(access_token)} },
      'https://count.racku.la'
    );
    window.close();
  } else {
    document.body.textContent = 'Authentication complete. You can close this window.';
  }
</script>
</body>
</html>`;

    return new Response(html, {
      headers: { "Content-Type": "text/html" },
    });
  },
};
```

1. **GitHub App/OAuth App:**
   - Create at github.com/settings/applications/new
   - Set callback URL to Worker URL
   - Store client secret in Worker environment

1. **Frontend OAuth Flow:**

```typescript
function startOAuth() {
  const state = crypto.randomUUID();
  sessionStorage.setItem("oauth_state", state);

  window.location.href =
    `https://github.com/login/oauth/authorize?` +
    `client_id=${CLIENT_ID}&scope=repo&state=${state}`;
}
```

**Pros:**

- Polished user experience (OAuth popup familiar to users)
- User never handles tokens directly
- Token refresh possible with GitHub App
- Can request minimal scopes

**Cons:**

- Requires Cloudflare Worker (~$5/month for hobby tier, free tier likely sufficient)
- More moving parts (OAuth app registration, secret management)
- Token still stored in browser after exchange
- Cloudflare dependency for production

**Infrastructure:** Cloudflare Worker (or similar serverless)

**Complexity:** Medium (3-5 days)

**Maintenance:** Low (Worker is simple, rare updates)

---

### Option D: Full Git Integration with isomorphic-git (Comprehensive)

**Description:**
Implement full git semantics in the browser using isomorphic-git. Clone repos, create branches, make commits, push changes.

**Architecture:**

```text
Browser
├── LightningFS (IndexedDB-backed virtual filesystem)
├── isomorphic-git (git operations)
└── CORS Proxy (Cloudflare Worker)
    └── GitHub API
```

**Implementation:**

```typescript
import git from "isomorphic-git";
import http from "isomorphic-git/http/web";
import LightningFS from "@isomorphic-git/lightning-fs";

const fs = new LightningFS("rackula");

async function cloneAndUpdate(repoUrl: string, layout: Layout) {
  const dir = "/layouts";

  // Clone or fetch
  await git.clone({
    fs,
    http,
    dir,
    url: repoUrl,
    corsProxy: "https://cors-proxy.rackula.workers.dev",
    depth: 1,
  });

  // Write file
  await fs.promises.writeFile(`${dir}/layout.yaml`, yamlSerialize(layout));

  // Stage and commit
  await git.add({ fs, dir, filepath: "layout.yaml" });

  // Get author info from environment, git config, or use default
  const authorName =
    process.env.GIT_AUTHOR_NAME ||
    (await git.getConfig({ fs, dir, path: "user.name" })) ||
    "Rackula";
  const authorEmail =
    process.env.GIT_AUTHOR_EMAIL ||
    (await git.getConfig({ fs, dir, path: "user.email" })) ||
    "noreply@racku.la";

  await git.commit({
    fs,
    dir,
    message: `Update layout: ${new Date().toISOString()}`,
    author: { name: authorName, email: authorEmail },
  });

  // Push
  await git.push({
    fs,
    http,
    dir,
    corsProxy: "https://cors-proxy.rackula.workers.dev",
    onAuth: () => ({ username: "x-access-token", password: pat }),
  });
}
```

**Pros:**

- Full git semantics (branches, merges, history)
- Offline-capable (work on clone, push when online)
- Proper commit history with author info
- Could support conflict resolution UI
- Most flexible for power users

**Cons:**

- Significant complexity (~1000+ LOC)
- CORS proxy required for all git operations
- Large bundle size (isomorphic-git + LightningFS ~200KB gzipped)
- IndexedDB storage limits (especially Safari)
- Performance concerns for large repos
- Safari aggressively clears IndexedDB

**Infrastructure:** CORS Proxy (Cloudflare Worker)

**Complexity:** High (1-2 weeks)

**Maintenance:** Medium (proxy updates, library updates, Safari edge cases)

---

## Trade-offs Matrix

| Criterion               | A: PAT Direct   | B: Gist         | C: OAuth+Worker   | D: Full Git       |
| ----------------------- | --------------- | --------------- | ----------------- | ----------------- |
| **Infrastructure**      | None            | None            | Cloudflare Worker | CORS Proxy        |
| **UX Friction**         | High (PAT copy) | High (PAT copy) | Low (OAuth popup) | Low (OAuth popup) |
| **Implementation Time** | 1-2 days        | 1 day           | 3-5 days          | 1-2 weeks         |
| **Bundle Size**         | ~30KB (Octokit) | ~30KB           | ~30KB             | ~200KB            |
| **Feature Scope**       | Read/Write      | Read/Write      | Read/Write        | Full Git          |
| **Offline Support**     | None            | None            | None              | Yes               |
| **Multi-file Support**  | Manual          | Single gist     | Manual            | Native            |
| **Version History**     | Via GitHub      | Via Gist        | Via GitHub        | Local + Remote    |
| **Maintenance**         | Minimal         | Minimal         | Low               | Medium            |
| **User Owns Data**      | Yes             | Yes             | Yes               | Yes               |
| **Safari Reliability**  | Good            | Good            | Good              | Poor              |

---

## Recommendation

### MVP: Option A (PAT-Based Direct API)

**Rationale:**

1. **Zero infrastructure matches Rackula's model.** The app currently runs as a static site on GitHub Pages. Adding backend dependencies changes the operational model.

2. **PAT friction is acceptable for target users.** Homelabbers are technical users comfortable with GitHub. Creating a PAT is a one-time setup they likely already do for other tools.

3. **Direct path to value.** Users can save/load layouts from GitHub in 1-2 days of development. No deployment complexity.

4. **Easy upgrade path.** When GitHub removes client secret requirement for PKCE (expected soon per July 2025 announcement), upgrading to OAuth is additive, not a rewrite.

5. **User controls security.** Fine-grained PATs let users grant minimal permissions (single repo, read/write only). They can revoke anytime.

**Implementation Plan:**

1. Create `src/lib/utils/github.ts` - Octokit wrapper for read/write
2. Create `GitHubSettingsDialog.svelte` - PAT and repo configuration
3. Add "Save to GitHub" / "Load from GitHub" menu options
4. Store config in localStorage (or sessionStorage for extra caution)
5. Follow existing `netbox-import.ts` pattern for validation

**Success Metrics:**

- User can save layout to their repo in < 10 clicks
- User can load layout from URL (public repo) without auth
- Clear error messages for auth/permission failures

---

## Full Integration Vision

When/if full integration is needed, Option D provides:

### Core Features

- Clone any repo containing layouts
- Switch between branches/tags
- Create commits with proper metadata
- Push changes back to origin
- View commit history for a layout
- Diff between versions

### UX Features

- "GitHub" panel in sidebar (like Source Control in VS Code)
- Status indicator showing sync state
- Conflict resolution UI
- Auto-commit on save (configurable interval)
- "Restore previous version" from history

### Technical Requirements

- CORS proxy (Cloudflare Worker, ~$0-5/month)
- LightningFS for browser persistence
- Service Worker for offline support
- Bundle splitting to lazy-load git dependencies

### When to Build This

- Multiple users collaborating on same layouts
- Need for branching/environment-specific layouts
- Demand for version history UI
- Offline-first becomes a priority

**Timeline estimate:** 2-3 weeks for full implementation

---

## Next Steps (Post-Spike)

1. **Create implementation issue** for MVP (Option A)
2. **Define UI mockups** for settings dialog
3. **Decide storage format** (JSON vs YAML for GitHub)
4. **Consider read-only public mode** (no auth for public repos)
5. **Monitor GitHub PKCE updates** for OAuth upgrade opportunity
