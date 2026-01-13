# Research Spike #492: bits-ui External Research

**Date:** 2026-01-12
**Purpose:** Evaluate bits-ui component library for adoption in Rackula

## bits-ui Overview

[Bits UI](https://bits-ui.com/) is a headless component library for Svelte that provides flexible, unstyled, and accessible primitives for building custom component libraries.

### Key Characteristics

- **Headless by Design**: Components ship with minimal styling, giving developers complete control over appearance
- **Svelte 5 Native**: Version 2.x is a complete rewrite for Svelte 5 with runes support
- **Accessibility First**: WAI-ARIA compliance, keyboard navigation, and focus management built-in
- **TypeScript**: Full TypeScript coverage with comprehensive type definitions
- **Composable**: Components function as primitives rather than rigid black boxes

### Project Statistics (as of Jan 2026)

- **Current Version**: 2.15.4 (released Jan 5, 2026)
- **GitHub Stars**: 3,000+
- **Projects Using**: ~12,900
- **Contributors**: 96
- **License**: MIT

### Maintainers

- Hunter Johnston (huntabyte) - primary maintainer
- Part of the svecosystem organization
- Same author as PaneForge, shadcn-svelte, and vaul-svelte

## Available Components (v2.14.4+)

bits-ui provides 44+ components organized into several categories:

### Interactive Elements
- **Button** - Basic interactive button primitive
- **Toggle** - Binary on/off switch
- **Toggle Group** - Group of toggle buttons (single/multiple selection)
- **Switch** - Accessible toggle switch

### Overlays & Dialogs
- **Dialog** - Modal dialog with focus trapping
- **Alert Dialog** - Confirmation dialog with cancel/action buttons
- **Popover** - Floating panel anchored to trigger
- **Tooltip** - Hover/focus information display

### Navigation & Organization
- **Accordion** - Collapsible content sections
- **Tabs** - Tabbed content organization
- **Navigation Menu** - Accessible navigation with submenus
- **Menubar** - Application menubar component
- **Context Menu** - Right-click context menus
- **Dropdown Menu** - Click-triggered dropdown menus

### Form Components
- **Checkbox** - Single/indeterminate checkbox
- **Radio Group** - Exclusive selection group
- **Select** - Enhanced dropdown select
- **Combobox** - Searchable select with typeahead
- **Slider** - Range input slider
- **Label** - Accessible form labels

### Date & Time
- **Calendar** - Date calendar picker
- **Date Field** - Text input with date parsing
- **Date Picker** - Combined field + calendar
- **Date Range Field** - Two-date range input
- **Date Range Picker** - Range field + calendar
- **Range Calendar** - Calendar for date ranges

### Utilities
- **Collapsible** - Expandable/collapsible content
- **Separator** - Visual divider
- **Avatar** - User avatar with fallback
- **Link Preview** - URL preview on hover
- **Progress** - Progress indicator
- **Scroll Area** - Custom scrollbar area
- **Toolbar** - Action bar component
- **Pagination** - Page navigation
- **PIN Input** - PIN/OTP code input
- **Aspect Ratio** - Constrained ratio container

### Note: Sheet/Drawer

bits-ui does **not** include a Sheet/Drawer component natively. For drawer functionality, use [vaul-svelte](https://github.com/huntabyte/vaul-svelte), a companion library from the same ecosystem.

## Dialog Component

### API

```svelte
<script lang="ts">
  import { Dialog } from "bits-ui";
</script>

<Dialog.Root bind:open={isOpen}>
  <Dialog.Trigger>Open Dialog</Dialog.Trigger>
  <Dialog.Portal>
    <Dialog.Overlay />
    <Dialog.Content>
      <Dialog.Title>Dialog Title</Dialog.Title>
      <Dialog.Description>Description text</Dialog.Description>
      <!-- Content here -->
      <Dialog.Close>Close</Dialog.Close>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
```

### Sub-components

| Component | Purpose |
|-----------|---------|
| `Dialog.Root` | Manages dialog state and context |
| `Dialog.Trigger` | Opens the dialog on click |
| `Dialog.Portal` | Renders content outside DOM hierarchy |
| `Dialog.Overlay` | Backdrop/scrim element |
| `Dialog.Content` | Main content container |
| `Dialog.Title` | Accessible title (required for a11y) |
| `Dialog.Description` | Accessible description |
| `Dialog.Close` | Closes the dialog |

### Key Props

**Dialog.Root:**
- `open` (bindable) - Controls open state
- `onOpenChange` - Callback when state changes

**Dialog.Content:**
- `trapFocus` - Enable focus trapping (default: true)
- `preventScroll` - Lock body scroll (default: true)
- `escapeKeydownBehavior` - 'close' | 'ignore' | 'defer-otherwise-close'
- `interactOutsideBehavior` - 'close' | 'ignore' | 'defer-otherwise-close'
- `onOpenAutoFocus` - Override initial focus target
- `onCloseAutoFocus` - Override focus restoration
- `forceMount` - Keep in DOM for transitions

### Accessibility

- **ARIA Attributes**: Automatically applies `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, `aria-describedby`
- **Focus Management**:
  - Focus trapped within dialog when open
  - Focus returns to trigger on close
  - Customizable via `onOpenAutoFocus` / `onCloseAutoFocus`
- **Keyboard Navigation**:
  - `Escape` closes dialog (configurable)
  - `Tab` cycles through focusable elements
- **Screen Reader**: Title and description properly announced

### Best Practices

1. **Always include Title**: Required for accessibility, use `visuallyHidden` class if design requires no visible title
2. **Use Portal**: Prevents z-index and overflow issues
3. **Handle async operations**: When submitting forms, wait for completion before closing
4. **Nested dialogs**: Supported with automatic `--bits-dialog-nested-count` CSS variable

## Tabs Component

### API

```svelte
<script lang="ts">
  import { Tabs } from "bits-ui";
  let value = $state("tab1");
</script>

<Tabs.Root bind:value>
  <Tabs.List>
    <Tabs.Trigger value="tab1">Tab 1</Tabs.Trigger>
    <Tabs.Trigger value="tab2">Tab 2</Tabs.Trigger>
  </Tabs.List>
  <Tabs.Content value="tab1">Content 1</Tabs.Content>
  <Tabs.Content value="tab2">Content 2</Tabs.Content>
</Tabs.Root>
```

### Sub-components

| Component | Purpose |
|-----------|---------|
| `Tabs.Root` | Container managing tab state |
| `Tabs.List` | Wrapper for tab triggers |
| `Tabs.Trigger` | Clickable tab button |
| `Tabs.Content` | Panel content for each tab |

### Key Props

**Tabs.Root:**
- `value` (bindable) - Active tab value
- `orientation` - 'horizontal' | 'vertical' (affects keyboard nav)
- `activationMode` - 'automatic' | 'manual'
- `loop` - Enable keyboard loop navigation (default: true)

**Tabs.Trigger:**
- `value` - Unique identifier matching content
- `disabled` - Disable this trigger

### Accessibility

- **ARIA Roles**: `tablist`, `tab`, `tabpanel` automatically applied
- **Keyboard Navigation**:
  - Horizontal: `ArrowLeft` / `ArrowRight` move focus
  - Vertical: `ArrowUp` / `ArrowDown` move focus
  - `Home` / `End` jump to first/last tab
  - `Enter` / `Space` activate tab (in manual mode)
- **Focus Management**: Proper `tabindex` handling
- **Data Attributes**: `data-state="active"` / `data-state="inactive"` for styling

### Best Practices

1. **Set orientation for vertical tabs**: Changes keyboard navigation to up/down arrows
2. **Use manual activation for expensive content**: Set `activationMode="manual"` to require explicit selection
3. **Style using data attributes**: Target `[data-tabs-trigger][data-state="active"]`

## Accordion Component

### API

```svelte
<script lang="ts">
  import { Accordion } from "bits-ui";
</script>

<Accordion.Root type="single" collapsible>
  <Accordion.Item value="item1">
    <Accordion.Header>
      <Accordion.Trigger>Section 1</Accordion.Trigger>
    </Accordion.Header>
    <Accordion.Content>Content 1</Accordion.Content>
  </Accordion.Item>
</Accordion.Root>
```

### Sub-components

| Component | Purpose |
|-----------|---------|
| `Accordion.Root` | Manages accordion state |
| `Accordion.Item` | Individual collapsible section |
| `Accordion.Header` | Wrapper for trigger (semantic heading) |
| `Accordion.Trigger` | Clickable expand/collapse button |
| `Accordion.Content` | Collapsible content area |

### Key Props

**Accordion.Root:**
- `type` - 'single' | 'multiple' (required)
- `value` (bindable) - Open item(s)
- `collapsible` - Allow closing all items (single mode)
- `disabled` - Disable entire accordion

### Accessibility

- **ARIA**: Proper `aria-expanded`, `aria-controls`, `aria-labelledby`
- **Keyboard**:
  - `Enter` / `Space` toggle
  - `ArrowUp` / `ArrowDown` navigate items
  - `Home` / `End` jump to first/last

### Best Practices

1. **Choose type carefully**: 'single' for mutually exclusive, 'multiple' for independent
2. **Use `hiddenUntilFound`**: Enables browser search within collapsed content
3. **Animate with CSS variables**: Use `--bits-accordion-content-height` for smooth animations

## Sheet/Drawer Status

**bits-ui does NOT include a native Sheet or Drawer component.**

### Recommended Alternative: vaul-svelte

[vaul-svelte](https://github.com/huntabyte/vaul-svelte) is the recommended solution from the same Huntabyte ecosystem.

```svelte
<script>
  import { Drawer } from "vaul-svelte";
</script>

<Drawer.Root>
  <Drawer.Trigger>Open</Drawer.Trigger>
  <Drawer.Portal>
    <Drawer.Overlay />
    <Drawer.Content>
      <p>Drawer content</p>
    </Drawer.Content>
  </Drawer.Portal>
</Drawer.Root>
```

### vaul-svelte Features

- **Direction**: top, bottom, left, right (default: bottom)
- **Snap Points**: Multiple drawer positions
- **Swipe to Close**: Touch-friendly gestures
- **Background Scaling**: Optional background scale effect
- **Built on bits-ui Dialog**: Shares similar API patterns
- **Svelte 5 Compatible**: Version 1.0+ supports Svelte 5

### Installation

```bash
npm install vaul-svelte
```

## Tooltip Status

bits-ui **includes a full Tooltip component**.

### API

```svelte
<script lang="ts">
  import { Tooltip } from "bits-ui";
</script>

<Tooltip.Provider>
  <Tooltip.Root>
    <Tooltip.Trigger>Hover me</Tooltip.Trigger>
    <Tooltip.Portal>
      <Tooltip.Content>
        Tooltip text
        <Tooltip.Arrow />
      </Tooltip.Content>
    </Tooltip.Portal>
  </Tooltip.Root>
</Tooltip.Provider>
```

### Key Props

**Tooltip.Root:**
- `open` (bindable) - Control visibility
- `delayDuration` - Hover delay (default: 700ms)
- `disableHoverableContent` - Close when leaving trigger

**Tooltip.Content:**
- `side` - 'top' | 'bottom' | 'left' | 'right'
- `align` - 'start' | 'center' | 'end'
- `sideOffset` - Distance from trigger

### Important Limitation

**Tooltips are NOT supported on mobile devices.** The documentation explicitly states: "Tooltips are not supported on mobile devices because the intent of a tooltip is to provide a 'tip' about a 'tool' before interaction, which isn't possible with touch-based interfaces."

For mobile, consider using popovers with explicit triggers instead.

## Svelte 5 Runes Integration

bits-ui v2.x is built natively for Svelte 5 and works seamlessly with runes.

### State Binding with $state

```svelte
<script lang="ts">
  import { Dialog } from "bits-ui";

  // Use $state for reactive values
  let isOpen = $state(false);
  let activeTab = $state("details");
</script>

<Dialog.Root bind:open={isOpen}>
  <!-- ... -->
</Dialog.Root>

<Tabs.Root bind:value={activeTab}>
  <!-- ... -->
</Tabs.Root>
```

### Controlled State Pattern

For more control, use function bindings:

```svelte
<script lang="ts">
  let count = $state(0);
  let isOpen = $state(false);

  // Controlled: intercept state changes
  function handleOpenChange(open: boolean) {
    if (open) count++;
    isOpen = open;
  }
</script>

<Dialog.Root
  open={isOpen}
  onOpenChange={handleOpenChange}
>
  <!-- ... -->
</Dialog.Root>
```

### Derived Values

```svelte
<script lang="ts">
  import { Tabs } from "bits-ui";

  let activeTab = $state("overview");
  let isDetailsTab = $derived(activeTab === "details");
</script>

{#if isDetailsTab}
  <!-- Show extra UI when details tab is active -->
{/if}
```

### Event Handlers

bits-ui uses standard event handler naming (Svelte 5 style):

```svelte
<!-- Svelte 5 style -->
<Dialog.Trigger onclick={() => console.log("clicked")}>
  Open
</Dialog.Trigger>

<!-- NOT on:click (Svelte 4 style) -->
```

## Migration Patterns

### From bits-ui v0.x to v2.x

Key breaking changes documented in the [Migration Guide](https://www.bits-ui.com/docs/migration-guide):

| v0.x | v2.x |
|------|------|
| `el` prop | `ref` prop |
| `asChild` prop | `child` snippet |
| Transition props | `forceMount` + Svelte transitions |
| `let:` directives | Snippet props |
| Auto-portal | Explicit `Portal` component |
| `group` prop (Tooltip) | `Tooltip.Provider` wrapper |

### From Custom Components to bits-ui

#### Custom Dialog → bits-ui Dialog

**Before (custom):**
```svelte
<script>
  export let open = false;
  export let onClose;
</script>

{#if open}
  <div class="overlay" on:click={onClose}>
    <div class="dialog" on:click|stopPropagation>
      <slot />
    </div>
  </div>
{/if}
```

**After (bits-ui):**
```svelte
<script lang="ts">
  import { Dialog } from "bits-ui";

  interface Props {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    children: Snippet;
  }
  let { open = $bindable(false), onOpenChange, children }: Props = $props();
</script>

<Dialog.Root bind:open {onOpenChange}>
  <Dialog.Portal>
    <Dialog.Overlay class="overlay" />
    <Dialog.Content class="dialog">
      {@render children()}
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
```

#### Custom Tabs → bits-ui Tabs

**Before:**
```svelte
<script>
  let activeTab = 0;
</script>

<div class="tabs">
  <button class:active={activeTab === 0} on:click={() => activeTab = 0}>
    Tab 1
  </button>
  <button class:active={activeTab === 1} on:click={() => activeTab = 1}>
    Tab 2
  </button>
</div>
{#if activeTab === 0}
  <div>Content 1</div>
{:else}
  <div>Content 2</div>
{/if}
```

**After:**
```svelte
<script lang="ts">
  import { Tabs } from "bits-ui";
  let value = $state("tab1");
</script>

<Tabs.Root bind:value>
  <Tabs.List class="tabs">
    <Tabs.Trigger value="tab1">Tab 1</Tabs.Trigger>
    <Tabs.Trigger value="tab2">Tab 2</Tabs.Trigger>
  </Tabs.List>
  <Tabs.Content value="tab1">Content 1</Tabs.Content>
  <Tabs.Content value="tab2">Content 2</Tabs.Content>
</Tabs.Root>
```

### Styling Migration

bits-ui uses data attributes for state-based styling:

```css
/* bits-ui approach */
[data-tabs-trigger][data-state="active"] {
  background: var(--color-primary);
  color: white;
}

[data-accordion-trigger][data-state="open"] {
  font-weight: bold;
}

[data-dialog-overlay] {
  background: rgba(0, 0, 0, 0.5);
}
```

## PaneForge Integration

[PaneForge](https://paneforge.com/) is part of the same Huntabyte ecosystem and provides resizable pane layouts.

### Current Version

- **Latest**: paneforge@1.0.2 (August 2025)
- **Svelte 5**: Fully compatible

### Components

```svelte
<script>
  import { PaneGroup, Pane, PaneResizer } from "paneforge";
</script>

<PaneGroup direction="horizontal">
  <Pane defaultSize={25}>
    Sidebar content
  </Pane>
  <PaneResizer />
  <Pane defaultSize={75}>
    Main content
  </Pane>
</PaneGroup>
```

### Features

- Horizontal and vertical layouts
- Nested pane groups
- Persistent layouts (localStorage/cookies)
- Collapsible panes
- Min/max size constraints
- Accessibility support

### Rackula Application

PaneForge could be useful for:
- Resizable sidebar panels
- Split-view layouts (e.g., device library + rack view)
- Responsive panel arrangements

## Roadmap / Upcoming Features

Based on recent releases (v2.14.x - v2.15.x):

### Recent Additions (v2.15.x)

- **Popover `openOnHover`**: Open popovers on hover with configurable delays (v2.15.0)
- **Tooltip grace area improvements**: Better hover behavior
- **Checkbox form submission**: Enter key support
- **Date field locale handling**: Improved i18n

### Maintenance Focus

Recent releases have focused on:
- Bug fixes for edge cases
- Scroll locking improvements
- Form component refinements
- Date picker locale support

### Active Development

The project maintains:
- Regular patch releases (319 releases total)
- Active GitHub issue tracking
- Discord community for support
- LLM-friendly documentation (llms.txt standard)

### No Major Announced Features

The project doesn't maintain a public roadmap, but based on the activity pattern:
- Focus on stability and polish
- Community-driven feature requests
- Compatibility with latest Svelte releases

## LLM Documentation Integration

bits-ui supports the [llms.txt standard](https://llmstxt.org/) for machine-readable documentation, making it ideal for AI-assisted development.

### Available Formats

1. **Per-Page Access**: Append `/llms.txt` to any documentation URL
   - Example: `bits-ui.com/docs/components/dialog/llms.txt`

2. **Root Index**: `bits-ui.com/llms.txt` lists all available endpoints

3. **Full Documentation**: `bits-ui.com/docs/llms.txt` (aggregated, large file)

### Integration Options for Rackula

#### Option 1: Svelte MCP Server (RECOMMENDED)

The project already has access to the official Svelte MCP server which provides:
- `list-sections` - Discover all available documentation (171+ sections)
- `get-documentation` - Fetch specific sections on-demand
- `svelte-autofixer` - Validate Svelte code against best practices
- `playground-link` - Generate playground links for code testing

**Benefits:**
- Already configured and available
- Covers Svelte 5, SvelteKit, and MCP documentation
- Tools work seamlessly with Claude Code
- No additional setup required

**Limitation:** Does NOT include bits-ui documentation directly, only Svelte/SvelteKit core.

#### Option 2: bits-ui llms.txt On-Demand Fetch

Use WebFetch to grab component docs when needed:
```
WebFetch: https://bits-ui.com/docs/components/dialog/llms.txt
```

**Benefits:**
- Always current documentation
- No storage/maintenance overhead
- Fetch only what's needed

**Limitation:** Requires explicit fetch per component during conversation.

#### Option 3: Local Documentation Cache

Download and commit key bits-ui llms.txt files to the project:
```
docs/reference/bits-ui/
├── dialog.md
├── tabs.md
├── accordion.md
├── tooltip.md
└── README.md  # Index with links to full docs
```

**Benefits:**
- Available offline
- Faster access during development
- Can be customized with project-specific notes

**Limitation:** Requires periodic updates, adds maintenance burden.

#### Option 4: Custom MCP Server for bits-ui

Create a bits-ui MCP server similar to the Svelte one:
- Fetch and cache llms.txt content
- Provide tools for component lookup
- Integrate with autofixer patterns

**Benefits:**
- Full integration with Claude Code workflow
- Can combine with project-specific patterns
- Tooling support (autofixer, playground)

**Limitation:** Significant development effort, maintenance overhead.

### Recommended Approach

**Hybrid: Svelte MCP + On-Demand Fetch**

1. Use Svelte MCP server for Svelte 5 / SvelteKit patterns
2. Use WebFetch for bits-ui component docs when implementing migrations
3. Document bits-ui patterns in `CLAUDE.md` as we learn them

Add to `CLAUDE.md`:
```markdown
### bits-ui Components

For bits-ui documentation during development:
- Dialog: `WebFetch https://bits-ui.com/docs/components/dialog/llms.txt`
- Tabs: `WebFetch https://bits-ui.com/docs/components/tabs/llms.txt`
- Accordion: `WebFetch https://bits-ui.com/docs/components/accordion/llms.txt`
- Tooltip: `WebFetch https://bits-ui.com/docs/components/tooltip/llms.txt`

Use the Svelte MCP `svelte-autofixer` tool to validate components after writing.
```

This approach:
- Leverages existing infrastructure
- Keeps documentation current
- Minimal maintenance burden
- Easy to evolve as needs change

## Sources

- [bits-ui Official Documentation](https://bits-ui.com/)
- [bits-ui GitHub Repository](https://github.com/huntabyte/bits-ui)
- [bits-ui Migration Guide](https://www.bits-ui.com/docs/migration-guide)
- [bits-ui LLM Documentation](https://bits-ui.com/docs/llms)
- [vaul-svelte GitHub](https://github.com/huntabyte/vaul-svelte)
- [PaneForge Documentation](https://paneforge.com/docs)
- [PaneForge GitHub](https://github.com/svecosystem/paneforge)
- [shadcn-svelte](https://www.shadcn-svelte.com/docs) (uses bits-ui)
- [Svelte MCP Server](https://mcp.svelte.dev/) (official Svelte documentation server)
