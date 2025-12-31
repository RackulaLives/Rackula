<!--
  DevicePalette Component
  Displays the device library with search and category grouping
  Uses exclusive accordion (only one section open at a time)
-->
<script lang="ts">
  import { Accordion } from "bits-ui";
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { getToastStore } from "$lib/stores/toast.svelte";
  import { getUIStore } from "$lib/stores/ui.svelte";
  import {
    searchDevices,
    groupDevicesByCategory,
    getCategoryDisplayName,
    sortDevicesByBrandThenModel,
    sortDevicesAlphabetically,
  } from "$lib/utils/deviceFilters";
  import {
    loadGroupingModeFromStorage,
    saveGroupingModeToStorage,
    type DeviceGroupingMode,
  } from "$lib/utils/deviceGrouping";
  import {
    SIDEBAR_WIDTHS,
    type SidebarWidthPreset,
  } from "$lib/utils/sidebarWidth";
  import { debounce } from "$lib/utils/debounce";
  import { truncateWithEllipsis } from "$lib/utils/searchHighlight";
  import { parseDeviceLibraryImport } from "$lib/utils/import";
  import { getBrandPacks, getBrandSlugs } from "$lib/data/brandPacks";
  import { getStarterLibrary, getStarterSlugs } from "$lib/data/starterLibrary";
  import { analytics } from "$lib/utils/analytics";
  import DevicePaletteItem from "./DevicePaletteItem.svelte";
  import BrandIcon from "./BrandIcon.svelte";
  import SegmentedControl from "./SegmentedControl.svelte";
  import type { DeviceType } from "$lib/types";

  interface Props {
    onadddevice?: () => void;
    onimportfromnetbox?: () => void;
    ondeviceselect?: (event: CustomEvent<{ device: DeviceType }>) => void;
  }

  let { onadddevice, onimportfromnetbox, ondeviceselect }: Props = $props();

  const uiStore = getUIStore();

  const layoutStore = getLayoutStore();
  const toastStore = getToastStore();

  // Search state with debouncing
  let searchQueryRaw = $state("");
  let searchQuery = $state("");
  const isSearchActive = $derived(searchQuery.trim().length > 0);

  // Grouping mode state with localStorage persistence
  let groupingMode = $state<DeviceGroupingMode>(loadGroupingModeFromStorage());

  // Grouping mode options for SegmentedControl
  const groupingModeOptions: { value: DeviceGroupingMode; label: string }[] = [
    { value: "brand", label: "Brand" },
    { value: "category", label: "Category" },
    { value: "flat", label: "A-Z" },
  ];

  function handleGroupingModeChange(newMode: DeviceGroupingMode) {
    groupingMode = newMode;
    saveGroupingModeToStorage(newMode);
  }

  // Width preset options for SegmentedControl
  const widthPresetOptions: { value: SidebarWidthPreset; label: string }[] = [
    { value: "compact", label: "S" },
    { value: "normal", label: "M" },
    { value: "wide", label: "L" },
  ];

  function handleWidthPresetChange(newPreset: SidebarWidthPreset) {
    uiStore.setSidebarWidth(newPreset);
  }

  function handleCollapseToggle() {
    uiStore.toggleSidebarCollapsed();
  }

  // Accordion mode and state tracking
  let accordionMode = $state<"single" | "multiple">("single");

  /**
   * Get the default accordion value (expanded section) based on grouping mode
   */
  function getDefaultAccordionValue(mode: DeviceGroupingMode): string {
    switch (mode) {
      case "brand":
        return "generic"; // Generic section expanded by default
      case "category":
        return "server"; // Server category expanded by default
      case "flat":
        return "all"; // Single "All Devices" section expanded
      default:
        return "generic";
    }
  }

  // Using single binding value that will hold either string or string[] based on mode
  // Initial value uses static default; $effect below syncs when groupingMode changes
  let accordionValue = $state<string | string[]>("generic");
  let preSearchState = $state<{
    mode: "single" | "multiple";
    value: string | string[];
  }>({
    mode: "single",
    value: "generic",
  });

  // Sync accordion value when grouping mode changes
  $effect(() => {
    // Reset accordion to default expanded section when mode changes
    const defaultValue = getDefaultAccordionValue(groupingMode);
    accordionValue = defaultValue;
    preSearchState = { mode: "single", value: defaultValue };
  });

  // Debounce search input
  const updateSearchQuery = debounce((value: string) => {
    searchQuery = value;
  }, 150);

  // File import ref
  let fileInputRef: HTMLInputElement;

  /**
   * Device section definition for collapsible groups
   */
  interface DeviceSection {
    id: string;
    title: string;
    devices: DeviceType[];
    defaultExpanded: boolean;
    /** simple-icons slug for brand logo */
    icon?: string;
    /** Number of devices matching search query */
    matchCount?: number;
    /** First matching device for preview */
    firstMatch?: DeviceType;
    /** True if section has no matches during search */
    isEmpty?: boolean;
  }

  // Get brand packs
  const brandPacks = getBrandPacks();

  // Merge starter library with layout device types for display
  // Starter library is always available; layout.device_types contains placed/custom devices
  // Custom devices with same slug as starter will shadow (replace) the starter version
  // Brand devices are excluded - they appear in their respective brand sections
  const allGenericDevices = $derived.by(() => {
    const starter = getStarterLibrary();
    const placed = layoutStore.device_types;
    const placedSlugs = new Set(placed.map((d) => d.slug));
    const starterSlugs = getStarterSlugs();
    const brandSlugs = getBrandSlugs();

    // Starter devices (excluding any shadowed by placed), then custom devices not in starter or brands
    return [
      ...starter.filter((d) => !placedSlugs.has(d.slug)),
      ...placed.filter((d) => starterSlugs.has(d.slug)), // Placed versions of starter devices
      ...placed.filter(
        (d) => !starterSlugs.has(d.slug) && !brandSlugs.has(d.slug),
      ), // Custom devices only
    ];
  });

  // Filter generic devices (merged starter + layout)
  const filteredGenericDevices = $derived(
    searchDevices(allGenericDevices, searchQuery),
  );
  const groupedGenericDevices = $derived(
    groupDevicesByCategory(filteredGenericDevices),
  );

  // Filter brand pack devices by search
  const filteredBrandPacks = $derived(
    brandPacks.map((pack) => ({
      ...pack,
      devices: searchDevices(pack.devices, searchQuery),
    })),
  );

  // Sort brand packs alphabetically (case-insensitive)
  const sortedBrandPacks = $derived(
    [...filteredBrandPacks].sort((a, b) =>
      a.title.toLowerCase().localeCompare(b.title.toLowerCase()),
    ),
  );

  // All devices combined (for category and flat modes)
  const allDevices = $derived([
    ...allGenericDevices,
    ...brandPacks.flatMap((p) => p.devices),
  ]);
  const filteredAllDevices = $derived(searchDevices(allDevices, searchQuery));

  // Category order for consistent display
  const categoryOrder: import("$lib/types").DeviceCategory[] = [
    "server",
    "network",
    "patch-panel",
    "power",
    "storage",
    "kvm",
    "av-media",
    "cooling",
    "shelf",
    "blank",
    "cable-management",
    "other",
  ];

  // Sections for brand mode (current behavior)
  const brandModeSections = $derived<DeviceSection[]>(
    [
      {
        id: "generic",
        title: "Generic",
        devices: filteredGenericDevices,
        defaultExpanded: true,
      },
      ...sortedBrandPacks,
    ].map((section) => {
      if (!isSearchActive) {
        return section;
      }

      // During search, compute match info
      const matchCount = section.devices.length;
      const firstMatch = section.devices[0] ?? null;
      const isEmpty = matchCount === 0;

      return {
        ...section,
        matchCount,
        firstMatch,
        isEmpty,
      };
    }),
  );

  // Sections for category mode
  const categoryModeSections = $derived.by<DeviceSection[]>(() => {
    const grouped = groupDevicesByCategory(filteredAllDevices);

    return categoryOrder
      .filter((cat) => grouped.has(cat))
      .map((cat) => {
        const devices = sortDevicesByBrandThenModel(grouped.get(cat) ?? []);
        const matchCount = devices.length;
        const firstMatch = devices[0] ?? null;
        const isEmpty = matchCount === 0;

        return {
          id: cat,
          title: getCategoryDisplayName(cat),
          devices,
          defaultExpanded: cat === "server",
          matchCount: isSearchActive ? matchCount : undefined,
          firstMatch: isSearchActive ? firstMatch : undefined,
          isEmpty: isSearchActive ? isEmpty : undefined,
        };
      });
  });

  // Sections for flat mode (single "All Devices" section)
  const flatModeSections = $derived.by<DeviceSection[]>(() => [
    {
      id: "all",
      title: "All Devices",
      devices: sortDevicesAlphabetically(filteredAllDevices),
      defaultExpanded: true,
      matchCount: isSearchActive ? filteredAllDevices.length : undefined,
      firstMatch: isSearchActive ? filteredAllDevices[0] : undefined,
      isEmpty: isSearchActive ? filteredAllDevices.length === 0 : undefined,
    },
  ]);

  // Select sections based on grouping mode
  const sections = $derived.by<DeviceSection[]>(() => {
    switch (groupingMode) {
      case "category":
        return categoryModeSections;
      case "flat":
        return flatModeSections;
      case "brand":
      default:
        return brandModeSections;
    }
  });

  // Check if any section has devices (filtered by search)
  const totalDevicesCount = $derived(
    sections.reduce((acc, s) => acc + s.devices.length, 0),
  );
  const hasDevices = $derived(
    allGenericDevices.length > 0 || brandPacks.length > 0,
  );
  const hasResults = $derived(totalDevicesCount > 0);

  // Reactive accordion mode switching based on search state
  $effect(() => {
    if (isSearchActive) {
      // Entering search: save current state and switch to multi-mode
      if (accordionMode === "single") {
        preSearchState = {
          mode: "single",
          value: accordionValue,
        };
      }
      accordionMode = "multiple";

      // Auto-expand all sections with matches
      const sectionsWithMatches = sections
        .filter((s) => !s.isEmpty && s.devices.length > 0)
        .map((s) => s.id);
      accordionValue = sectionsWithMatches;
    } else if (accordionMode === "multiple" && preSearchState) {
      // Exiting search: restore previous state but stay in multi-mode
      // (will switch back to single on user interaction)
      accordionValue = preSearchState.value;
    }
  });

  function handleAddDevice() {
    onadddevice?.();
  }

  function handleImportFromNetBox() {
    onimportfromnetbox?.();
  }

  function handleDeviceSelect(event: CustomEvent<{ device: DeviceType }>) {
    ondeviceselect?.(event);
  }

  function handleAccordionTriggerClick() {
    // When user manually clicks accordion after search, switch back to single mode
    if (accordionMode === "multiple" && !isSearchActive) {
      accordionMode = "single";
      // The clicked section will be set by the accordion component
    }
  }

  function handleImportClick() {
    fileInputRef?.click();
  }

  async function handleFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) return;

    try {
      const text = await file.text();

      // Get existing device slugs for duplicate detection
      const existingSlugs = layoutStore.device_types.map((d) => d.slug);

      // Parse and validate the import (returns DeviceType[])
      const result = parseDeviceLibraryImport(text, existingSlugs);

      // Add imported devices to library
      for (const deviceType of result.devices) {
        layoutStore.addDeviceTypeRaw(deviceType);
      }

      // Track successful import
      analytics.trackPaletteImport();

      // Show success toast
      const message =
        result.skipped > 0
          ? `Imported ${result.devices.length} devices (${result.skipped} skipped)`
          : `Imported ${result.devices.length} ${result.devices.length === 1 ? "device" : "devices"}`;

      toastStore.showToast(message, "success");
    } catch {
      toastStore.showToast("Failed to import device library", "error");
    } finally {
      // Reset file input
      input.value = "";
    }
  }
