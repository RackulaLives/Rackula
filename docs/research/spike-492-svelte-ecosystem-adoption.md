# Spike #492: Svelte Ecosystem Component Adoption

**Date:** 2026-01-12
**Parent Epic:** None
**Status:** Complete

---

## Executive Summary

This spike evaluated the strategy for adopting Svelte ecosystem components (bits-ui / Huntabyte) to improve UX, accessibility, and maintainability in Rackula.

**Key findings:**
1. bits-ui adoption is already mature - Dialog, Tabs, Accordion patterns are established
2. Four components are candidates for migration with clear priority ordering
3. Mobile sheet/drawer requires UX evaluation before deciding on vaul-svelte adoption
4. LLM documentation integration should use on-demand WebFetch (no local caching)

**Recommendations:**
- Immediate: Migrate ImportFromNetBoxDialog tabs and MobileWarningModal (low effort, high value)
- Short-term: Evaluate vaul-svelte for sheets, migrate Tooltip to bits-ui
- Long-term: Document wrapper patterns, monitor bits-ui releases

---

## Technical Findings

### Current State

| Component Type | Implementation | Status |
|---------------|----------------|--------|
| Dialog/Modal | bits-ui via wrapper | ✅ Working well |
| Tabs | bits-ui (SidebarTabs) | ✅ Migrated in PR #521 |
| Accordion | bits-ui (DevicePalette) | ✅ Working well |
| Sheet/Drawer | Custom BottomSheet | ⚠️ Evaluate vaul-svelte |
| Tooltip | Custom | ⚠️ Migrate to bits-ui |

### Migration Targets

| Priority | Component | Effort | Benefit | Risk |
|----------|-----------|--------|---------|------|
| 1 | ImportFromNetBoxDialog tabs | Low (2h) | Medium | Very Low |
| 2 | MobileWarningModal | Low (3h) | High | Low |
| 3 | Tooltip.svelte | Medium (4h) | Medium | Low |
| 4 | BottomSheet.svelte | High (6h) | Medium | Medium |

### Components to Keep Custom

- **Dialog.svelte wrapper** - Working pattern, provides project-specific styling
- **dialogStore.svelte.ts** - Centralized state management is correct approach
- **BottomSheet.svelte** - Pending vaul-svelte UX comparison (may remain custom)

---

## Recommendations

### Immediate (v0.6.x)

**Issue 1: Migrate ImportFromNetBoxDialog to bits-ui Tabs**
- Replace manual button tabs with bits-ui Tabs component
- Follow SidebarTabs.svelte pattern
- Provides: keyboard navigation, ARIA roles, consistent styling
- Effort: ~2 hours

**Issue 2: Migrate MobileWarningModal to bits-ui Dialog**
- Replace custom modal with Dialog.svelte wrapper
- Use `role="alertdialog"` for semantic correctness
- Remove manual focus trap code (~50 lines)
- Effort: ~3 hours

### Short-term (v0.7.0)

**Issue 3: Evaluate vaul-svelte for Sheet/Drawer**
- Install vaul-svelte in evaluation branch
- Build equivalent BottomSheet component
- Compare swipe-to-dismiss UX on iOS/Android
- Decision: adopt if UX matches, keep custom if not
- Effort: ~6 hours evaluation + potential migration

**Issue 4: Migrate Tooltip to bits-ui**
- Create Tooltip wrapper with Provider pattern
- Migrate Tooltip.svelte and PortTooltip.svelte
- Document: no mobile tooltip by design (matches user expectations)
- Effort: ~4 hours

### Long-term

**Issue 5: Add bits-ui documentation to CLAUDE.md**
- Document bits-ui wrapper patterns
- Add llms.txt fetch instructions for AI-assisted development
- No local caching (maintenance burden outweighs benefits)

**Issue 6: Monitor bits-ui for future components**
- Sheet/Drawer native support
- Select/Combobox for form features
- Accessibility improvements

---

## LLM Documentation Integration

### Recommended Approach: Hybrid (Svelte MCP + On-Demand Fetch)

The project has the Svelte MCP server available, which provides excellent Svelte 5/SvelteKit documentation access. For bits-ui specifically:

**Access Pattern:**
```
# When implementing bits-ui components
WebFetch https://bits-ui.com/docs/components/dialog/llms.txt
WebFetch https://bits-ui.com/docs/components/tabs/llms.txt
WebFetch https://bits-ui.com/docs/components/tooltip/llms.txt
```

**Add to CLAUDE.md:**
```markdown
### bits-ui Components

For bits-ui documentation during development:
- Fetch: `WebFetch https://bits-ui.com/docs/components/{name}/llms.txt`
- Available: dialog, tabs, accordion, tooltip, popover, select, combobox
- Use Svelte MCP `svelte-autofixer` to validate component syntax
```

**Why not local cache:**
- bits-ui releases frequently (v2.15.4, Jan 2026)
- On-demand fetch ensures current documentation
- No repo maintenance burden
- Minimal token cost per fetch

---

## Related Research

- `docs/research/492-codebase.md` - Existing component inventory
- `docs/research/492-external.md` - bits-ui API documentation, vaul-svelte research
- `docs/research/492-patterns.md` - Migration patterns and trade-offs

---

## Implementation Issues

The following issues should be created to track implementation:

1. **feat: Migrate ImportFromNetBoxDialog to bits-ui Tabs** - Priority: High
2. **feat: Migrate MobileWarningModal to bits-ui Dialog** - Priority: High
3. **spike: Evaluate vaul-svelte for BottomSheet** - Priority: Medium
4. **feat: Migrate Tooltip to bits-ui** - Priority: Medium
5. **docs: Add bits-ui documentation to CLAUDE.md** - Priority: Low
