<!--
  ToolbarMenu Component
  Hamburger menu with grouped dropdown for File/Edit/View actions.
  Uses bits-ui DropdownMenu with dark overlay styling.
-->
<script lang="ts">
  import { DropdownMenu } from "bits-ui";
  import { IconMenu } from "./icons";
  import type { DisplayMode } from "$lib/types";

  interface Props {
    // File actions (optional to match Toolbar.svelte pattern)
    onsave?: () => void;
    onload?: () => void;
    onexport?: () => void;
    onshare?: () => void;
    hasRacks?: boolean;

    // Edit actions
    onundo?: () => void;
    onredo?: () => void;
    ondelete?: () => void;
    canUndo?: boolean;
    canRedo?: boolean;
    hasSelection?: boolean;
    undoDescription?: string;
    redoDescription?: string;

    // View actions
    onfitall?: () => void;
    ontoggledisplaymode?: () => void;
    ontoggleannotations?: () => void;
    ontoggletheme?: () => void;
    displayMode?: DisplayMode;
    showAnnotations?: boolean;
    theme?: "dark" | "light";
  }

  let {
    onsave,
    onload,
    onexport,
    onshare,
    hasRacks = false,
    onundo,
    onredo,
    ondelete,
    canUndo = false,
    canRedo = false,
    hasSelection = false,
    undoDescription,
    redoDescription,
    onfitall,
    ontoggledisplaymode,
    ontoggleannotations,
    ontoggletheme,
    displayMode = "label",
    showAnnotations = false,
    theme = "dark",
  }: Props = $props();

  let open = $state(false);

  const displayModeLabels: Record<DisplayMode, string> = {
    label: "Labels",
    image: "Images",
    "image-label": "Both",
  };

  function handleSelect(action?: () => void) {
    return () => {
      action?.();
      open = false;
    };
  }
</script>

<DropdownMenu.Root bind:open>
  <DropdownMenu.Trigger class="menu-trigger" aria-label="Menu">
    <IconMenu size={18} />
  </DropdownMenu.Trigger>

  <DropdownMenu.Portal>
    <DropdownMenu.Content class="menu-content" sideOffset={8} align="start">
      <!-- File Section -->
      <DropdownMenu.Group>
        <DropdownMenu.GroupHeading class="menu-heading"
          >File</DropdownMenu.GroupHeading
        >
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
      </DropdownMenu.Group>

      <DropdownMenu.Separator class="menu-separator" />

      <!-- Edit Section -->
      <DropdownMenu.Group>
        <DropdownMenu.GroupHeading class="menu-heading"
          >Edit</DropdownMenu.GroupHeading
        >
        <DropdownMenu.Item
          class="menu-item"
          disabled={!canUndo}
          onSelect={handleSelect(onundo)}
        >
          <span class="menu-label">{undoDescription ?? "Undo"}</span>
          <span class="menu-shortcut">Ctrl+Z</span>
        </DropdownMenu.Item>
        <DropdownMenu.Item
          class="menu-item"
          disabled={!canRedo}
          onSelect={handleSelect(onredo)}
        >
          <span class="menu-label">{redoDescription ?? "Redo"}</span>
          <span class="menu-shortcut">Ctrl+Shift+Z</span>
        </DropdownMenu.Item>
        <DropdownMenu.Item
          class="menu-item"
          disabled={!hasSelection}
          onSelect={handleSelect(ondelete)}
        >
          <span class="menu-label">Delete</span>
          <span class="menu-shortcut">Del</span>
        </DropdownMenu.Item>
      </DropdownMenu.Group>

      <DropdownMenu.Separator class="menu-separator" />

      <!-- View Section -->
      <DropdownMenu.Group>
        <DropdownMenu.GroupHeading class="menu-heading"
          >View</DropdownMenu.GroupHeading
        >
        <DropdownMenu.Item class="menu-item" onSelect={handleSelect(onfitall)}>
          <span class="menu-label">Reset View</span>
          <span class="menu-shortcut">F</span>
        </DropdownMenu.Item>
        <DropdownMenu.Item
          class="menu-item"
          onSelect={handleSelect(ontoggledisplaymode)}
        >
          <span class="menu-label"
            >Display: {displayModeLabels[displayMode]}</span
          >
          <span class="menu-shortcut">I</span>
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
            <span class="menu-shortcut">N</span>
          {/snippet}
        </DropdownMenu.CheckboxItem>
        <DropdownMenu.Item
          class="menu-item"
          onSelect={handleSelect(ontoggletheme)}
        >
          <span class="menu-label"
            >{theme === "dark" ? "Light" : "Dark"} Theme</span
          >
        </DropdownMenu.Item>
      </DropdownMenu.Group>
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>

<style>
  /* Menu trigger - icon-only, borderless, Beszel-style */
  /* Note: :global() required because bits-ui Trigger doesn't apply Svelte's scoped class hash */
  :global(.menu-trigger) {
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

  :global(.menu-trigger:hover) {
    background: var(--colour-surface-hover);
    color: var(--colour-text);
  }

  :global(.menu-trigger:focus-visible) {
    outline: none;
    box-shadow:
      0 0 0 2px var(--colour-bg),
      0 0 0 4px var(--colour-focus-ring);
  }

  :global(.menu-trigger[data-state="open"]) {
    background: var(--colour-surface-hover);
    color: var(--colour-text);
  }

  /*
   * Portal-rendered styles require :global() because DropdownMenu.Portal
   * renders content outside the component tree (in document.body).
   * Svelte's scoped styles won't apply without :global().
   */
  :global(.menu-content) {
    z-index: var(--z-dropdown, 100);
    min-width: 180px;
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

  /* Section headings */
  :global(.menu-heading) {
    padding: var(--space-1) var(--space-2);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    color: var(--colour-text-muted-inverse);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  /* Menu items */
  :global(.menu-item) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    padding: var(--space-2) var(--space-2);
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

  :global(.menu-item:focus-visible) {
    background-color: var(--colour-overlay-hover);
  }

  :global(.menu-item[data-disabled]) {
    opacity: 0.4;
    cursor: not-allowed;
  }

  :global(.menu-checkbox) {
    width: 16px;
    font-size: var(--font-size-sm);
    color: var(--colour-text-inverse);
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

  /* Separator */
  :global(.menu-separator) {
    height: 1px;
    margin: var(--space-2) 0;
    background-color: var(--colour-overlay-border);
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    :global(.menu-content) {
      animation: none;
    }
  }
</style>
