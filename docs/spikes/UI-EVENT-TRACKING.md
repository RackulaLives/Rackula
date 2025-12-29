# UI Event Tracking with Umami

**Issue:** #218
**Status:** Research Complete
**Time Box:** 4 hours
**Date:** 2025-12-29

## Research Question

How can we expand Umami analytics to track all user interactions (button clicks, feature usage, UI events) to understand feature adoption, identify unused features, and inform roadmap priorities?

---

## 1. Audit of Trackable UI Interactions

### Current Coverage

The existing `src/lib/utils/analytics.ts` tracks:

| Category           | Events                            | Status  |
| ------------------ | --------------------------------- | ------- |
| File operations    | save, load, share                 | Tracked |
| Export operations  | image (png/svg/jpeg), PDF, CSV    | Tracked |
| Device operations  | place, create_custom              | Tracked |
| Feature usage      | display_mode, rack_resize         | Tracked |
| Keyboard shortcuts | All shortcuts via KeyboardHandler | Tracked |
| Session            | heartbeat (5-min intervals)       | Tracked |

### Untracked Interactions (90+ Events)

#### Toolbar Buttons (13 events)

| Element              | Current Tracking     |
| -------------------- | -------------------- |
| New Rack             | Not tracked          |
| Load Layout          | Tracked (file:load)  |
| Save Layout          | Tracked (file:save)  |
| Export Image         | Tracked (export:\*)  |
| Share Layout         | Tracked (file:share) |
| Undo                 | Not tracked          |
| Redo                 | Not tracked          |
| Delete Selected      | Not tracked          |
| Display Mode toggle  | Tracked              |
| Reset View / Fit All | Not tracked          |
| Toggle Theme         | Not tracked          |
| Hamburger menu open  | Not tracked          |
| Help/About open      | Not tracked          |

#### Edit Panel (15+ events)

| Element                   | Description             |
| ------------------------- | ----------------------- |
| Rack name edit            | Inline text edit        |
| Height preset buttons     | 6U, 12U, 21U, 42U, etc. |
| Height numeric input      | Manual height entry     |
| U numbering toggle        | Top/Bottom U1 position  |
| Rack notes edit           | Textarea                |
| Delete rack               | Destructive action      |
| Device name edit          | Inline text edit        |
| Position buttons          | Up/Down/Fine ±0.5U      |
| Colour picker open        | Click to expand         |
| Colour preset select      | Quick colour buttons    |
| Custom colour input       | Hex input               |
| Colour reset              | Back to default         |
| Device face dropdown      | Front/Rear/Both         |
| Image upload (front/rear) | Override images         |
| Remove device             | From rack               |
| Delete from library       | Custom devices only     |

#### Device Palette (8 events)

| Element                   | Description          |
| ------------------------- | -------------------- |
| Grouping mode switch      | Brand/Category/A-Z   |
| Search input              | Filter devices       |
| Accordion expand/collapse | Section toggles      |
| Import library            | JSON file upload     |
| Add Device button         | Open form            |
| Device item click         | Select for placement |
| Device drag start         | Begin drag-to-place  |
| Device drag end           | Complete or cancel   |

#### Canvas Interactions (6 events)

| Element         | Description      |
| --------------- | ---------------- |
| Clear selection | Click background |
| Zoom in/out     | Scroll wheel     |
| Pan             | Drag canvas      |
| Rack click      | Select rack      |
| Device click    | Select device    |
| Device drop     | Place in slot    |

#### Modal/Dialog Usage (4 dialogs)

| Dialog        | Interactions                              |
| ------------- | ----------------------------------------- |
| ExportDialog  | Format selection, options, confirm/cancel |
| ShareDialog   | Copy URL, download QR, close              |
| HelpPanel     | Debug info toggle, copy debug, links      |
| ConfirmDialog | Confirm/Cancel destructive actions        |

#### Mobile-Specific (5 events)

| Element            | Description           |
| ------------------ | --------------------- |
| FAB click          | Open device library   |
| Bottom sheet open  | Mobile device palette |
| Bottom sheet close | Dismiss               |
| Tap-to-place       | Mobile placement mode |
| Drawer open/close  | Mobile menu           |

---

## 2. Svelte 5 Patterns for Event Tracking

### Pattern A: Direct Handler Calls (Current Approach)

```svelte
<button
  onclick={() => {
    doAction();
    analytics.trackButtonClick("new-rack");
  }}>New Rack</button
>
```

**Pros:** Explicit, type-safe, easy to understand
**Cons:** Scattered across components, easy to forget

### Pattern B: Svelte Actions (`use:`)

