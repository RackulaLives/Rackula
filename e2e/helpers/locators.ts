/**
 * Centralised CSS selector strings for E2E tests.
 *
 * Every raw `.class-name` selector used in helpers and spec files should live
 * here so that a CSS class rename only requires a single-file change.
 *
 * NOTE: `page.evaluate()` callbacks that use `document.querySelector` are
 * intentionally excluded — those run in the browser context and cannot
 * reference this module.
 */
export const locators = {
  rack: {
    container: ".rack-container",
    svg: ".rack-svg",
    device: ".rack-device",
    deviceRect: ".rack-device .device-rect",
    deviceName: ".rack-device .device-name",
    deviceForeignObject: ".rack-device foreignObject",
    deviceText: ".rack-device text",
    deviceSelected: ".rack-device.selected",
    uLabel: ".u-label",
    item: ".rack-item",
  },

  rackView: {
    dualView: ".rack-dual-view",
    dualViewName: ".rack-dual-view-name",
    front: ".rack-front",
    rear: ".rack-rear",
    frontDevice: ".rack-front .rack-device",
    rearDevice: ".rack-rear .rack-device",
    frontDeviceSelected: ".rack-front .rack-device.selected",
    frontSvg: ".rack-front .rack-svg",
    rearSvg: ".rack-rear .rack-svg",
    rearBlockedSlot: ".rack-rear .blocked-slot",
  },

  device: {
    paletteItem: ".device-palette-item",
    palette: ".device-palette",
  },

  toolbar: {
    root: ".toolbar",
    center: ".toolbar-center",
    brand: ".toolbar-brand",
    brandLogoMark: ".toolbar-brand .logo-mark",
  },

  sidebar: {
    pane: ".sidebar-pane",
  },

  drawer: {
    rightOpen: "aside.drawer-right.open",
    /** Variant without the `aside` element prefix (used in some specs) */
    rightOpenBare: ".drawer-right.open",
    rightRackHeight: ".drawer-right #rack-height",
  },

  canvas: {
    root: ".canvas",
    panzoomContainer: ".panzoom-container",
  },

  dialog: {
    root: ".dialog",
    title: ".dialog-title",
  },

  toast: {
    root: ".toast",
    success: ".toast--success",
  },

  mobile: {
    bottomSheet: ".bottom-sheet",
    dragHandleBar: ".drag-handle-bar",
    backdrop: ".backdrop",
    deviceLibraryFab: ".device-library-fab",
  },

  editPanel: {
    displayNameButton: "button.display-name-display",
    displayNameInput: "input#device-display-name",
  },

  deviceDetail: {
    colourPickerContainer: ".colour-picker-container",
    displayNameText: ".display-name-text",
    colourInfo: ".colour-info",
    categoryIconIndicator: ".category-icon-indicator svg",
    imagePreview: ".image-upload img, .image-preview img",
    colourRowButton: "button.colour-row-btn",
    colourPickerInput: '.colour-picker-container input[type="text"]',
  },

  contextMenu: {
    content: ".context-menu-content",
  },
} as const;
