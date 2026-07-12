<!--
  DevicePalette Component
  Displays the device library with search and category grouping
  Uses exclusive accordion (only one section open at a time)
-->
<script lang="ts">
  import { Accordion } from "bits-ui";
  import { SvelteSet } from "svelte/reactivity";
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { getToastStore } from "$lib/stores/toast.svelte";
  import {
    searchDevices,
    groupDevicesByCategory,
    groupDevicesByCategoryOrdered,
    getCategoryDisplayName,
    sortDevicesByBrandThenModel,
    sortDevicesAlphabetically,
    filterPaletteDevicesByRackWidth,
    filterDevicesByAttributes,
    isDeviceCompatibleWithRackWidth,
    getRackWidthIncompatibilityReason,
    categoryOrder,
    type DeviceAttributeFilters,
  } from "$lib/utils/deviceFilters";
  import {
    loadGroupingModeFromStorage,
    saveGroupingModeToStorage,
    type DeviceGroupingMode,
  } from "$lib/utils/deviceGrouping";
  import {
    loadFavouritesFromStorage,
    saveFavouritesToStorage,
    toggleFavourite,
  } from "$lib/utils/deviceFavourites";
  import { getUIStore } from "$lib/stores/ui.svelte";
  import { debounce } from "$lib/utils/debounce";
  import { truncateWithEllipsis } from "$lib/utils/searchHighlight";
  import { getBrandPacks, getBrandSlugs } from "$lib/data/brandPacks";
  import { getStarterLibrary, getStarterSlugs } from "$lib/data/starterLibrary";
  import DevicePaletteItem from "./DevicePaletteItem.svelte";
  import VirtualList from "./VirtualList.svelte";
  import BrandIcon from "./BrandIcon.svelte";
  import SegmentedControl from "./SegmentedControl.svelte";
  import DeviceFilterPopover from "./DeviceFilterPopover.svelte";
  import IconPin from "./icons/IconPin.svelte";
  import { ICON_SIZE } from "$lib/constants/sizing";
  import type { DeviceType } from "$lib/types";

  interface Props {
    ondeviceselect?: (event: CustomEvent<{ device: DeviceType }>) => void;
    oncreatedevice?: () => void;
  }

  let { ondeviceselect, oncreatedevice }: Props = $props();

  // Estimated palette row height in pixels, used by the virtualized lists.
  // Rows are a flex line with var(--touch-target-min) min-height (48px) plus
  // vertical padding; 48 keeps the windowing math close enough for overscan.
  const ROW_HEIGHT = 48;
  // Below this row count a section renders as plain DOM so the accordion's
  // height animation and the generic section's category sub-grouping stay
  // intact. Long lists (big brand packs, A-Z mode) switch to windowing.
  const VIRTUALIZE_THRESHOLD = 30;
  // Cap the windowed viewport so a long section scrolls within itself rather
  // than stretching the whole palette to thousands of pixels.
  const VIRTUAL_VIEWPORT_MAX = 480;

  const layoutStore = getLayoutStore();
  const toastStore = getToastStore();
  const uiStore = getUIStore();

  // Search state with debouncing
  let searchQueryRaw = $state("");
  let searchQuery = $state("");
  const isSearchActive = $derived(searchQuery.trim().length > 0);

  // Attribute filter state, session-only (no persistence; resets on reload).
  // SvelteSet keeps mutations to the height bucket set reactive.
  let attributeFilters = $state<DeviceAttributeFilters>({
    heights: new SvelteSet(),
    halfWidth: false,
    fullWidth: false,
    hasImage: false,
    customOnly: false,
  });

  // Custom detection injected into the attribute predicate.
  const isCustomDevice = (slug: string) => layoutStore.isCustomDeviceType(slug);

  const hasActiveAttributeFilters = $derived(
    attributeFilters.heights.size > 0 ||
      attributeFilters.halfWidth !== attributeFilters.fullWidth ||
      attributeFilters.hasImage ||
      attributeFilters.customOnly,
  );

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

  // Favourites (pinned device slugs) with localStorage persistence.
  // Insertion order drives the pinned section order.
  let favouriteSlugs = $state<Set<string>>(loadFavouritesFromStorage());

  function isFavourite(slug: string): boolean {
    return favouriteSlugs.has(slug);
  }

  function handleToggleFavourite(event: CustomEvent<{ device: DeviceType }>) {
    favouriteSlugs = toggleFavourite(favouriteSlugs, event.detail.device.slug);
    saveFavouritesToStorage(favouriteSlugs);
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

  // Keep single/multiple values separate to satisfy bits-ui's discriminated prop types.
  let accordionSingleValue = $state("generic");
  let accordionMultipleValue = $state<string[]>(["generic"]);
  let preSearchSingleValue = $state("generic");

  // Sync accordion value when grouping mode changes
  $effect(() => {
    // Reset accordion to default expanded section when mode changes
    const defaultValue = getDefaultAccordionValue(groupingMode);
    accordionSingleValue = defaultValue;
    accordionMultipleValue = [defaultValue];
    preSearchSingleValue = defaultValue;
    accordionMode = "single";
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

  // Get active rack width for filtering (defaults to 19" standard if no active rack)
  const activeRackWidth = $derived(layoutStore.activeRack?.width ?? 19);

  // Get unused custom device type slugs for showing delete buttons
  // This is reactive and updates when devices are placed/removed
  const unusedCustomDeviceSlugs = $derived.by(() => {
    const unused = layoutStore.getUnusedCustomDeviceTypes();
    return new Set(unused.map((d) => d.slug));
  });

  /**
   * Check if a device type can be deleted (is an unused custom type)
   */
  function canDeleteDevice(device: DeviceType): boolean {
    return unusedCustomDeviceSlugs.has(device.slug);
  }

  // Batch delete state for grouping rapid successive deletes
  // Using $state for HMR compatibility and proper reactivity
  let pendingDeletes = $state<DeviceType[]>([]);
  let pendingToastId = $state<string | null>(null);
  let batchTimeout = $state<ReturnType<typeof setTimeout> | null>(null);
  const BATCH_DELAY = 500; // ms to wait before showing toast

  /**
   * Show batch toast for pending deletes
   */
  function showBatchToast() {
    if (pendingDeletes.length === 0) return;

    const deletedTypes = [...pendingDeletes];
    pendingDeletes = [];

    // Dismiss any existing pending toast
    if (pendingToastId) {
      toastStore.dismissToast(pendingToastId);
      pendingToastId = null;
    }

    const firstDeleted = deletedTypes[0];
    const singleDeleteMessage =
      deletedTypes.length === 1 && firstDeleted
        ? `Deleted "${firstDeleted.model ?? firstDeleted.slug}"`
        : null;
    const message =
      singleDeleteMessage ?? `Deleted ${deletedTypes.length} device types`;

    const actionLabel = deletedTypes.length === 1 ? "Undo" : "Undo All";

    // Capture current toast ID for race condition check
    const thisToastId = toastStore.showToast(message, "info", 5000, {
      label: actionLabel,
      onClick: () => {
        // Undo: call undo() for each deleted device type to maintain history consistency
        // This properly removes the delete actions from history
        for (let i = 0; i < deletedTypes.length; i++) {
          layoutStore.undo();
        }
        pendingToastId = null;
      },
    });
    pendingToastId = thisToastId;

    // Clear toast ID after it auto-dismisses, with race condition check
    setTimeout(() => {
      // Only clear if this is still the active toast (wasn't manually dismissed or replaced)
      if (pendingToastId === thisToastId) {
        pendingToastId = null;
      }
    }, 5500);
  }

  /**
   * Handle device type deletion with toast undo support
   * Groups rapid successive deletes into a batch toast
   */
  function handleDeviceDelete(event: CustomEvent<{ device: DeviceType }>) {
    const device = event.detail.device;

    // Store the device type for potential undo
    const deletedDeviceType = { ...device };
    pendingDeletes.push(deletedDeviceType);

    // Delete the device type (each delete is recorded for Ctrl+Z undo)
    layoutStore.deleteDeviceTypeRecorded(device.slug);

    // Reset batch timer - wait for more potential deletes
    if (batchTimeout) {
      clearTimeout(batchTimeout);
      batchTimeout = null;
    }
    batchTimeout = setTimeout(showBatchToast, BATCH_DELAY);
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

  // Filter and search generic devices - only show devices compatible with active rack
  const allPaletteDevices = $derived([
    ...allGenericDevices,
    ...brandPacks.flatMap((pack) => pack.devices),
  ]);
  const deviceCompatibilityBySlug = $derived.by(() => {
    const compatibility: Record<
      string,
      { isCompatible: boolean; incompatibilityReason: string | null }
    > = {};

    for (const device of allPaletteDevices) {
      const compatible = isDeviceCompatibleWithRackWidth(
        device,
        activeRackWidth,
      );
      compatibility[device.slug] = {
        isCompatible: compatible,
        incompatibilityReason: compatible
          ? null
          : getRackWidthIncompatibilityReason(device, activeRackWidth),
      };
    }

    return compatibility;
  });

  const visibleGenericDevices = $derived(
    filterDevicesByAttributes(
      filterPaletteDevicesByRackWidth(
        allGenericDevices,
        activeRackWidth,
        uiStore.compatibleOnly,
      ),
      attributeFilters,
      isCustomDevice,
    ),
  );
  const filteredGenericDevices = $derived(
    searchDevices(visibleGenericDevices, searchQuery),
  );
  // Ordered [category, devices] entries (#2723). While browsing, categories
  // follow categoryOrder and devices sort A-Z within each. During a search,
  // preserve the Fuse relevance order (insertion order) within each category so
  // the generic section stays relevance-ranked like the brand sections.
  const groupedGenericDevices = $derived(
    isSearchActive
      ? [...groupDevicesByCategory(filteredGenericDevices).entries()]
      : groupDevicesByCategoryOrdered(filteredGenericDevices),
  );

  // Filter and search brand pack devices - only show compatible devices
  const filteredBrandPacks = $derived(
    brandPacks.map((pack) => ({
      ...pack,
      devices: searchDevices(
        filterDevicesByAttributes(
          filterPaletteDevicesByRackWidth(
            pack.devices,
            activeRackWidth,
            uiStore.compatibleOnly,
          ),
          attributeFilters,
          isCustomDevice,
        ),
        searchQuery,
      ),
    })),
  );

  // Brand packs arrive A-Z by title from getBrandPacks(); filteredBrandPacks is
  // a map that preserves that order, so no render-time re-sort is needed (#2723).

  // All devices combined (for category and flat modes) - filtered by rack width
  const allDevicesCombined = $derived(
    filterDevicesByAttributes(
      filterPaletteDevicesByRackWidth(
        allPaletteDevices,
        activeRackWidth,
        uiStore.compatibleOnly,
      ),
      attributeFilters,
      isCustomDevice,
    ),
  );
  const filteredAllDevices = $derived(
    searchDevices(allDevicesCombined, searchQuery),
  );

  // Flat A-Z mode renders a single windowed section. Unlike grouped views,
  // where many sections share the panel under the VIRTUAL_VIEWPORT_MAX cap,
  // this lone section should grow to fill the panel and scroll within itself.
  // Gate the fill on the virtualized path: short, search-filtered results stay
  // on the plain-DOM branch and keep their natural height + the list scroll.
  const flatFill = $derived(
    groupingMode === "flat" && filteredAllDevices.length > VIRTUALIZE_THRESHOLD,
  );

  // Pinned devices: resolve favourite slugs against the same width/compat/search
  // filtered pool the rest of the palette uses, preserving favourite order.
  // Collect only the matching devices (favourites are few) rather than indexing
  // the whole pool, so the search hot path stays cheap.
  const pinnedDevices = $derived.by<DeviceType[]>(() => {
    if (favouriteSlugs.size === 0) return [];
    const matches: Record<string, DeviceType> = {};
    for (const device of filteredAllDevices) {
      if (favouriteSlugs.has(device.slug)) matches[device.slug] = device;
    }
    const result: DeviceType[] = [];
    for (const slug of favouriteSlugs) {
      const device = matches[slug];
      if (device) result.push(device);
    }
    return result;
  });

  // Sections for brand mode - filter out empty sections (no compatible devices)
  const brandModeSections = $derived<DeviceSection[]>(
    [
      {
        id: "generic",
        title: "Generic",
        devices: filteredGenericDevices,
        defaultExpanded: true,
      },
      ...filteredBrandPacks,
    ]
      .filter((section) => section.devices.length > 0)
      .map((section) => {
        if (!isSearchActive) {
          return section;
        }

        // During search, compute match info
        const matchCount = section.devices.length;
        const firstMatch = section.devices[0];
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
        const firstMatch = devices[0];
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
        preSearchSingleValue = accordionSingleValue;
      }
      accordionMode = "multiple";

      // Auto-expand all sections with matches
      const sectionsWithMatches = sections
        .filter((s) => !s.isEmpty && s.devices.length > 0)
        .map((s) => s.id);
      accordionMultipleValue = sectionsWithMatches;
    } else if (accordionMode === "multiple") {
      // Exiting search: restore previous state but stay in multi-mode
      // (will switch back to single on user interaction)
      accordionMultipleValue = [preSearchSingleValue];
    }
  });

  function handleDeviceSelect(event: CustomEvent<{ device: DeviceType }>) {
    ondeviceselect?.(event);
  }

  function handleAccordionTriggerClick() {
    // When user manually clicks accordion after search, switch back to single mode
    if (accordionMode === "multiple" && !isSearchActive) {
      accordionMode = "single";
      accordionSingleValue = accordionMultipleValue[0] ?? preSearchSingleValue;
      // The clicked section will be set by the accordion component
    }
  }

  function isSectionExpanded(sectionId: string): boolean {
    if (accordionMode === "multiple") {
      return accordionMultipleValue.includes(sectionId);
    }
    return accordionSingleValue === sectionId;
  }

  function isCompatible(device: DeviceType): boolean {
    return deviceCompatibilityBySlug[device.slug]?.isCompatible ?? true;
  }

  function incompatibilityReason(device: DeviceType): string | null {
    return (
      deviceCompatibilityBySlug[device.slug]?.incompatibilityReason ?? null
    );
  }
</script>

<div class="device-palette">
  <a href="#rack-canvas" class="skip-to-canvas-link">Skip to canvas</a>

  <!-- Grouping Mode and Search -->
  <div class="search-container">
    <div class="grouping-toggle">
      <SegmentedControl
        options={groupingModeOptions}
        value={groupingMode}
        onchange={handleGroupingModeChange}
        ariaLabel="Grouping mode"
      />
    </div>
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
      <DeviceFilterPopover bind:filters={attributeFilters} />
    </div>
  </div>

  <!-- Search outcome for screen readers. The visual list filters live, but
       AT users need the result announced; polite so it never interrupts
       typing. Text settles at most once per debounce (150ms). -->
  <div class="sr-only" role="status" data-testid="palette-search-announcer">
    {#if isSearchActive}
      {hasResults
        ? `${totalDevicesCount} ${totalDevicesCount === 1 ? "device" : "devices"} found`
        : "No devices match"}
    {/if}
  </div>

  <!-- Device List -->
  <div class="device-list" class:fill-flat={flatFill}>
    {#snippet deviceRow(device: DeviceType, index = 0)}
      <DevicePaletteItem
        {device}
        tabindex={index === 0 ? 0 : -1}
        searchQuery={isSearchActive ? searchQuery : ""}
        isCompatible={isCompatible(device)}
        incompatibilityReason={incompatibilityReason(device)}
        canDelete={canDeleteDevice(device)}
        isFavourite={isFavourite(device.slug)}
        onselect={handleDeviceSelect}
        ondelete={handleDeviceDelete}
        ontogglefavourite={handleToggleFavourite}
      />
    {/snippet}

    <!-- Flat device list: windowed when long, plain DOM when short, so the
         accordion height animation survives for small sections. -->
    {#snippet deviceList(devices: DeviceType[], label: string, fill = false)}
      {#if devices.length > VIRTUALIZE_THRESHOLD}
        <div
          class="virtual-section"
          class:fill
          style:height={fill
            ? null
            : `${Math.min(devices.length * ROW_HEIGHT, VIRTUAL_VIEWPORT_MAX)}px`}
        >
          <VirtualList
            items={devices}
            itemHeight={ROW_HEIGHT}
            key={(device) => device.slug}
            ariaLabel={label}
          >
            {#snippet row(device, index)}
              {@render deviceRow(device, index)}
            {/snippet}
          </VirtualList>
        </div>
      {:else}
        <div class="section-devices" role="list" aria-label={label}>
          {#each devices as device, index (device.slug)}
            {@render deviceRow(device, index)}
          {/each}
        </div>
      {/if}
    {/snippet}

    {#if !hasDevices}
      <div class="empty-state">
        <p class="empty-message">No devices in library</p>
        <p class="empty-hint">Add a device to get started</p>
      </div>
    {:else if !hasResults}
      <div class="empty-state">
        <p class="empty-message">
          {#if isSearchActive && hasActiveAttributeFilters}
            No devices match your search and filters
          {:else if hasActiveAttributeFilters}
            No devices match your filters
          {:else}
            No devices match your search
          {/if}
        </p>
      </div>
    {:else}
      {#if pinnedDevices.length > 0}
        <section class="pinned-section" aria-label="Pinned devices">
          <h3 class="pinned-header">
            <IconPin size={ICON_SIZE.sm} filled />
            <span>Pinned</span>
            <span class="section-count">({pinnedDevices.length})</span>
          </h3>
          {@render deviceList(pinnedDevices, "Pinned devices")}
        </section>
      {/if}

      {#snippet accordionSections()}
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
                    {#if section.firstMatch && !isSectionExpanded(section.id)}
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
            <Accordion.Content
              class="accordion-content"
              data-testid="accordion-content-{section.id}"
              inert={!isSectionExpanded(section.id)}
            >
              <div class="accordion-content-inner">
                {#if section.id === "generic" && groupingMode === "brand"}
                  <!-- Generic section uses category grouping (brand mode only) -->
                  {#each groupedGenericDevices as [category, devices] (category)}
                    {#if !isSearchActive || devices.length > 0}
                      <div class="category-group">
                        <h3 class="category-header">
                          {getCategoryDisplayName(category)}
                        </h3>
                        {@render deviceList(
                          devices,
                          getCategoryDisplayName(category),
                        )}
                      </div>
                    {/if}
                  {/each}
                {:else}
                  <!-- All other sections show devices in a flat list. In flat
                       A-Z mode the lone section fills the panel (see flatFill). -->
                  {@render deviceList(section.devices, section.title, flatFill)}
                {/if}
              </div>
            </Accordion.Content>
          </Accordion.Item>
        {/each}
      {/snippet}

      {#if accordionMode === "multiple"}
        <Accordion.Root
          type="multiple"
          bind:value={accordionMultipleValue}
          class="device-accordion"
        >
          {@render accordionSections()}
        </Accordion.Root>
      {:else}
        <Accordion.Root
          type="single"
          bind:value={accordionSingleValue}
          class="device-accordion"
        >
          {@render accordionSections()}
        </Accordion.Root>
      {/if}
    {/if}
  </div>

  {#if oncreatedevice}
    <div class="palette-footer">
      <button
        type="button"
        class="add-device-btn"
        onclick={oncreatedevice}
        data-testid="btn-create-custom-device"
      >
        <span class="add-device-glyph" aria-hidden="true">+</span>
        Add custom device
      </button>
    </div>
  {/if}
</div>

<style>
  .device-palette {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  /* Skip-to-canvas link (#2998): visually hidden until focused, so a keyboard
     user can jump forward-Tab from the very start of the palette straight to
     the canvas instead of traversing every section trigger and device row. */
  .skip-to-canvas-link {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .skip-to-canvas-link:focus-visible {
    position: fixed;
    top: var(--space-2);
    left: var(--space-2);
    z-index: var(--z-tooltip, 400);
    width: auto;
    height: auto;
    padding: var(--space-2) var(--space-3);
    margin: 0;
    overflow: visible;
    clip: auto;
    white-space: normal;
    background: var(--colour-surface);
    color: var(--colour-text);
    border: 1px solid var(--colour-selection);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-sm);
    font-weight: 600;
    box-shadow: var(--shadow-lg);
  }

  .search-container {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-2) var(--space-3);
  }

  /* The Brand/Category/A-Z grouping toggle is sized to 44px here (the device
     palette's own touch-target standard, #2397), without changing the shared
     SegmentedControl used elsewhere in the app. */
  .grouping-toggle :global(.segment) {
    min-height: 44px;
  }

  .search-row {
    display: flex;
    gap: var(--space-2);
    align-items: center;
  }

  .search-input {
    flex: 1;
    /* 44px control height, matching the tab rows and the touch standard (#2397). */
    height: 44px;
    padding: 0 var(--space-3);
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

  /* Footer pinned below the scrolling device list: .device-list takes the
     remaining height (flex: 1), so this block sits flush at the panel bottom.
     A top border separates it from the list as it scrolls. */
  .palette-footer {
    flex-shrink: 0;
    padding: var(--space-2);
    border-top: 1px solid var(--colour-border);
  }

  /* Neutral form-control vocabulary shared with the edit panel's colour swatch
     and name-edit controls (#2524): input-bg fill, input-border, selection
     border on hover and focus. 44px height keeps the touch standard (#2397). */
  .add-device-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    width: 100%;
    min-height: 44px;
    padding: 0 var(--space-3);
    font-size: var(--font-size-sm);
    font-weight: 600;
    line-height: 1;
    color: var(--colour-text-muted);
    background: var(--input-bg);
    border: 1px solid var(--input-border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition:
      background-color var(--duration-fast) ease,
      color var(--duration-fast) ease,
      border-color var(--duration-fast) ease;
  }

  .add-device-glyph {
    font-size: var(--font-size-lg);
    font-weight: 400;
  }

  .add-device-btn:hover {
    color: var(--colour-text);
    border-color: var(--colour-selection);
  }

  .add-device-btn:focus-visible {
    outline: 2px solid var(--colour-selection);
    outline-offset: 2px;
  }

  .add-device-btn:active {
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

  .section-devices {
    display: flex;
    flex-direction: column;
  }

  /* Windowed section: fixed height so VirtualList can scroll within it. */
  .virtual-section {
    overflow: hidden;
  }

  /* Flat A-Z fill (#2698): the lone windowed section grows to fill the panel
     and scrolls within itself, instead of being pinned to VIRTUAL_VIEWPORT_MAX.
     A flex chain runs device-list -> accordion -> item -> open content -> inner
     -> section so the section resolves a definite fill height, and VirtualList's
     max-height: 100% then drives the internal scroll. Scoped to .fill-flat so
     grouped views (Brand/Category) keep the fixed per-section cap. */
  .device-list.fill-flat {
    display: flex;
    flex-direction: column;
  }

  /* Pinned favourites sit at the top and the accordion fills the rest. Cap the
     pinned strip so a long favourites list can never starve the A-Z library to
     zero height (it scrolls within itself past the cap); the accordion always
     keeps the majority of the panel. */
  .device-list.fill-flat > .pinned-section {
    flex: 0 1 auto;
    min-height: 0;
    max-height: 45%;
    overflow-y: auto;
  }

  .device-list.fill-flat :global(.device-accordion) {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
  }

  /* Fill only the open section, so a manually-collapsed A-Z section shrinks back
     to its header height instead of an open item holding the full panel. */
  .device-list.fill-flat
    :global(.device-accordion .accordion-item[data-state="open"]) {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
  }

  /* Only the open section fills; gating on [data-state="open"] lets a closed
     one still collapse via the grid 0fr rule (see transition note below). */
  .device-list.fill-flat
    :global(.device-accordion .accordion-content[data-state="open"]) {
    flex: 1;
    min-height: 0;
  }

  .device-list.fill-flat :global(.accordion-content-inner) {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .virtual-section.fill {
    flex: 1;
    min-height: 0;
  }

  /* In fill mode the open section is flex-sized, so the grid-row slide no longer
     tracks the box (flex refills the freed space and the box snaps at the end).
     Collapse instantly instead; the sole A-Z section is open by default, so the
     only transition this drops is the rare manual collapse/expand. */
  .device-list.fill-flat :global(.accordion-content) {
    transition: none;
  }

  .pinned-section {
    margin: var(--space-1) var(--space-2) var(--space-3);
    padding-bottom: var(--space-2);
    border-bottom: 1px solid var(--colour-border);
  }

  .pinned-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin: 0;
    padding: var(--space-2) var(--space-3) var(--space-1);
    font-size: var(--font-size-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--colour-text-muted);
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