</script>

<div class="device-palette" class:collapsed={uiStore.sidebarCollapsed}>
  {#if uiStore.sidebarCollapsed}
    <!-- Collapsed view: show only expand button -->
    <div class="collapsed-view">
      <button
        class="collapse-toggle expand"
        type="button"
        onclick={handleCollapseToggle}
        aria-label="Expand device library"
        aria-expanded="false"
        title="Expand device library"
      >
        <span class="collapse-icon">→</span>
      </button>
      <span class="collapsed-label">Devices</span>
    </div>
  {:else}
    <!-- Expanded view: full controls -->
    <!-- Header with collapse toggle and width presets -->
    <div class="palette-header">
      <button
        class="collapse-toggle"
        type="button"
        onclick={handleCollapseToggle}
        aria-label="Collapse device library"
        aria-expanded="true"
        title="Collapse device library"
      >
        <span class="collapse-icon">←</span>
      </button>
      <SegmentedControl
        options={widthPresetOptions}
        value={uiStore.sidebarWidth}
        onchange={handleWidthPresetChange}
        ariaLabel="Panel width"
        size="small"
      />
    </div>
    <button
      class="netbox-import-button"
      type="button"
      onclick={handleImportFromNetBox}
      aria-label="Import from NetBox device type library"
      data-testid="btn-import-netbox"
    >
      Import from NetBox YAML
    </button>
  </div>
</div>

<style>
  .device-palette {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  /* Collapsed state */
  .device-palette.collapsed {
    align-items: center;
    padding-top: var(--space-2);
  }

  .collapsed-view {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2);
  }

  .collapsed-label {
    writing-mode: vertical-rl;
    text-orientation: mixed;
    transform: rotate(180deg);
    font-size: var(--font-size-sm);
    font-weight: 500;
    color: var(--colour-text-muted);
    letter-spacing: 0.05em;
  }

  /* Header with collapse toggle and width presets */
  .palette-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-2) 0;
  }

  .collapse-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    background: var(--colour-surface-secondary);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-sm);
    color: var(--colour-text);
    cursor: pointer;
    transition:
      background-color 150ms ease,
      border-color 150ms ease;
    flex-shrink: 0;
  }

  .collapse-toggle:hover {
    background: var(--colour-surface-hover);
    border-color: var(--colour-border-hover);
  }

  .collapse-toggle:focus-visible {
    outline: 2px solid var(--colour-selection);
    outline-offset: 1px;
  }

  .collapse-toggle.expand {
    width: 32px;
    height: 32px;
  }

  .collapse-icon {
    font-size: var(--font-size-sm);
    font-weight: bold;
    line-height: 1;
  }

  .search-container {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-2) var(--space-3);
  }

  .search-input {
    padding: var(--space-2) var(--space-3);
    font-size: var(--font-size-sm);
    color: var(--colour-text);
    background-color: var(--input-bg);
    border: 1px solid var(--input-border);
    border-radius: var(--radius-sm);
    outline: none;
    transition: border-color 0.15s ease;
  }

  .search-input::placeholder {
    color: var(--input-placeholder);
  }

  .search-input:focus {
    border-color: var(--colour-selection);
  }

  .device-list {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-2) 0;
  }

  /* Accordion Trigger Styling */
  :global(.accordion-trigger) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: calc(100% - var(--space-4));
    padding: var(--space-2) var(--space-3);
    font-size: var(--font-size-sm);
    font-weight: 600;
    text-align: left;
    background: var(--colour-surface-secondary);
    border: none;
    border-radius: var(--radius-sm);
    margin: var(--space-1) var(--space-2);
    cursor: pointer;
    color: var(--colour-text);
    transition:
      background-color 150ms ease,
      color 150ms ease;
  }

  :global(.accordion-trigger:hover) {
    background: var(--colour-surface-hover);
  }

  :global(.accordion-trigger:focus-visible) {
    outline: 2px solid var(--colour-selection);
    outline-offset: -2px;
  }

  :global(.accordion-trigger[data-state="open"]) {
    background: var(--colour-surface-active);
  }

  :global(.accordion-trigger.has-no-matches) {
    opacity: 0.5;
    color: var(--colour-text-muted);
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex: 1;
  }

  .section-title {
    flex: 1;
  }

  .section-count {
    margin-left: var(--space-2);
    font-weight: 400;
    color: var(--colour-text-muted);
  }

  .match-info {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    margin-left: var(--space-2);
  }

  .match-count {
    font-weight: 400;
    color: var(--colour-text-muted);
  }

  .match-preview {
    font-style: italic;
    font-weight: 400;
    color: var(--colour-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 200px;
  }

  /* Accordion Content Styling with CSS Grid animation */
  :global(.accordion-content) {
    display: grid;
    grid-template-rows: 0fr;
    transition: grid-template-rows 200ms ease-out;
    overflow: hidden;
  }

  :global(.accordion-content[data-state="open"]) {
    grid-template-rows: 1fr;
  }

  :global(.accordion-content[data-state="closed"]) {
    grid-template-rows: 0fr;
  }

  :global(.accordion-content-inner) {
    min-height: 0;
    overflow: hidden;
  }

  /* Reduced motion support */
  @media (prefers-reduced-motion: reduce) {
    :global(.accordion-content) {
      transition: none;
    }
  }

  .category-group {
    margin-bottom: var(--space-2);
  }

  .category-header {
    margin: 0;
    padding: var(--space-2) var(--space-3) 4px;
    font-size: var(--font-size-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--colour-text-muted);
  }

  .category-devices {
    display: flex;
    flex-direction: column;
  }

  .section-devices {
    display: flex;
    flex-direction: column;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-6);
    text-align: center;
  }

  .empty-message {
    margin: 0;
    font-size: var(--font-size-base);
    color: var(--colour-text);
  }

  .empty-hint {
    margin: 4px 0 0;
    font-size: var(--font-size-sm);
    color: var(--colour-text-muted);
  }

  .actions {
    padding: var(--space-3);
  }

  .actions-row {
    display: flex;
    gap: var(--space-2);
  }

  .import-button,
  .add-device-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-1-5);
    flex: 1;
    padding: 10px var(--space-3);
    font-size: var(--font-size-sm);
    font-weight: 500;
    color: var(--colour-text);
    background-color: var(--button-bg);
    border: 1px solid var(--button-border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition:
      background-color 0.15s ease,
      transform 0.1s ease;
  }

  .import-button:hover,
  .add-device-button:hover {
    background-color: var(--button-bg-hover);
  }

  .import-button:active,
  .add-device-button:active {
    transform: scale(0.98);
  }

  .import-button:focus,
  .add-device-button:focus {
    outline: 2px solid var(--colour-selection);
    outline-offset: 2px;
  }

  .import-icon,
  .add-icon {
    font-size: var(--font-size-base);
    font-weight: bold;
  }

  .netbox-import-button {
    width: 100%;
    padding: var(--space-2) var(--space-3);
    margin-top: var(--space-2);
    font-size: var(--font-size-xs);
    color: var(--colour-text-muted);
    background: transparent;
    border: 1px dashed var(--button-border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition:
      color 0.15s ease,
      border-color 0.15s ease;
  }

  .netbox-import-button:hover {
    color: var(--colour-text);
    border-color: var(--colour-text);
  }

  .netbox-import-button:focus {
    outline: 2px solid var(--colour-selection);
    outline-offset: 2px;
  }
</style>
