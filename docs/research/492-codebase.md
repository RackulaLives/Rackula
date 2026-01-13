# Spike #492: Codebase Exploration - Svelte Ecosystem Component Adoption

## Files Examined

### Dialog/Modal Components

- `src/lib/components/Dialog.svelte` - Base wrapper for bits-ui Dialog
- `src/lib/components/ConfirmDialog.svelte` - Reusable confirmation dialog
- `src/lib/components/ConfirmReplaceDialog.svelte` - Specialized confirmation
- `src/lib/components/HelpPanel.svelte` - About/help panel dialog
- `src/lib/components/ExportDialog.svelte` - Export options dialog
- `src/lib/components/ShareDialog.svelte` - Share/QR code dialog
- `src/lib/components/ImportFromNetBoxDialog.svelte` - NetBox import dialog

### Sheet/Mobile Components

- `src/lib/components/BottomSheet.svelte` - Custom bottom sheet with swipe-to-dismiss
- `src/lib/components/RackEditSheet.svelte` - Mobile rack editing sheet
- `src/lib/components/MobileWarningModal.svelte` - Custom modal with focus trap

### UI Components

- `src/lib/components/Tooltip.svelte` - Custom tooltip
- `src/lib/components/PortTooltip.svelte` - Network port tooltip
- `src/lib/components/SidebarTabs.svelte` - bits-ui Tabs implementation

### bits-ui Wrappers

- `src/lib/components/ui/Tabs/index.ts` - Export wrapper
- `src/lib/components/ui/Accordion/index.ts` - Export wrapper
- `src/lib/components/ui/Dialog/index.ts` - Export wrapper

### State Management

- `src/lib/stores/dialogs.svelte.ts` - Centralized dialog state
- `src/App.svelte` - Main app with PaneForge and dialog orchestration

---

## Existing Dialog/Modal Components

### Already Using bits-ui Dialog

**1. Dialog.svelte (Base wrapper)**

- Uses `bits-ui Dialog.Root`, `Dialog.Portal`, `Dialog.Overlay`, `Dialog.Content`, `Dialog.Title`, `Dialog.Close`
- State: `open` prop with `$bindable()` for two-way binding
- Customizable width, title, close button visibility
- Global styling via `src/lib/styles/dialogs.css`
- Pattern: Open/close callback with `onOpenChange` handler

**2. ConfirmDialog.svelte (Wraps Dialog.svelte)**

- Reusable confirmation with message, confirm/cancel buttons
- State: `open` prop, `onconfirm`/`oncancel` callbacks
- Destructive button styling option
- Keyboard: Enter key for confirm, manually added listener via `onMount`

**3. ConfirmReplaceDialog.svelte (Direct bits-ui Dialog)**

- Direct bits-ui primitives without wrapper (no Dialog.svelte)
- Derived state: rack name, device count from layout store
- Three-button layout: Cancel, Save First, Replace
- Pattern: `open` bindable, `onOpenChange` handler

**4. HelpPanel.svelte (Direct bits-ui Dialog)**

- Direct bits-ui primitives
- Complex multi-section content (shortcuts, links, build info)
- State management: analytics tracking on open/close, relative time updates
- Focus management: Dialog.Close button for keyboard dismissal
- Pattern: `open` bindable, `onOpenChange` handler with analytics

### Custom/Non-bits-ui Dialogs

**5. MobileWarningModal.svelte (Custom modal)**

- Custom implementation with manual focus trap and event listeners
- Uses `trapFocus` directive and `createFocusManager` utility
- SessionStorage for dismissal persistence
- Keyboard: Escape to close via `onMount` listener
- No accessibility from bits-ui - manual ARIA and focus management

### Custom Sheets (Not bits-ui)

**6. BottomSheet.svelte (Custom sheet)**

- Manual implementation with pointer events for swipe-to-dismiss
- Drag gesture detection: pointer up/down/move/cancel
- Transform animations with cubic-bezier easing
- State: `open` bindable, `onclose` callback
- Mobile-optimized with reduced-motion support
- Focus management: Manual body overflow prevention