```typescript
// src/lib/actions/trackClick.ts
export function trackClick(node: HTMLElement, eventName: string) {
  function handler() {
    analytics.trackEvent("ui:click", { element: eventName });
  }

  node.addEventListener("click", handler);

  return {
    destroy() {
      node.removeEventListener("click", handler);
    },
  };
}
```

```svelte
<button use:trackClick={"new-rack"} onclick={doAction}>New Rack</button>
```

**Pros:** Declarative, separates concerns, reusable
**Cons:** Additional directive on every element, extra bundle size

### Pattern C: `$effect` for State-Based Tracking

```svelte
<script>
  let dialogOpen = $state(false);

  $effect(() => {
    if (dialogOpen) {
      analytics.trackEvent("dialog:open", { name: "export" });
    }
  });
</script>
```

**Pros:** Tracks state changes automatically, good for toggles/modes
**Cons:** Only works for reactive state, not direct clicks

### Pattern D: Wrapper Component

```svelte
<!-- TrackedButton.svelte -->
<script lang="ts">
  interface Props {
    trackingId: string;
    onclick?: () => void;
    children: Snippet;
  }
  let { trackingId, onclick, children }: Props = $props();
</script>

<button
  onclick={() => {
    analytics.trackEvent("ui:click", { element: trackingId });
    onclick?.();
  }}
>
  {@render children()}
</button>
```

**Pros:** Enforces tracking, consistent behavior
**Cons:** Requires replacing all buttons, less flexible

### Recommendation: Hybrid Approach

1. **Actions for new buttons** - Apply `use:track` for simple click tracking
2. **Direct calls for complex events** - When you need rich properties (format, view, count)
3. **$effect for toggles/state** - Theme changes, display modes, panel open/close
4. **Keep typed events** - Maintain `AnalyticsEvents` interface for type safety

---

## 3. Event Naming Conventions

### Current Pattern

```
<domain>:<action>
```

Examples: `file:save`, `export:image`, `device:place`, `feature:display_mode`

### Proposed Extended Pattern

```
<domain>:<object>:<action>
```

### Domain Categories

| Domain   | Description        | Example Events                              |
| -------- | ------------------ | ------------------------------------------- |
| `ui`     | UI interactions    | `ui:toolbar:click`, `ui:panel:open`         |
| `file`   | File operations    | `file:save`, `file:load` (existing)         |
| `export` | Export operations  | `export:image`, `export:pdf` (existing)     |
| `device` | Device operations  | `device:place`, `device:create` (existing)  |
| `rack`   | Rack operations    | `rack:create`, `rack:delete`, `rack:resize` |
| `edit`   | Edit panel actions | `edit:device:move`, `edit:device:color`     |
| `nav`    | Navigation         | `nav:help:open`, `nav:drawer:toggle`        |
| `mobile` | Mobile-specific    | `mobile:fab:click`, `mobile:sheet:open`     |

### Event Properties

Keep properties minimal and privacy-safe:

```typescript
// Good - categorical data
{ format: "png", view: "front" }
{ category: "network", grouping: "brand" }

// Avoid - potentially identifying
{ deviceName: "My Custom Router" }  // User-generated content
{ rackNotes: "..." }                // Free text
```

---

## 4. Privacy Considerations

### Data Minimization Principles

1. **No PII** - Never track user-generated text (device names, notes)
2. **Categorical only** - Track selections, not free-form input
3. **Aggregatable** - Data should support aggregate queries, not user tracking
4. **Session-scoped** - No cross-session user identification
5. **Local dev disabled** - Already implemented (localhost check)

### Safe to Track

| Data            | Example             | Reason                |
| --------------- | ------------------- | --------------------- |
| Feature used    | "export:pdf"        | Categorical           |
| Option selected | format: "png"       | Enum value            |
| Count           | device_count: 5     | Numeric, aggregatable |
| Category        | category: "network" | From predefined list  |
| UI state        | mode: "dark"        | System preference     |

### Never Track

| Data           | Example          | Reason              |
| -------------- | ---------------- | ------------------- |
| Device names   | "My Router"      | User-generated      |
| Notes content  | "Primary switch" | Free text           |
| Custom colors  | "#abc123"        | Could fingerprint   |
| File names     | "datacenter.zip" | User content        |
| Error messages | Stack traces     | Could contain paths |

### Existing Privacy Features

- `isEnabled` flag checks `__UMAMI_ENABLED__` build constant
- Localhost/127.0.0.1 detection skips tracking
- No cookies (Umami is cookieless by default)
- Session properties use only system info (screen size, color scheme)

---

## 5. Implementation Pattern Recommendation

