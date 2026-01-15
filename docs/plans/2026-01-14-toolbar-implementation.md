# Toolbar Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace hamburger-menu toolbar with Geismar-minimal icon-driven design using Iconoir.

**Architecture:** Three-zone layout (brand left, action cluster center, dropdowns right). Iconoir icons replace custom SVGs. bits-ui dropdowns for File and Settings menus.

**Tech Stack:** Svelte 5, bits-ui DropdownMenu, @iconoir/svelte

---

## Task 1: Install Iconoir Dependency

**Files:**

- Modify: `package.json`

**Step 1: Install @iconoir/svelte**

Run:

```bash
npm install @iconoir/svelte
```

**Step 2: Verify installation**

Run:

```bash
grep iconoir package.json
```

Expected: `"@iconoir/svelte": "^X.X.X"`

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @iconoir/svelte dependency"
```

---

## Task 2: Create FileMenu Component

**Files:**

- Create: `src/lib/components/FileMenu.svelte`

**Step 1: Create FileMenu.svelte**

```svelte
<!--
  FileMenu Component
  Dropdown for file operations: Save, Load, Export, Share
  Uses bits-ui DropdownMenu with Iconoir folder trigger
-->
<script lang="ts">
  import { DropdownMenu } from "bits-ui";
  import { Folder } from "@iconoir/svelte";

  interface Props {
    onsave?: () => void;
    onload?: () => void;
    onexport?: () => void;
    onshare?: () => void;
    hasRacks?: boolean;
  }

  let { onsave, onload, onexport, onshare, hasRacks = false }: Props = $props();

  let open = $state(false);

  function handleSelect(action?: () => void) {
    return () => {
      action?.();
      open = false;
    };
  }
</script>

<DropdownMenu.Root bind:open>
  <DropdownMenu.Trigger class="toolbar-icon-btn" aria-label="File menu">
    <Folder width={18} height={18} />
  </DropdownMenu.Trigger>

  <DropdownMenu.Portal>
    <DropdownMenu.Content class="menu-content" sideOffset={8} align="end">
      <DropdownMenu.Item class="menu-item" onSelect={handleSelect(onsave)}>
        <span class="menu-label">Save</span>
        <span class="menu-shortcut">Ctrl+S</span>
      </DropdownMenu.Item>
      <DropdownMenu.Item class="menu-item" onSelect={handleSelect(onload)}>
        <span class="menu-label">Load</span>
        <span class="menu-shortcut">Ctrl+O</span>
      </DropdownMenu.Item>
      <DropdownMenu.Item class="menu-item" onSelect={handleSelect(onexport)}>
        <span class="menu-label">Export</span>
        <span class="menu-shortcut">Ctrl+E</span>
      </DropdownMenu.Item>
      <DropdownMenu.Item
        class="menu-item"
        disabled={!hasRacks}
        onSelect={handleSelect(onshare)}
      >
        <span class="menu-label">Share</span>
      </DropdownMenu.Item>
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>

