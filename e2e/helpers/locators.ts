/**
 * Centralised selector strings for E2E tests.
 *
 * Structural elements (canvas, racks, devices, drawers, dialogs, context menus,
 * toasts, mobile nav) are addressed by `data-testid` so a CSS class rename only
 * affects styling, not tests. Leaf elements, state modifiers (`.selected`,
 * `.open`), and variant classes (`.toast--success`) stay as class selectors
 * because they are not the structural anchors covered by testids.
 *
 * Interactive, user-facing controls (buttons, inputs, dialogs) are NOT listed
 * here. They are reached with role/label locators (`getByRole`, `getByLabel`)
 * at the call site, which doubles as an accessibility check and survives DOM
 * restructuring. This registry holds only string selectors passed to
 * `page.locator()`.
 *
 * NOTE: `page.evaluate()` callbacks that use `document.querySelector` are
 * intentionally excluded - those run in the browser context and cannot
 * reference this module.
 */
export const locators = {
  rack: {
    container: ".rack-container",
    svg: ".rack-svg",
    device: '[data-testid="rack-device"]',
    deviceRect: '[data-testid="rack-device"] .device-rect',
    deviceName: '[data-testid="rack-device"] .device-name',
    deviceForeignObject: '[data-testid="rack-device"] foreignObject',
    deviceText: '[data-testid="rack-device"] text',
    deviceSelected: '[data-testid="rack-device"].selected',
    dropZone: '[data-testid="rack-drop-zone"]',
    uLabel: ".u-label",
    item: ".rack-item",
  },

  rackView: {
    dualView: ".rack-dual-view",
    dualViewName: ".rack-dual-view-name",
    front: '[data-testid="rack-front"]',
    rear: '[data-testid="rack-rear"]',
    frontDevice: '[data-testid="rack-front"] [data-testid="rack-device"]',
    rearDevice: '[data-testid="rack-rear"] [data-testid="rack-device"]',
    frontDeviceSelected:
      '[data-testid="rack-front"] [data-testid="rack-device"].selected',
    frontSvg: '[data-testid="rack-front"] .rack-svg',
    rearSvg: '[data-testid="rack-rear"] .rack-svg',
    rearBlockedSlot: '[data-testid="rack-rear"] .blocked-slot',
  },

  bayGroup: {
    // The group wrapper itself is reached by role/name at the call site
    // (role="group", accessible name "N bays"). This registry holds only the
    // structural leaf used to count members.
    /** Front-row member rack SVGs of a bayed group, one per bay. */
    frontMemberSvg: ".front-row .rack-svg",
  },

  device: {
    paletteItem: '[data-testid="device-palette-item"]',
    paletteItemName: '[data-testid="device-palette-item"] .device-name',
    palette: ".device-palette",
    /** Scrolling device-list region inside the palette. */
    list: ".device-list",
    /** "Add custom device" footer pinned below the list. */
    paletteFooter: ".palette-footer",
    /** A windowed (virtualized) accordion section's outer box. */
    virtualSection: ".virtual-section",
    /** VirtualList's internal scroll viewport. */
    virtualList: ".virtual-list",
    /** A grouping accordion section's item wrapper (carries data-state). */
    accordionItem: ".accordion-item",
  },

  toolbar: {
    root: ".toolbar",
    // The unified logo + search pill is the single top-left control (#2776). It
    // opens the command palette and carries the brand mark, so the palette
    // trigger testid doubles as the brand anchor.
    brand: '[data-testid="btn-command-palette"]',
    brandLogoMark: '[data-testid="btn-command-palette"] .logo-mark',
  },

  sidebar: {
    pane: '[data-testid="drawer-left"]',
    /** Collapse chevron in the Layouts/Racks/Devices tab row (#2397). */
    collapse: '[data-testid="sidebar-collapse"]',
    /** Reopen button on the collapsed left strip (#2397). */
    expand: '[data-testid="panel-collapsed-strip-left"]',
  },

  sidePanel: {
    root: '[data-testid="side-panel"]',
    /** Edit tabpanel (hosts the contextual properties for the selection). */
    editPanel: '[data-testid="side-panel-panel-edit"]',
    /** Empty-state prompt shown in the Edit tab when nothing is selected. */
    editEmpty: '[data-testid="side-panel-edit-empty"]',
    tabEdit: '[data-testid="side-panel-tab-edit"]',
    tabView: '[data-testid="side-panel-tab-view"]',
    /** Collapse chevron in the Edit/View tab row (#2397). */
    collapse: '[data-testid="side-panel-collapse"]',
    /** Reopen button on the collapsed right strip (#2397). */
    expand: '[data-testid="panel-collapsed-strip-right"]',
  },

  canvas: {
    root: '[data-testid="rack-canvas"]',
    panzoomContainer: ".panzoom-container",
  },

  welcomeScreen: {
    root: '[data-testid="welcome-screen"]',
  },

  dialog: {
    root: ".dialog",
    title: ".dialog-title",
  },

  toast: {
    root: '[data-testid="toast-message"]',
    success: ".toast--success",
    warning: ".toast--warning",
  },

  mobile: {
    bottomNav: '[data-testid="mobile-bottom-nav"]',
    // The unified Dialog primitive (#2092) renders as a bottom sheet below the
    // mobile breakpoint: a .dialog--sheet element over the shared .dialog-backdrop.
    bottomSheet: ".dialog--sheet",
    dragHandleBar: ".dialog-drag-handle",
    backdrop: ".dialog-backdrop",
    deviceLibraryFab: ".device-library-fab",
  },

  deviceDetail: {
    colourPickerContainer: ".colour-picker-container",
    displayNameText: ".display-name-text",
    colourInfo: ".colour-value",
    categoryIconIndicator: ".category-icon-indicator svg",
    imagePreview: ".image-upload img, .image-preview img",
    colourRowButton: "button.colour-swatch-btn",
    colourPickerInput: '.colour-picker-container input[type="text"]',
  },

  contextMenu: {
    content: '[data-testid="ctx-menu"]',
    item: '[data-testid="ctx-menu-item"]',
  },

  /**
   * Regions whose text changes between builds or over time. Used as
   * toHaveScreenshot() masks in the visual-regression suite. These are leaf
   * spans with no role of their own, so they stay as class selectors here.
   */
  dynamic: {
    version: ".version",
    layoutMeta: ".layout-meta",
  },
} as const;
