<!--
  DevicePalette Component
  Displays the device library with search and category grouping
  Uses exclusive accordion (only one section open at a time)
-->
<script lang="ts">
  import { Accordion } from "bits-ui";
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import {
    searchDevices,
    groupDevicesByCategory,
    getCategoryDisplayName,
    sortDevicesByBrandThenModel,
    sortDevicesAlphabetically,
    isDeviceCompatibleWithRackWidth,
  } from "$lib/utils/deviceFilters";
  import {
    loadGroupingModeFromStorage,
    saveGroupingModeToStorage,
    type DeviceGroupingMode,
  } from "$lib/utils/deviceGrouping";
  import { debounce } from "$lib/utils/debounce";
  import { truncateWithEllipsis } from "$lib/utils/searchHighlight";
  import { getBrandPacks, getBrandSlugs } from "$lib/data/brandPacks";
  import { getStarterLibrary, getStarterSlugs } from "$lib/data/starterLibrary";
  import DevicePaletteItem from "./DevicePaletteItem.svelte";
  import BrandIcon from "./BrandIcon.svelte";
  import SegmentedControl from "./SegmentedControl.svelte";
  import Tooltip from "./Tooltip.svelte";
  import { ICON_SIZE } from "$lib/constants/sizing";
  import type { DeviceType } from "$lib/types";

  interface Props {
    ondeviceselect?: (event: CustomEvent<{ device: DeviceType }>) => void;
    oncreatedevice?: () => void;
  }

  let { ondeviceselect, oncreatedevice }: Props = $props();

  const layoutStore = getLayoutStore();

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

  // Get active rack width for compatibility check (defaults to 19" standard if no active rack)
  // Uses minimum-width logic: devices fit if rack width >= device width
  const activeRackWidth = $derived(layoutStore.activeRack?.width ?? 19);

  /**
   * Check if a device is compatible with the current active rack width.
   */
  function checkDeviceCompatibility(device: DeviceType): boolean {
    return isDeviceCompatibleWithRackWidth(device, activeRackWidth);
  }

  /**
   * Generate tooltip text explaining why a device is incompatible with the current rack.
   * Returns empty string if the device is compatible.
   */
  function getIncompatibilityReason(device: DeviceType): string {
    if (checkDeviceCompatibility(device)) {
      return "";
    }
    const deviceWidths = device.rack_widths?.length ? device.rack_widths : [19];
    const minWidth = Math.min(...deviceWidths);
    return `Requires ${minWidth}" rack (current: ${activeRackWidth}")`;
  }

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

  // Search generic devices (merged starter + layout) - no longer filtering by rack width
  // Compatibility is now shown visually instead of hiding devices
  const filteredGenericDevices = $derived(
    searchDevices(allGenericDevices, searchQuery),
  );
  const groupedGenericDevices = $derived(
    groupDevicesByCategory(filteredGenericDevices),
  );

  // Search brand pack devices - no longer filtering by rack width
  // Compatibility is now shown visually instead of hiding devices
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

  // All devices combined (for category and flat modes) - no longer filtering by rack width
  // Compatibility is now shown visually instead of hiding devices
  const allDevicesCombined = $derived([
    ...allGenericDevices,
    ...brandPacks.flatMap((p) => p.devices),
  ]);
  const filteredAllDevices = $derived(
    searchDevices(allDevicesCombined, searchQuery),
  );

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
</script>