**7. RackEditSheet.svelte (Uses BottomSheet.svelte)**

- Content component passed to BottomSheet
- Rack editing form with validation
- Confirmation dialog inside (uses ConfirmDialog)

### Other Dialogs (Using Dialog.svelte wrapper)

**8. ExportDialog.svelte**

- Export configuration with live preview
- State: format, view, background, transparent, includeLegend, includeQR options
- Keyboard: Escape to close

**9. ShareDialog.svelte**

- Share URL and QR code generation
- State: async QR generation, copy to clipboard

**10. ImportFromNetBoxDialog.svelte**

- Two-mode interface: paste/upload YAML
- State: input mode, parsing state, preview overrides
- Manual button-based tabs (not bits-ui Tabs)

---

## Existing bits-ui Usage

### Accordion

**Location:** `src/lib/components/DevicePalette.svelte`

**Pattern:**

```svelte
import { Accordion } from "bits-ui";

let accordionValue = $state<string>("generic");
let accordionMode = $state("single");

$effect(() => {
  const defaultValue = getDefaultAccordionValue(groupingMode);
  accordionValue = defaultValue;
});
```

**Features:**

- Type: "single" (exclusive - only one section open at a time)
- Multiple grouping modes: brand, category, flat
- Default values sync with grouping mode changes
- Device sections with icons, match counts
- Empty state handling for search results

**Accessibility:**

- bits-ui provides: `aria-expanded`, focus management, keyboard navigation
- Tests verify: Tab navigation, Enter/Space toggle, `aria-expanded` updates

### Tabs

