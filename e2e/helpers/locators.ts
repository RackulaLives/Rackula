/**
 * Centralised selector strings for E2E tests.
 *
 * Structural elements (canvas, racks, devices, drawers, dialogs, context menus,
 * toasts, mobile nav) are addressed by `data-testid` so a CSS class rename only
 * affects styling, not tests. Leaf elements, state modifiers (`.selected`,
 * `.open`), and variant classes (`.toast--success`) stay as class selectors
 * because they are not the structural anchors covered by testids.
 *
 * NOTE: `page.evaluate()` callbacks that use `document.querySelector` are
 * intentionally excluded — those run in the browser context and cannot
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

  device: {
    paletteItem: '[data-testid="device-palette-item"]',
    palette: ".device-palette",
  },

  toolbar: {
    root: ".toolbar",
    center: ".toolbar-center",
    brand: ".toolbar-brand",
    brandLogoMark: ".toolbar-brand .logo-mark",
  },

  sidebar: {
    pane: '[data-testid="drawer-left"]',
  },

  drawer: {
    rightOpen: 'aside[data-testid="drawer-device-edit"].open',
    /** Variant without the `aside` element prefix (used in some specs) */
    rightOpenBare: '[data-testid="drawer-device-edit"].open',
    rightRackHeight: '[data-testid="drawer-device-edit"] #rack-height',
  },

  canvas: {
    root: '[data-testid="rack-canvas"]',
    panzoomContainer: ".panzoom-container",
  },

  startScreen: {
    root: '[data-testid="start-screen"]',
  },

  dialog: {
    root: ".dialog",
    title: ".dialog-title",
    newRack: '[data-testid="dialog-new-rack"]',
  },

  toast: {
    root: '[data-testid="toast-message"]',
    success: ".toast--success",
    warning: ".toast--warning",
  },

  mobile: {
    bottomNav: '[data-testid="mobile-bottom-nav"]',
    bottomSheet: '[data-testid="mobile-bottom-sheet"]',
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
    content: '[data-testid="ctx-menu"]',
    item: '[data-testid="ctx-menu-item"]',
  },
} as const;
