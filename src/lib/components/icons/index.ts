// Icon components barrel export
//
// Icon Categories:
// - Brand: Custom brand-specific icons (logo, rack illustrations)
// - Iconoir: Standard UI icons (bundled inline SVG for CSP compliance)
// - Custom: App-specific composite icons

// =============================================================================
// Brand Icons
// =============================================================================

// Brand mark (not replaceable with standard icon library)
export { default as IconLogo } from "./IconLogo.svelte";

// Domain-specific rack illustrations for wizard layout type selection
export { default as ColumnRackIcon } from "./ColumnRackIcon.svelte";
export { default as BayedRackIcon } from "./BayedRackIcon.svelte";

// =============================================================================
// Custom Composite Icons
// =============================================================================

// Combined icon for "Both" display mode (image + label)
export { default as IconImageLabel } from "./IconImageLabel.svelte";

// =============================================================================
// Iconoir Icons (bundled inline SVG)
// =============================================================================

// Action icons
export { default as IconPlus } from "./IconPlus.svelte";
export { default as IconPlusIconoir } from "./IconPlusIconoir.svelte";
export { default as IconTrash } from "./IconTrash.svelte";
export { default as IconEdit } from "./IconEdit.svelte";
export { default as IconCopy } from "./IconCopy.svelte";
export { default as IconDownload } from "./IconDownload.svelte";
export { default as IconUpload } from "./IconUpload.svelte";
export { default as IconClose } from "./IconClose.svelte";

// Navigation icons
export { default as IconChevronUp } from "./IconChevronUp.svelte";
export { default as IconChevronDown } from "./IconChevronDown.svelte";

// Undo/Redo icons
export { default as IconUndo } from "./IconUndo.svelte";
export { default as IconRedo } from "./IconRedo.svelte";

// Display mode icons
export { default as IconImage } from "./IconImage.svelte";

// Canvas control icons
export { default as IconFitAll } from "./IconFitAll.svelte";
export { default as IconGrip } from "./IconGrip.svelte";
export { default as IconMobile } from "./IconMobile.svelte";

// Checkbox indicator icons
export { default as IconSquare } from "./IconSquare.svelte";
export { default as IconSquareFilled } from "./IconSquareFilled.svelte";
export { default as IconSquareMinus } from "./IconSquareMinus.svelte";

// HelpPanel icons
export { default as IconGitHub } from "./IconGitHub.svelte";
export { default as IconBug } from "./IconBug.svelte";
export { default as IconChat } from "./IconChat.svelte";
export { default as IconCheck } from "./IconCheck.svelte";

// Status icons
export { default as IconCloudOff } from "./IconCloudOff.svelte";

// =============================================================================
// Phosphor Bold Icons (for toolbar - higher visual weight)
// =============================================================================

export { default as IconPlusBold } from "./IconPlusBold.svelte";
export { default as IconUndoBold } from "./IconUndoBold.svelte";
export { default as IconRedoBold } from "./IconRedoBold.svelte";
export { default as IconTextBold } from "./IconTextBold.svelte";
export { default as IconImageBold } from "./IconImageBold.svelte";
export { default as IconFitAllBold } from "./IconFitAllBold.svelte";
export { default as IconFolderBold } from "./IconFolderBold.svelte";
export { default as IconGearBold } from "./IconGearBold.svelte";
export { default as IconSunBold } from "./IconSunBold.svelte";
export { default as IconMoonBold } from "./IconMoonBold.svelte";
export { default as IconDownloadBold } from "./IconDownloadBold.svelte";
export { default as IconShareBold } from "./IconShareBold.svelte";
