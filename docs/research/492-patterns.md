# Research Spike #492: Pattern Analysis

**Date:** 2026-01-12
**Status:** Complete

## Key Insights

### 1. bits-ui Adoption is Mature and Strategic

The codebase already has successful bits-ui integrations that establish clear patterns:
- **Dialog wrapper pattern** (`Dialog.svelte`) provides consistent styling and API
- **SidebarTabs** (PR #521) demonstrates direct bits-ui Tabs usage with data-attribute styling
- **DevicePalette** uses Accordion with controlled state via `$effect`
- **Centralized state** (`dialogStore.svelte.ts`) manages all dialog open/close states

**Pattern insight:** bits-ui components work best when wrapped in project-specific components that enforce design system consistency.

### 2. Sheet/Drawer Gap Requires Decision

bits-ui does **not** include Sheet/Drawer components. Two options exist:
- **vaul-svelte**: Same author (Huntabyte), built on bits-ui Dialog, Svelte 5 compatible
- **Current BottomSheet.svelte**: Custom implementation with swipe-to-dismiss that works well

**Decision point:** The custom BottomSheet has valuable swipe-to-dismiss UX that vaul-svelte may not replicate identically. Migration should be evaluated against UX requirements, not just consistency.

### 3. Tooltip Migration is Now Viable

The codebase research noted bits-ui v2.14.4 doesn't export Tooltip, but the external research confirms **Tooltip IS available** in current bits-ui versions. This opens migration path for:
- `Tooltip.svelte` (custom)
- `PortTooltip.svelte` (network port info)

**Important limitation:** bits-ui Tooltip explicitly does NOT support mobile. Current custom implementation handles this already.

### 4. MobileWarningModal is Migration-Ready

`MobileWarningModal.svelte` uses custom modal implementation with:
- Manual focus trap (`trapFocus` directive)
- Manual keyboard handling (Escape via `onMount`)
- SessionStorage for dismissal persistence

bits-ui Dialog provides all accessibility features automatically. Migration is straightforward.

### 5. ImportFromNetBoxDialog Tabs Pattern is Clear

Currently uses manual button-based tabs for paste/upload modes. bits-ui Tabs migration would provide:
- Arrow key navigation
- Proper ARIA roles (`tablist`, `tab`, `tabpanel`)
- Focus management
- Data attribute styling consistency

---

## Implementation Approaches

### Migration Order

**Recommended sequence based on effort/benefit ratio:**

| Priority | Component | Effort | Benefit | Dependencies |
|----------|-----------|--------|---------|--------------|
| 1 | ImportFromNetBoxDialog tabs | Low | Medium | None - isolated tabs UI |
| 2 | MobileWarningModal | Low | High | None - self-contained modal |
| 3 | Tooltip.svelte | Medium | Medium | Tooltip.Provider wrapper needed |
| 4 | BottomSheet.svelte | High | Medium | vaul-svelte evaluation required |

**Rationale:**
1. **ImportFromNetBoxDialog**: Small scope, no external dependencies, existing Tabs pattern in codebase (SidebarTabs)
2. **MobileWarningModal**: Eliminates custom a11y code, immediate quality improvement, no ripple effects
3. **Tooltip**: Larger scope (multiple uses), requires Provider pattern, mobile fallback decisions
4. **BottomSheet**: Highest risk - requires new dependency, swipe UX validation, most complex migration

### Dialog Strategy

**Keep current architecture:**

```
┌─────────────────────────────────────┐
│         dialogStore.svelte.ts       │  ← Centralized state (keep)
├─────────────────────────────────────┤
│           Dialog.svelte             │  ← Wrapper component (keep)
│     (bits-ui with project styles)   │
├─────────────────────────────────────┤
│  ConfirmDialog  │  ExportDialog     │  ← Feature dialogs (keep)
│  ShareDialog    │  HelpPanel        │
│  ImportNetBox   │  NewRackDialog    │
└─────────────────────────────────────┘
```

**Migration targets:**
- `MobileWarningModal.svelte` → use `Dialog.svelte` wrapper (uses `role="alertdialog"`, keep semantic)
- Direct bits-ui usage in `ConfirmReplaceDialog` and `HelpPanel` → consider migrating to wrapper for consistency (low priority)

**Non-targets:**
- Dialog.svelte wrapper is working well - no changes needed
- dialogStore centralization is correct pattern

### Sheet/Drawer Strategy

**Recommended: Evaluate vaul-svelte, keep custom if UX differs**

#### Option A: Adopt vaul-svelte (Preferred if UX acceptable)
```bash
npm install vaul-svelte
```

```svelte
<script lang="ts">
  import { Drawer } from "vaul-svelte";
</script>

<Drawer.Root bind:open direction="bottom">
  <Drawer.Portal>
    <Drawer.Overlay class="sheet-overlay" />
    <Drawer.Content class="sheet-content">
      <slot />
    </Drawer.Content>
  </Drawer.Portal>
</Drawer.Root>
```

**Pros:**
- Consistent API with bits-ui Dialog
- Built-in swipe gesture support
- Snap points for multi-position sheets
- Same author ecosystem (huntabyte)

**Cons:**
- New dependency
- May not match exact swipe UX of current implementation
- Requires UX validation

#### Option B: Keep Custom BottomSheet
If vaul-svelte swipe behavior differs from current UX requirements, keep `BottomSheet.svelte` but:
- Extract shared focus management utilities
- Document as intentional custom implementation
- Add tests for swipe behavior

**Decision process:**
1. Install vaul-svelte in branch
2. Create test component with equivalent behavior
3. Compare swipe-to-dismiss UX on iOS/Android
4. Decide based on UX parity, not code consistency

### Tooltip Strategy

**Recommended: Migrate to bits-ui Tooltip with mobile fallback**

#### Implementation Pattern

```svelte
<!-- src/lib/components/Tooltip.svelte (migrated) -->
<script lang="ts">
  import { Tooltip } from "bits-ui";
  import type { Snippet } from "svelte";

  interface Props {
    content: string;
    side?: "top" | "bottom" | "left" | "right";
    children: Snippet;
  }

  let { content, side = "top", children }: Props = $props();
</script>

<Tooltip.Provider>
  <Tooltip.Root>
    <Tooltip.Trigger asChild>
      {@render children()}
    </Tooltip.Trigger>
    <Tooltip.Portal>
      <Tooltip.Content {side} class="tooltip-content">
        {content}
        <Tooltip.Arrow class="tooltip-arrow" />
      </Tooltip.Content>
    </Tooltip.Portal>
  </Tooltip.Root>
</Tooltip.Provider>
```

**Mobile handling:**
bits-ui Tooltip does not show on mobile by design. This matches user expectations (tooltips require hover).

For mobile info display, consider:
- Long-press to show (custom handler)
- Info icons with Popover for explicit tap-to-reveal
- Inline labels instead of tooltips

**Migration steps:**
1. Create bits-ui Tooltip wrapper component
2. Update `Tooltip.svelte` consumers one at a time
3. Test on desktop (hover) and mobile (no tooltip expected)
4. Remove custom tooltip implementation

### Tabs Strategy

**Existing pattern works well - extend to ImportFromNetBoxDialog**

Based on SidebarTabs.svelte (PR #521), the project pattern is:

```svelte
<script lang="ts">
  import { Tabs } from "$lib/components/ui/Tabs";
  let activeMode = $state<"paste" | "upload">("paste");
</script>

<Tabs.Root
  value={activeMode}
  onValueChange={(v) => (activeMode = v as typeof activeMode)}
  orientation="horizontal"
>
  <Tabs.List class="import-tabs-list" aria-label="Import mode">
    <Tabs.Trigger value="paste">Paste YAML</Tabs.Trigger>
    <Tabs.Trigger value="upload">Upload File</Tabs.Trigger>
  </Tabs.List>
  <Tabs.Content value="paste">
    <!-- Paste textarea -->
  </Tabs.Content>
  <Tabs.Content value="upload">
    <!-- File upload UI -->
  </Tabs.Content>
</Tabs.Root>
```

**Benefits over current manual implementation:**
- Arrow key navigation between tabs
- Proper ARIA roles
- Consistent data-attribute styling
- Focus management

---

## Trade-offs

### bits-ui Adoption Trade-offs

| Aspect | Custom Components | bits-ui Migration |
|--------|-------------------|-------------------|
| **Bundle size** | Only what we write | Additional dependency |
| **A11y coverage** | Manual, may have gaps | Comprehensive, tested |
| **Maintenance** | Full responsibility | Upstream updates |
| **Customization** | Total control | Within component API |
| **Consistency** | Project-specific | Cross-project standards |
| **Learning curve** | Familiar code | bits-ui patterns |

### Component-Specific Trade-offs

#### MobileWarningModal Migration
- **Pro:** Eliminates ~50 lines of focus management code
- **Pro:** Proven a11y implementation
- **Con:** Minor API adjustment needed
- **Risk:** Low - straightforward mapping

#### BottomSheet Migration (vaul-svelte)
- **Pro:** Ecosystem consistency
- **Pro:** Built-in snap points for future features
- **Con:** New dependency (~20KB)
- **Con:** Swipe gesture may differ from current UX
- **Risk:** Medium - requires UX validation

#### Tooltip Migration
- **Pro:** Correct ARIA and focus handling
- **Pro:** Built-in positioning and collision detection
- **Con:** Requires Provider wrapper
- **Con:** No mobile support (by design)
- **Risk:** Low - clear behavior boundaries

#### ImportFromNetBoxDialog Tabs
- **Pro:** Minimal code change
- **Pro:** Immediate a11y improvement
- **Con:** None significant
- **Risk:** Very low - pattern already proven

---

## Recommendations

### Immediate Actions (This Sprint)

1. **Create issue for ImportFromNetBoxDialog tabs migration**
   - Low effort, clear pattern (copy SidebarTabs approach)
   - Estimate: 1-2 hours
   - No new dependencies

2. **Create issue for MobileWarningModal migration**
   - Replace custom modal with Dialog.svelte wrapper
   - Add `role="alertdialog"` for semantic correctness
   - Remove custom focus management code
   - Estimate: 2-3 hours

### Short-term (v0.7.0)

3. **Evaluate vaul-svelte for Sheet/Drawer**
   - Create evaluation branch
   - Build equivalent BottomSheet with vaul-svelte
   - Test swipe-to-dismiss on iOS/Android
   - Document UX comparison
   - Decision: adopt if UX acceptable, keep custom if not
   - Estimate: 4-6 hours evaluation

4. **Migrate Tooltip to bits-ui**
   - Create Tooltip wrapper with Provider
   - Migrate Tooltip.svelte consumers
   - Migrate PortTooltip.svelte
   - Document mobile behavior (no tooltip by design)
   - Estimate: 3-4 hours

### Long-term

5. **Standardize on bits-ui wrapper pattern**
   - Document wrapper component guidelines
   - Create additional wrappers as needed (Popover, Select)
   - Consider form components for future features

6. **Monitor bits-ui releases**
   - Sheet/Drawer component addition
   - Svelte 5 improvements
   - Accessibility enhancements

### Components to Keep Custom

- **BottomSheet.svelte** (pending vaul-svelte evaluation) - Complex swipe UX
- **PortTooltip.svelte** (after Tooltip migration) - May need custom rendering for port diagrams

---

## LLM Documentation Integration

### Current State

The project already has:
- Svelte MCP server with `list-sections`, `get-documentation`, `svelte-autofixer`
- Project CLAUDE.md with Svelte 5 runes patterns

### Recommended Additions

#### 1. Add bits-ui Reference to CLAUDE.md

```markdown
### bits-ui Components

The project uses bits-ui for accessible UI primitives. Key components:
- Dialog (wrapper at `src/lib/components/Dialog.svelte`)
- Tabs (via `$lib/components/ui/Tabs`)
- Accordion (via `$lib/components/ui/Accordion`)

**For bits-ui documentation during development:**
- Fetch on-demand: `WebFetch https://bits-ui.com/docs/components/{component}/llms.txt`
- Components: dialog, tabs, accordion, tooltip, popover

**Wrapper pattern:**
- bits-ui provides unstyled primitives
- Project wrappers add design tokens and consistent API
- Use existing wrappers, create new ones for new components
```

#### 2. Document Usage Pattern

When implementing bits-ui components:
1. Use Svelte MCP `svelte-autofixer` to validate component syntax
2. Fetch bits-ui llms.txt for specific component API
3. Follow existing wrapper patterns in codebase
4. Use data-attributes for state-based styling

#### 3. On-Demand Documentation Fetching

For development sessions, fetch documentation as needed:

```
# Dialog implementation
WebFetch https://bits-ui.com/docs/components/dialog/llms.txt

# Tabs implementation
WebFetch https://bits-ui.com/docs/components/tabs/llms.txt

# Tooltip implementation
WebFetch https://bits-ui.com/docs/components/tooltip/llms.txt
```

#### 4. Local Cache (Optional, Not Recommended)

Caching llms.txt locally adds maintenance burden. The on-demand fetch pattern is preferred because:
- bits-ui releases frequently (v2.15.4 as of Jan 2026)
- Documentation stays current
- No repo bloat
- Fetch only what's needed per session

### Integration Summary

| Resource | Access Method | When to Use |
|----------|---------------|-------------|
| Svelte 5 / SvelteKit | Svelte MCP server | Always available |
| bits-ui components | WebFetch llms.txt | When implementing bits-ui |
| Project patterns | Codebase examples | Reference existing wrappers |
| svelte-autofixer | Svelte MCP tool | Validate component syntax |

---

## Summary

This research spike confirms that bits-ui adoption should continue incrementally:

1. **Low-hanging fruit first:** ImportFromNetBoxDialog tabs, MobileWarningModal
2. **Evaluate carefully:** BottomSheet/vaul-svelte (UX-driven decision)
3. **Clear migration path:** Tooltip with mobile handling documented
4. **Keep working patterns:** Dialog wrapper, centralized state, data-attribute styling
5. **Documentation integration:** On-demand llms.txt fetch, no local caching

The existing bits-ui foundation is solid. Extensions should follow established wrapper patterns for consistency.