### Recommended: Centralized with Typed Events

Keep the current pattern but expand it systematically:

```typescript
// src/lib/utils/analytics.ts

export interface AnalyticsEvents {
  // Existing events...

  // NEW: UI interactions
  "ui:toolbar:click": { button: ToolbarButton };
  "ui:panel:open": { panel: "edit" | "help" | "export" | "share" };
  "ui:panel:close": { panel: "edit" | "help" | "export" | "share" };
  "ui:drawer:toggle": { open: boolean };

  // NEW: Rack operations
  "rack:create": Record<string, never>;
  "rack:delete": Record<string, never>;
  "rack:resize": { height: number; method: "preset" | "input" };
  "rack:settings": { setting: "u_numbering" | "name" | "notes" };

  // NEW: Device editing
  "edit:device:move": { direction: "up" | "down"; fine: boolean };
  "edit:device:color": { method: "preset" | "custom" | "reset" };
  "edit:device:image": { face: "front" | "rear"; action: "upload" | "remove" };

  // NEW: Device palette
  "palette:group": { mode: "brand" | "category" | "alpha" };
  "palette:search": { hasQuery: boolean };
  "palette:import": Record<string, never>;

  // NEW: Mobile
  "mobile:fab:click": Record<string, never>;
  "mobile:sheet:toggle": { open: boolean };
}

type ToolbarButton =
  | "new-rack"
  | "undo"
  | "redo"
  | "delete"
  | "fit-all"
  | "theme"
  | "help"
  | "hamburger";
```

### Implementation Strategy

1. **Phase 1: High-value events** (see priority list below)
2. **Phase 2: Panel interactions** (edit panel, dialogs)
3. **Phase 3: Fine-grained tracking** (every button, gesture)

### File Organization

```
src/lib/utils/
├── analytics.ts          # Core tracking + events interface
├── analytics.events.ts   # Event type definitions (if large)
└── analytics.helpers.ts  # Convenience wrappers
```

---

## 6. High-Value Events to Prioritize

### Tier 1: Feature Adoption (Implement First)

These reveal which core features users discover and use:

| Event                  | Why It Matters                   |
| ---------------------- | -------------------------------- |
| `rack:create`          | Entry point, measures activation |
| `ui:panel:open` (help) | Are users finding help?          |
| `palette:import`       | Library adoption                 |
| `mobile:fab:click`     | Mobile feature discovery         |
| `export:*` (existing)  | Core value delivery              |

### Tier 2: Engagement Depth

These show how deeply users engage:

| Event                          | Why It Matters              |
| ------------------------------ | --------------------------- |
| `palette:group`                | Do users customize view?    |
| `rack:resize`                  | Are presets or manual used? |
| `edit:device:color`            | Customization adoption      |
| `ui:toolbar:click` (undo/redo) | Are users making mistakes?  |

### Tier 3: Dead Feature Detection

Track to identify unused features:

| Event                   | If Low, Consider        |
| ----------------------- | ----------------------- |
| `rack:settings` (notes) | Remove rack notes?      |
| `edit:device:image`     | Image override unused?  |
| `palette:search`        | Is search discoverable? |

### Tier 4: Mobile vs Desktop Comparison

| Mobile Event          | Desktop Equivalent     |
| --------------------- | ---------------------- |
| `mobile:fab:click`    | Sidebar always visible |
| `mobile:sheet:toggle` | No equivalent          |
| `ui:drawer:toggle`    | Full toolbar           |

---

## 7. Implementation Checklist

If proceeding to implementation:

- [ ] Extend `AnalyticsEvents` interface with Tier 1 events
- [ ] Add `trackUIClick()` helper for toolbar buttons
- [ ] Add `trackPanelOpen()` / `trackPanelClose()` helpers
- [ ] Instrument Toolbar.svelte with tracking calls
- [ ] Instrument HelpPanel, ExportDialog, ShareDialog
- [ ] Add mobile-specific tracking (FAB, sheet)
- [ ] Create Umami dashboard for new events
- [ ] Document event taxonomy in CLAUDE.md

---

## Summary

| Deliverable                  | Status                           |
| ---------------------------- | -------------------------------- |
| UI interaction audit         | Complete (90+ events identified) |
| Svelte 5 patterns evaluation | Complete (hybrid recommended)    |
| Naming conventions           | Defined (`domain:object:action`) |
| Privacy considerations       | Documented (categorical only)    |
| Implementation pattern       | Centralized typed events         |
| Priority list                | 4 tiers defined                  |

**Recommendation:** Proceed with Tier 1 events first to validate the approach, then expand based on insights gained.