<div class="device-palette">
  <!-- Grouping Mode and Search -->
  <div class="search-container">
    <SegmentedControl
      options={groupingModeOptions}
      value={groupingMode}
      onchange={handleGroupingModeChange}
      ariaLabel="Grouping mode"
    />
    <div class="search-row">
      <input
        type="search"
        class="search-input"
        placeholder="Search devices..."
        bind:value={searchQueryRaw}
        oninput={() => updateSearchQuery(searchQueryRaw)}
        aria-label="Search devices"
        data-testid="search-devices"
      />
      {#if oncreatedevice}
        <Tooltip text="Create custom device" position="bottom">
          <button
            type="button"
            class="create-device-btn"
            onclick={oncreatedevice}
            aria-label="Create custom device"
            data-testid="btn-create-custom-device"
          >
            +
          </button>
        </Tooltip>
      {/if}
    </div>
  </div>

  <!-- Device List -->
  <div class="device-list">
    {#if !hasDevices}
      <div class="empty-state">
        <p class="empty-message">No devices in library</p>
        <p class="empty-hint">Add a device to get started</p>
      </div>
    {:else if !hasResults}
      <div class="empty-state">
        <p class="empty-message">No devices match your search</p>
      </div>
    {:else}
      <Accordion.Root type={accordionMode} bind:value={accordionValue}>
        {#each sections as section (section.id)}
          <Accordion.Item value={section.id} class="accordion-item">
            <Accordion.Header>
              <Accordion.Trigger
                class="accordion-trigger{section.isEmpty
                  ? ' has-no-matches'
                  : ''}"
                onclick={handleAccordionTriggerClick}
              >
                <span class="section-header">
                  {#if section.icon || section.id === "apc"}
                    <BrandIcon slug={section.icon} size={ICON_SIZE.sm} />
                  {/if}
                  <span class="section-title">{section.title}</span>
                </span>

                {#if isSearchActive && section.matchCount !== undefined}
                  <span class="match-info">
                    <span class="match-count">({section.matchCount})</span>
                    {#if section.firstMatch && Array.isArray(accordionValue) && !accordionValue.includes(section.id)}
                      <span class="match-preview">
                        -
                        {truncateWithEllipsis(
                          section.firstMatch.model ?? section.firstMatch.slug,
                          30,
                        )}
                      </span>
                    {/if}
                  </span>
                {:else}
                  <span class="section-count">({section.devices.length})</span>
                {/if}
              </Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Content class="accordion-content">
              <div class="accordion-content-inner">
                {#if section.id === "generic" && groupingMode === "brand"}
                  <!-- Generic section uses category grouping (brand mode only) -->
                  {#each [...groupedGenericDevices.entries()] as [category, devices] (category)}
                    {#if !isSearchActive || devices.length > 0}
                      <div class="category-group">
                        <h3 class="category-header">
                          {getCategoryDisplayName(category)}
                        </h3>
                        <div class="category-devices">
                          {#each devices as device (device.slug)}
                            <DevicePaletteItem
                              {device}
                              searchQuery={isSearchActive ? searchQuery : ""}
                              isCompatible={checkDeviceCompatibility(device)}
                              incompatibilityReason={getIncompatibilityReason(
                                device,
                              )}
                              onselect={handleDeviceSelect}
                            />
                          {/each}
                        </div>
                      </div>
                    {/if}
                  {/each}
                {:else}
                  <!-- All other sections show devices in a flat list -->
                  <div class="section-devices">
                    {#each section.devices as device (device.slug)}
                      <DevicePaletteItem
                        {device}
                        searchQuery={isSearchActive ? searchQuery : ""}
                        isCompatible={checkDeviceCompatibility(device)}
                        incompatibilityReason={getIncompatibilityReason(device)}
                        onselect={handleDeviceSelect}
                      />
                    {/each}
                  </div>
                {/if}
              </div>
            </Accordion.Content>
          </Accordion.Item>
        {/each}
      </Accordion.Root>
    {/if}
  </div>
</div>

<style>
  .device-palette {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .search-container {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-2) var(--space-3);
  }

  .search-row {
    display: flex;
    gap: var(--space-2);
    align-items: center;
  }

  .search-input {
    flex: 1;
    padding: var(--space-2) var(--space-3);
    font-size: var(--font-size-sm);
    color: var(--colour-text);
    background-color: var(--input-bg);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-sm);
    outline: none;
    transition:
      border-color var(--duration-fast) ease,
      box-shadow var(--duration-fast) ease;
  }

  .create-device-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--space-8);
    height: var(--space-8);
    padding: 0;
    font-size: var(--font-size-lg);
    font-weight: 400;
    line-height: 1;
    color: var(--colour-text-muted);
    background: var(--colour-surface-secondary);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition:
      background-color var(--duration-fast) ease,
      color var(--duration-fast) ease,
      border-color var(--duration-fast) ease;
  }

  .create-device-btn:hover {
    color: var(--colour-text);
    background: var(--colour-surface-hover);
    border-color: var(--colour-border-hover);
  }

  .create-device-btn:focus-visible {
    outline: 2px solid var(--colour-selection);
    outline-offset: 2px;
  }

  .create-device-btn:active {
    background: var(--colour-surface-active);
  }

  .search-input::placeholder {
    color: var(--colour-text-muted);
  }

  .search-input:focus {
    border-color: var(--colour-selection);
    box-shadow: var(--glow-pink-sm);
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
    padding: var(--space-2) var(--space-3) var(--space-1);
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
    margin: var(--space-1) 0 0;
    font-size: var(--font-size-sm);
    color: var(--colour-text-muted);
  }
</style>