**Location:** `src/lib/components/SidebarTabs.svelte` (NEW - PR #521)

**Pattern:**

```svelte
import {Tabs} from "$lib/components/ui/Tabs";

<Tabs.Root
  value={activeTab}
  onValueChange={handleValueChange}
  orientation="horizontal"
  loop={true}
  class="sidebar-tabs"
>
  <Tabs.List class="tabs-list" aria-label="Sidebar navigation">
    {#each tabs as tab (tab.id)}
      <Tabs.Trigger value={tab.id} class="tab-btn">
        <span class="tab-icon" aria-hidden="true">{tab.icon}</span>
        <span class="tab-label">{tab.label}</span>
      </Tabs.Trigger>
    {/each}
  </Tabs.List>
</Tabs.Root>
```

**Features:**

- Horizontal orientation with loop enabled (arrow wrapping)
- Icon + label triggers
- CSS handles visibility with `[data-state="active"]` selector
- Global styles via `:global()` for composition

---

## PaneForge Integration

**Location:** `src/App.svelte`

**Usage:**

```svelte
import {(PaneGroup, Pane, PaneResizer)} from "paneforge";

<PaneGroup>
  <Pane defaultSize={20} minSize={15} maxSize={40}>
    <!-- Sidebar content -->
  </Pane>
  <PaneResizer />
  <Pane>
    <!-- Canvas content -->
  </Pane>
  <PaneResizer />
  <Pane minSize={200}>
    <!-- Edit panel -->
  </Pane>
</PaneGroup>
```

**Completed Migrations:**

- PaneForge for resizable sidebar (#495, #497)
- SidebarTabs migrated to bits-ui Tabs (#503, #521)

---

## State Management Patterns

### Dialog State (Centralized)

- `dialogStore`: Centralized store managing all dialog states
- Pattern: `dialogStore.isOpen("dialogName")` returns boolean
- Managed dialogs: newRack, addDevice, confirmDelete, export, share, help, importNetBox, confirmReplace
- Sheet dialogs: deviceDetails, deviceLibrary, rackEdit

### Component-level State

- Most components use `$state()` for local form fields
- `$bindable()` for two-way binding on `open` prop
- `$effect()` for reactive state synchronization

---

## Accessibility Patterns

### bits-ui Components (Built-in)

- Dialog: Focus trap, `aria-modal`, `aria-labelledby`, keyboard ESC
- Accordion: `aria-expanded`, keyboard navigation (Tab, Enter, Space)
- Tabs: Arrow keys, `aria-label` on list, `data-state` for styling

### Custom Implementations

- Tooltip: `role="tooltip"`, no ARIA live region
- BottomSheet: `role="dialog"`, `aria-modal="true"`, manual focus management
- MobileWarningModal: `role="alertdialog"`, `aria-describedby`, focus trap

### Focus Management

- bits-ui Dialog: Automatic
- Custom components: Manual via `createFocusManager()` or `trapFocus` directive

### Reduced Motion

- BottomSheet: `@media (prefers-reduced-motion: reduce)` removes transitions
- Tooltip: `@media (prefers-reduced-motion: reduce)` removes animation
- bits-ui components: Inherited from library

---

## Components Needing Migration

### High Priority (Issue #492)

1. **MobileWarningModal.svelte** → bits-ui Dialog
   - Currently: Custom modal with manual focus management
   - Migration: Replace with bits-ui Dialog for consistency
   - Benefit: Automatic focus trap, keyboard handling, aria

2. **ImportFromNetBoxDialog.svelte** → bits-ui Tabs
   - Currently: Manual tab buttons (paste/upload toggle)
   - Migration: Replace with bits-ui Tabs for keyboard navigation, ARIA

### Medium Priority

3. **BottomSheet.svelte** → bits-ui Sheet (if available)
   - Currently: Custom sheet with swipe gestures
   - Issue: bits-ui may not have Sheet component
   - Decision: Keep custom for swipe-to-dismiss UX or wait for bits-ui Sheet

4. **Tooltip.svelte** → bits-ui Tooltip
   - Currently: Custom tooltip with position variants
   - bits-ui provides full Tooltip API: `Tooltip.Provider`, `Tooltip.Root`, `Tooltip.Trigger`, `Tooltip.Content`, `Tooltip.Arrow`
   - **Mobile limitation**: bits-ui tooltips are not supported on mobile devices; fall back to Popover or Floating UI for mobile-first behavior

### Already Migrated / Working Well

- ConfirmDialog.svelte - Uses bits-ui via Dialog.svelte wrapper
- ConfirmReplaceDialog.svelte - Already using bits-ui directly
- HelpPanel.svelte - Already using bits-ui directly
- ExportDialog.svelte - Uses Dialog.svelte wrapper (bits-ui-based)
- ShareDialog.svelte - Uses Dialog.svelte wrapper

---

## Package Dependencies

From `package.json`:

- `bits-ui`: `^2.15.4` - Headless component library
- `paneforge`: `^1.0.2` - Resizable panes

**Available in bits-ui v2.15.4:**

- Dialog
- Accordion
- Tabs
- Tooltip
- Popover
- Select
- Combobox
- NOT included: Sheet (Drawer) — use vaul-svelte instead

---

## Key Insights

1. **Partial bits-ui adoption:** Already using Dialog (3 components), Accordion (1 component), Tabs (1 new component)

2. **State management is cohesive:** Centralized `dialogStore` coordinates all dialog state

3. **Accessibility baseline is good:** bits-ui provides built-in ARIA; custom components use utilities

4. **Mobile sheets are custom:** No bits-ui Sheet available; BottomSheet implements swipe-to-dismiss well

5. **Tooltip available:** bits-ui provides full Tooltip API (`Tooltip.Provider`, `Tooltip.Root`, `Tooltip.Trigger`, `Tooltip.Content`, `Tooltip.Arrow`); current custom implementation can be migrated, noting mobile limitation (bits-ui tooltips not supported on touch devices)

6. **Migration strategy:** Focus on MobileWarningModal and ImportFromNetBoxDialog Tabs; Tooltip migration is straightforward for desktop, consider Popover fallback for mobile