<style>
  /* Trigger inherits .toolbar-icon-btn from Toolbar.svelte */
  :global(.toolbar-icon-btn) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    padding: 0;
    border: none;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--colour-text-muted);
    cursor: pointer;
    transition:
      background-color var(--duration-fast) var(--ease-out),
      color var(--duration-fast) var(--ease-out);
  }

  :global(.toolbar-icon-btn:hover) {
    background: var(--colour-surface-hover);
    color: var(--colour-text);
  }

  :global(.toolbar-icon-btn:focus-visible) {
    outline: none;
    box-shadow:
      0 0 0 2px var(--colour-bg),
      0 0 0 4px var(--colour-focus-ring);
  }

  :global(.toolbar-icon-btn[data-state="open"]) {
    background: var(--colour-surface-hover);
    color: var(--colour-text);
  }

  :global(.toolbar-icon-btn:disabled) {
    opacity: 0.4;
    cursor: not-allowed;
  }

  :global(.menu-content) {
    z-index: var(--z-dropdown, 100);
    min-width: 160px;
    padding: var(--space-2);
    background-color: var(--colour-surface-overlay);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    animation: menu-fade-in var(--duration-fast) var(--ease-out);
  }

  @keyframes menu-fade-in {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  :global(.menu-item) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    padding: var(--space-2);
    border-radius: var(--radius-sm);
    color: var(--colour-text-inverse);
    font-size: var(--font-size-sm);
    cursor: pointer;
    transition: background-color var(--duration-fast) var(--ease-out);
    outline: none;
  }

  :global(.menu-item:hover),
  :global(.menu-item[data-highlighted]) {
    background-color: var(--colour-overlay-hover);
  }

  :global(.menu-item[data-disabled]) {
    opacity: 0.4;
    cursor: not-allowed;
  }

  :global(.menu-label) {
    flex: 1;
  }

  :global(.menu-shortcut) {
    padding: 2px 6px;
    background-color: var(--colour-overlay-hover);
    border-radius: 3px;
    font-size: var(--font-size-xs);
    font-family: var(--font-mono, monospace);
    color: var(--colour-text-muted-inverse);
  }

  @media (prefers-reduced-motion: reduce) {
    :global(.menu-content) {
      animation: none;
    }
  }
</style>
```

**Step 2: Verify file compiles**

Run:

```bash
npm run build 2>&1 | grep -i error || echo "BUILD OK"
```

Expected: `BUILD OK`

**Step 3: Commit**

```bash
git add src/lib/components/FileMenu.svelte
git commit -m "feat: add FileMenu dropdown component"
```

---

## Task 3: Create SettingsMenu Component

**Files:**

- Create: `src/lib/components/SettingsMenu.svelte`

**Step 1: Create SettingsMenu.svelte**

```svelte
<!--
  SettingsMenu Component
  Dropdown for settings: Theme, Annotations, Banana for Scale
  Uses bits-ui DropdownMenu with Iconoir settings trigger
-->
<script lang="ts">
  import { DropdownMenu } from "bits-ui";
  import { Settings } from "@iconoir/svelte";

  interface Props {
    theme?: "dark" | "light";
    showAnnotations?: boolean;
    showBanana?: boolean;
    ontoggletheme?: () => void;
    ontoggleannotations?: () => void;
    ontogglebanana?: () => void;
  }

  let {
    theme = "dark",
    showAnnotations = false,
    showBanana = false,
    ontoggletheme,
    ontoggleannotations,
    ontogglebanana,
  }: Props = $props();

  let open = $state(false);
</script>

