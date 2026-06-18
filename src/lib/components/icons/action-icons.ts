/**
 * Maps registry action ids to their icon components, so any surface that lists
 * actions (the app menu today; the command palette and verb bar can adopt it)
 * draws the same glyph for the same command. The registry stays a pure data and
 * functions module, so the icon components are bound here in the component layer
 * rather than on the action definitions themselves (#2406).
 *
 * The same precedent already lives in VerbBar's local iconForVerb map; this is
 * the shared, app-menu-facing version keyed by ActionId.
 */
import type { Component } from "svelte";
import type { ActionId } from "$lib/actions/registry";
import {
  IconDownloadBold,
  IconEdit,
  IconFileDownloadBold,
  IconFolderBold,
  IconGearBold,
  IconImageBold,
  IconPlusBold,
  IconQuestionBold,
  IconServerBold,
  IconShareBold,
  IconTextBold,
  IconUpload,
} from "./index";

/**
 * Icon per action. Partial because not every registered action is shown on an
 * icon-bearing surface; consumers fall back to no icon when an id is absent.
 */
export const iconForAction: Partial<
  Record<ActionId, Component<{ size?: number }>>
> = {
  // Layout lifecycle
  "new-layout": IconPlusBold,
  load: IconFolderBold,
  // File operations on the active layout
  "export-backup": IconFileDownloadBold,
  save: IconDownloadBold,
  "save-as": IconFileDownloadBold,
  export: IconImageBold,
  share: IconShareBold,
  "view-yaml": IconTextBold,
  // Device library
  "import-devices": IconUpload,
  "import-netbox": IconServerBold,
  "new-custom-device": IconEdit,
  // Help and settings
  "show-help": IconQuestionBold,
  settings: IconGearBold,
};
