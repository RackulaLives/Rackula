# Spike #622: Git/GitHub Integration for Layout Sync

**Date:** 2026-01-14
**Parent Epic:** #570 (Developer-Friendly Data Format)

---

## Executive Summary

This spike evaluated the feasibility of integrating GitHub directly into Rackula, allowing users to push/pull layouts from repositories without leaving the app.

**Key Finding:** GitHub REST API natively supports CORS, eliminating the primary blocker. Direct browser-to-GitHub integration is feasible without backend infrastructure.

**Recommendation:** Start with **PAT-based direct API integration** (Option A). This provides:

- Zero infrastructure (matches Rackula's static site model)
- 1-2 days implementation
- Acceptable friction for technical homelab users
- Clear upgrade path to OAuth when GitHub fully supports PKCE for SPAs

**Future Vision:** Full git integration with isomorphic-git would enable branching, offline support, and commit history UI, but requires 2-3 weeks and CORS proxy infrastructure.

---

## Research Summary

### Technical Approaches

| Approach        | CORS        | Infrastructure | Best For           |
| --------------- | ----------- | -------------- | ------------------ |
| GitHub REST API | Native      | None           | Simple file sync ✓ |
| isomorphic-git  | Needs proxy | CORS proxy     | Full git semantics |
| GitHub Gist API | Native      | None           | Quick sharing      |

### Authentication Options

| Method                      | SPA Ready     | Notes                                       |
| --------------------------- | ------------- | ------------------------------------------- |
| PAT (Personal Access Token) | Yes           | Simplest, user controls permissions         |
| OAuth App                   | Needs backend | Legacy, broad permissions                   |
| GitHub App + PKCE           | Almost        | Best security, waiting for full SPA support |

### Industry Comparison

| Tool       | Approach                  | Takeaway                   |
| ---------- | ------------------------- | -------------------------- |
| Excalidraw | Embed in PNG metadata     | Sidesteps sync entirely    |
| Obsidian   | Native git (Electron)     | Has filesystem access      |
| draw.io    | OAuth + VS Code extension | Context-specific solutions |
| Logseq     | External git sync         | Avoids built-in complexity |

---

## Implementation Options

### Option A: PAT-Based Direct API (Recommended MVP)

User provides a Personal Access Token. Rackula uses Octokit to read/write layouts directly.

**Pros:**

- Zero infrastructure
- User controls their own token and repository
- Simple (~200-300 LOC)
- Works today

**Cons:**

- User must create PAT manually (friction)
- Token in localStorage (visible in DevTools)

**Timeline:** 1-2 days

### Option B: Gist-Based Sharing

Use Gists instead of repos. Each layout = one gist.

**Pros:** Simpler model, built-in versioning, shareable URLs
**Cons:** No folder organization, same PAT friction

**Timeline:** 1 day

### Option C: OAuth with Serverless Backend

OAuth flow with Cloudflare Worker for token exchange.

**Pros:** Polished UX (OAuth popup)
**Cons:** Requires Worker (~$5/month), more moving parts

**Timeline:** 3-5 days

### Option D: Full Git (isomorphic-git)

Full git semantics in browser: clone, branch, commit, push.

**Pros:** Offline-capable, full history, conflict resolution
**Cons:** Complex (~1000 LOC), CORS proxy required, large bundle

**Timeline:** 1-2 weeks

---

## Trade-offs Matrix

| Criterion      | A: PAT   | B: Gist | C: OAuth | D: Full Git |
| -------------- | -------- | ------- | -------- | ----------- |
| Infrastructure | None     | None    | Worker   | CORS Proxy  |
| UX Friction    | High     | High    | Low      | Low         |
| Implementation | 1-2 days | 1 day   | 3-5 days | 1-2 weeks   |
| Bundle Size    | ~30KB    | ~30KB   | ~30KB    | ~200KB      |
| Offline        | No       | No      | No       | Yes         |

---

## Recommendation

### MVP: Option A (PAT-Based Direct API)

**Rationale:**

1. **Zero infrastructure** matches Rackula's static site model
2. **PAT friction acceptable** for technical homelab users
3. **Direct path to value** in 1-2 days
4. **Easy upgrade path** to OAuth when GitHub supports PKCE fully
5. **User controls security** via fine-grained PAT permissions

### Implementation Plan

1. Create `src/lib/utils/github.ts` - Octokit wrapper
2. Create `GitHubSettingsDialog.svelte` - PAT/repo config
3. Add menu options: "Save to GitHub" / "Load from GitHub"
4. Store config in localStorage
5. Follow `netbox-import.ts` pattern

### Success Metrics

- Save to repo in < 10 clicks
- Load from public repo without auth
- Clear error messages for auth failures

---

## Full Integration Vision (Future)

If demand warrants, Option D provides:

- Clone repos, switch branches
- Create commits with proper metadata
- View commit history in UI
- Conflict resolution
- Offline support

**Requirements:**

- CORS proxy (Cloudflare Worker)
- isomorphic-git + LightningFS
- Bundle splitting for lazy loading

**Timeline:** 2-3 weeks

---

## Deliverables

### Research Files

- `docs/research/622-codebase.md` - Current architecture analysis
- `docs/research/622-external.md` - Library and API research
- `docs/research/622-patterns.md` - Implementation patterns

### Implementation Issues (to be created)

1. **feat: GitHub sync MVP with PAT authentication** - Core integration
2. **feat: Load public layouts without authentication** - Read-only access
3. **docs: GitHub sync setup guide** - User documentation

---

## Related

- Spike #572 — YAML format makes git integration more valuable
- Issue #617-620 — YAML format implementation
- Discussion #569 — Power user workflows