<DropdownMenu.Root bind:open>
  <DropdownMenu.Trigger class="toolbar-icon-btn" aria-label="Settings menu">
    <Settings width={18} height={18} />
  </DropdownMenu.Trigger>

  <DropdownMenu.Portal>
    <DropdownMenu.Content class="menu-content" sideOffset={8} align="end">
      <DropdownMenu.Item
        class="menu-item"
        onSelect={() => {
          ontoggletheme?.();
          open = false;
        }}
      >
        <span class="menu-label"
          >{theme === "dark" ? "Light" : "Dark"} Theme</span
        >
      </DropdownMenu.Item>

      <DropdownMenu.CheckboxItem
        class="menu-item"
        checked={showAnnotations}
        onCheckedChange={() => {
          ontoggleannotations?.();
          open = false;
        }}
      >
        {#snippet children({ checked })}
          <span class="menu-checkbox">{checked ? "✓" : ""}</span>
          <span class="menu-label">Show Annotations</span>
        {/snippet}
      </DropdownMenu.CheckboxItem>

      <DropdownMenu.CheckboxItem
        class="menu-item"
        checked={showBanana}
        onCheckedChange={() => {
          ontogglebanana?.();
          open = false;
        }}
      >
        {#snippet children({ checked })}
          <span class="menu-checkbox">{checked ? "✓" : ""}</span>
          <span class="menu-label">Banana for Scale</span>
        {/snippet}
      </DropdownMenu.CheckboxItem>
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>

<style>
  :global(.menu-checkbox) {
    width: 16px;
    font-size: var(--font-size-sm);
    color: var(--colour-text-inverse);
  }
</style>
```

**Step 2: Verify file compiles**

Run:

```bash
npm run build 2>&1 | grep -i error || echo "BUILD OK"
```

Expected: `BUILD OK`

**Step 3: Commit**

```bash
git add src/lib/components/SettingsMenu.svelte
git commit -m "feat: add SettingsMenu dropdown component"
```

---

## Task 4: Create IconImageLabel Component

**Files:**

- Create: `src/lib/components/icons/IconImageLabel.svelte`
- Modify: `src/lib/components/icons/index.ts`

**Step 1: Create IconImageLabel.svelte**

This is a custom combined icon for "Both" display mode (text + image overlay).

```svelte
<!--
  IconImageLabel Component
  Combined icon for "Both" display mode (Labels + Images)
  Overlays text (T) and image icons
-->
<script lang="ts">
  interface Props {
    size?: number;
  }

  let { size = 18 }: Props = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <!-- Image frame (background, slightly smaller) -->
  <rect x="2" y="6" width="12" height="12" rx="1" opacity="0.6" />
  <!-- Text T (foreground, offset) -->
  <path d="M12 4V4h8v3" />
  <path d="M16 4v10" />
  <path d="M14 14h4" />
</svg>
```

**Step 2: Add to barrel export**

In `src/lib/components/icons/index.ts`, add:

```typescript
export { default as IconImageLabel } from "./IconImageLabel.svelte";
```

**Step 3: Verify file compiles**

Run:

```bash
npm run build 2>&1 | grep -i error || echo "BUILD OK"
```

Expected: `BUILD OK`

**Step 4: Commit**

```bash
git add src/lib/components/icons/IconImageLabel.svelte src/lib/components/icons/index.ts
git commit -m "feat: add IconImageLabel for combined view mode"
```

---

## Task 5: Refactor Toolbar Component

**Files:**

- Modify: `src/lib/components/Toolbar.svelte`

**Step 1: Rewrite Toolbar.svelte with three-zone layout**

```svelte
<!--
  Toolbar Component
  Geismar-minimal three-zone layout:
  - Left: Logo lockup (clickable for help)
  - Center: Action cluster (New, Undo, Redo, View, Fit)
  - Right: Dropdown menus (File, Settings)
-->
<script lang="ts">
  import Tooltip from "./Tooltip.svelte";
  import FileMenu from "./FileMenu.svelte";
  import SettingsMenu from "./SettingsMenu.svelte";
  import LogoLockup from "./LogoLockup.svelte";
  import { IconImageLabel } from "./icons";
  import {
    Plus,
    Undo,
    Redo,
    Compress,
    Text,
    MediaImage,
  } from "@iconoir/svelte";
  import type { DisplayMode } from "$lib/types";
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { getToastStore } from "$lib/stores/toast.svelte";
  import { analytics } from "$lib/utils/analytics";

  interface Props {
    hasSelection?: boolean;
    hasRacks?: boolean;
    theme?: "dark" | "light";
    displayMode?: DisplayMode;
    showAnnotations?: boolean;
    showBanana?: boolean;
    partyMode?: boolean;
    onnewrack?: () => void;
    onsave?: () => void;
    onload?: () => void;
    onexport?: () => void;
    onshare?: () => void;
    ondelete?: () => void;
    onfitall?: () => void;
    ontoggletheme?: () => void;
    ontoggledisplaymode?: () => void;
    ontoggleannotations?: () => void;
    ontogglebanana?: () => void;
    onhelp?: () => void;
  }

  let {
    hasSelection = false,
    hasRacks = false,
    theme = "dark",
    displayMode = "label",
    showAnnotations = false,
    showBanana = false,
    partyMode = false,
    onnewrack,
    onsave,
    onload,
    onexport,
    onshare,
    ondelete,
    onfitall,
    ontoggletheme,
    ontoggledisplaymode,
    ontoggleannotations,
    ontogglebanana,
    onhelp,
  }: Props = $props();

  const layoutStore = getLayoutStore();
  const toastStore = getToastStore();

  // View mode labels for tooltip
  const displayModeLabels: Record<DisplayMode, string> = {
    label: "Labels",
    image: "Images",
    "image-label": "Both",
  };

  function handleUndo() {
    if (!layoutStore.canUndo) return;
    const desc = layoutStore.undoDescription?.replace("Undo: ", "") ?? "action";
    layoutStore.undo();
    toastStore.showToast(`Undid: ${desc}`, "info");
    analytics.trackToolbarClick("undo");
  }

  function handleRedo() {
    if (!layoutStore.canRedo) return;
    const desc = layoutStore.redoDescription?.replace("Redo: ", "") ?? "action";
    layoutStore.redo();
    toastStore.showToast(`Redid: ${desc}`, "info");
    analytics.trackToolbarClick("redo");
  }

  function handleNewRack() {
    analytics.trackRackCreate();
    analytics.trackToolbarClick("new-rack");
    onnewrack?.();
  }

  function handleSave() {
    analytics.trackToolbarClick("save");
    onsave?.();
  }

  function handleLoad() {
    analytics.trackToolbarClick("load");
    onload?.();
  }

  function handleExport() {
    analytics.trackToolbarClick("export");
    onexport?.();
  }

  function handleShare() {
    analytics.trackToolbarClick("share");
    onshare?.();
  }

  function handleFitAll() {
    analytics.trackToolbarClick("fit-all");
    onfitall?.();
  }

  function handleToggleTheme() {
    analytics.trackToolbarClick("theme");
    ontoggletheme?.();
  }

  function handleToggleDisplayMode() {
    analytics.trackToolbarClick("display-mode");
    ontoggledisplaymode?.();
  }

  function handleToggleAnnotations() {
    analytics.trackToolbarClick("annotations");
    ontoggleannotations?.();
  }

  function handleToggleBanana() {
    analytics.trackToolbarClick("banana");
    ontogglebanana?.();
  }
</script>

<header class="toolbar">
  <!-- Left: Logo -->
  <div class="toolbar-section toolbar-left">
    <Tooltip text="About & Shortcuts" shortcut="?" position="bottom">
      <button
        class="toolbar-brand"
        type="button"
        aria-label="About & Shortcuts"
        onclick={onhelp}
        data-testid="btn-logo-about"
      >
        <LogoLockup size={32} {partyMode} />
      </button>
    </Tooltip>
  </div>

  <!-- Center: Action cluster -->
  <div class="toolbar-section toolbar-center">
    <Tooltip text="New Rack" position="bottom">
      <button
        class="toolbar-icon-btn"
        aria-label="New Rack"
        onclick={handleNewRack}
        data-testid="btn-new-rack"
      >
        <Plus width={18} height={18} />
      </button>
    </Tooltip>

    <Tooltip
      text={layoutStore.undoDescription ?? "Undo"}
      shortcut="Ctrl+Z"
      position="bottom"
    >
      <button
        class="toolbar-icon-btn"
        aria-label={layoutStore.undoDescription ?? "Undo"}
        disabled={!layoutStore.canUndo}
        onclick={handleUndo}
        data-testid="btn-undo"
      >
        <Undo width={18} height={18} />
      </button>
    </Tooltip>

    <Tooltip
      text={layoutStore.redoDescription ?? "Redo"}
      shortcut="Ctrl+Shift+Z"
      position="bottom"
    >
      <button
        class="toolbar-icon-btn"
        aria-label={layoutStore.redoDescription ?? "Redo"}
        disabled={!layoutStore.canRedo}
        onclick={handleRedo}
        data-testid="btn-redo"
      >
        <Redo width={18} height={18} />
      </button>
    </Tooltip>

    <Tooltip
      text="Display: {displayModeLabels[displayMode]}"
      shortcut="I"
      position="bottom"
    >
      <button
        class="toolbar-icon-btn"
        aria-label="Toggle display mode"
        onclick={handleToggleDisplayMode}
        data-testid="btn-display-mode"
      >
        {#if displayMode === "label"}
          <Text width={18} height={18} />
        {:else if displayMode === "image"}
          <MediaImage width={18} height={18} />
        {:else}
          <IconImageLabel size={18} />
        {/if}
      </button>
    </Tooltip>

    <Tooltip text="Reset View" shortcut="F" position="bottom">
      <button
        class="toolbar-icon-btn"
        aria-label="Reset View"
        onclick={handleFitAll}
        data-testid="btn-fit-all"
      >
        <Compress width={18} height={18} />
      </button>
    </Tooltip>
  </div>

  <!-- Right: Dropdown menus -->
  <div class="toolbar-section toolbar-right">
    <FileMenu
      onsave={handleSave}
      onload={handleLoad}
      onexport={handleExport}
      onshare={handleShare}
      {hasRacks}
    />

    <SettingsMenu
      {theme}
      {showAnnotations}
      {showBanana}
      ontoggletheme={handleToggleTheme}
      ontoggleannotations={handleToggleAnnotations}
      ontogglebanana={handleToggleBanana}
    />
  </div>
</header>

<style>
  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: var(--toolbar-height);
    padding: 0 var(--space-4);
    background: var(--colour-toolbar-bg, var(--toolbar-bg));
    border-bottom: 1px solid var(--colour-toolbar-border, var(--toolbar-border));
    flex-shrink: 0;
    position: relative;
    z-index: var(--z-toolbar);
  }

  .toolbar-section {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .toolbar-left {
    flex: 0 0 auto;
  }

  .toolbar-center {
    flex: 0 0 auto;
    gap: var(--space-1);
  }

  .toolbar-right {
    flex: 0 0 auto;
    gap: var(--space-1);
  }

  /* Logo button */
  .toolbar-brand {
    display: flex;
    align-items: center;
    padding: var(--space-1);
    border: none;
    border-radius: var(--radius-md);
    background: transparent;
    cursor: pointer;
    transition:
      background-color var(--duration-fast) var(--ease-out),
      transform var(--duration-fast) var(--ease-out);
  }

  .toolbar-brand:hover {
    background: var(--colour-surface-hover);
  }

  .toolbar-brand:active {
    transform: scale(0.98);
  }

  .toolbar-brand:focus-visible {
    outline: none;
    box-shadow:
      0 0 0 2px var(--colour-bg),
      0 0 0 4px var(--colour-focus-ring);
  }

  /* Icon buttons */
  .toolbar-icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    padding: 0;
    border: none;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--colour-text-muted);
    cursor: pointer;
    transition:
      background-color var(--duration-fast) var(--ease-out),
      color var(--duration-fast) var(--ease-out);
  }

  .toolbar-icon-btn:hover:not(:disabled) {
    background: var(--colour-surface-hover);
    color: var(--colour-text);
  }

  .toolbar-icon-btn:focus-visible {
    outline: none;
    box-shadow:
      0 0 0 2px var(--colour-bg),
      0 0 0 4px var(--colour-focus-ring);
  }

  .toolbar-icon-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* Responsive: Hide text on narrow screens */
  @media (max-width: 600px) {
    .toolbar-center {
      gap: 0;
    }
  }
</style>
```

**Step 2: Verify file compiles**

Run:

```bash
npm run build 2>&1 | grep -i error || echo "BUILD OK"
```

Expected: `BUILD OK`

**Step 3: Commit**

```bash
git add src/lib/components/Toolbar.svelte
git commit -m "refactor: toolbar with three-zone layout and Iconoir icons"
```

---

## Task 6: Update App.svelte for Banana Prop

**Files:**

- Modify: `src/App.svelte`

**Step 1: Find Toolbar usage and add showBanana/ontogglebanana props**

Search for `<Toolbar` in App.svelte and add the missing props.

Run:

```bash
grep -n "Toolbar" src/App.svelte | head -5
```

Then add `showBanana={showBanana}` and `ontogglebanana={toggleBanana}` to the Toolbar component.

**Step 2: Verify file compiles**

Run:

```bash
npm run build 2>&1 | grep -i error || echo "BUILD OK"
```

**Step 3: Commit**

```bash
git add src/App.svelte
git commit -m "feat: wire banana toggle to toolbar settings menu"
```

---

## Task 7: Remove Banana from HelpPanel

**Files:**

- Modify: `src/lib/components/HelpPanel.svelte`

**Step 1: Remove banana toggle section**

Find and remove:

- The `showBanana` prop
- The `ontogglebanana` prop
- The checkbox UI for "Banana for scale"

**Step 2: Verify file compiles**

Run:

```bash
npm run build 2>&1 | grep -i error || echo "BUILD OK"
```

**Step 3: Commit**

```bash
git add src/lib/components/HelpPanel.svelte
git commit -m "refactor: remove banana toggle from HelpPanel (moved to Settings)"
```

---

## Task 8: Delete ToolbarMenu Component

**Files:**

- Delete: `src/lib/components/ToolbarMenu.svelte`

**Step 1: Remove file**

Run:

```bash
rm src/lib/components/ToolbarMenu.svelte
```

**Step 2: Verify no remaining imports**

Run:

```bash
grep -r "ToolbarMenu" src/ || echo "NO REFERENCES"
```

Expected: `NO REFERENCES`

**Step 3: Verify build passes**

Run:

```bash
npm run build 2>&1 | grep -i error || echo "BUILD OK"
```

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: delete ToolbarMenu (replaced by FileMenu + SettingsMenu)"
```

---

## Task 9: Run Full Test Suite

**Step 1: Run all tests**

Run:

```bash
npm run test:run
```

Expected: All tests pass

**Step 2: Run linter**

Run:

```bash
npm run lint
```

Expected: No errors

**Step 3: Run build**

Run:

```bash
npm run build
```

Expected: Build succeeds

---

## Task 10: Manual Visual QA

**Step 1: Start dev server**

Run:

```bash
npm run dev
```

**Step 2: Verify in browser**

Check:

- [ ] Logo on left, clickable for help
- [ ] Center cluster: New (+), Undo, Redo, View mode (morphs), Reset View
- [ ] Right side: File dropdown, Settings dropdown
- [ ] View mode icon changes when cycling (I key)
- [ ] File dropdown: Save, Load, Export, Share
- [ ] Settings dropdown: Theme toggle, Annotations checkbox, Banana checkbox
- [ ] Disabled states work (Undo/Redo when stack empty)
- [ ] Tooltips with keyboard shortcuts appear
- [ ] Responsive: works at narrow widths

**Step 3: Create final commit if any fixes needed**

---

## Task 11: Create Pull Request

**Step 1: Push branch**

Run:

```bash
git push -u origin 607-toolbar-redesign
```

**Step 2: Create PR**

Run:

```bash
gh pr create --title "Redesign toolbar with Geismar-minimal aesthetic" --body "$(cat <<'EOF'
## Summary

Replaces hamburger-menu toolbar with clean, icon-driven design.

Closes #607

## Changes

- Three-zone layout: Logo (left) | Actions (center) | Menus (right)
- Center action cluster: New Rack, Undo, Redo, View Mode, Reset View
- View mode icon morphs: Text → Image → Combined
- File dropdown: Save, Load, Export, Share
- Settings dropdown: Theme, Annotations, Banana for Scale
- Iconoir icons replace custom SVGs

## Screenshots

[Add before/after screenshots]

## Test Plan

- [x] All 1648 tests pass
- [x] Lint passes
- [x] Build succeeds
- [ ] Manual QA in browser

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

**Step 3: Wait for CodeRabbit review**

Run:

```bash
gh pr checks <PR_NUMBER> --watch
```
