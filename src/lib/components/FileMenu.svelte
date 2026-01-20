<!--
  FileMenu Component
  Dropdown for file operations: Save, Load, Export, Share, Import Devices
  Uses bits-ui DropdownMenu with Iconoir folder trigger
-->
<script lang="ts">
  import { DropdownMenu } from "bits-ui";
  import { IconFolderBold } from "./icons";
  import { ICON_SIZE } from "$lib/constants/sizing";
  import { formatShortcut } from "$lib/utils/platform";
  import "$lib/styles/menu.css";

  interface Props {
    onsave?: () => void;
    onload?: () => void;
    onexport?: () => void;
    onshare?: () => void;
    onimportdevices?: () => void;
    onimportnetbox?: () => void;
    onnewcustomdevice?: () => void;
    hasRacks?: boolean;
  }

  let {
    onsave,
    onload,
    onexport,
    onshare,
    onimportdevices,
    onimportnetbox,
    onnewcustomdevice,
    hasRacks = false,
  }: Props = $props();

  let open = $state(false);

  // Platform-aware shortcuts (Cmd on Mac, Ctrl on Windows/Linux)
  const shortcuts = {
    save: formatShortcut("mod", "S"),
    load: formatShortcut("mod", "O"),
    export: formatShortcut("mod", "E"),
    share: formatShortcut("mod", "H"),
  };

  function handleSelect(action?: () => void) {
    return () => {
      action?.();
      open = false;
    };
  }
</script>

<DropdownMenu.Root bind:open>
  <DropdownMenu.Trigger class="toolbar-icon-btn" aria-label="File menu">
    <IconFolderBold size={ICON_SIZE.md} />
  </DropdownMenu.Trigger>

  <DropdownMenu.Portal>
    <DropdownMenu.Content
      class="menu-content menu-inline"
      sideOffset={4}
      align="end"
    >
      <DropdownMenu.Item class="menu-item" onSelect={handleSelect(onsave)}>
        <span class="menu-label">Save</span>
        <span class="menu-shortcut">{shortcuts.save}</span>
      </DropdownMenu.Item>
      <DropdownMenu.Item class="menu-item" onSelect={handleSelect(onload)}>
        <span class="menu-label">Load</span>
        <span class="menu-shortcut">{shortcuts.load}</span>
      </DropdownMenu.Item>
      <DropdownMenu.Item class="menu-item" onSelect={handleSelect(onexport)}>
        <span class="menu-label">Export</span>
        <span class="menu-shortcut">{shortcuts.export}</span>
      </DropdownMenu.Item>
      <DropdownMenu.Item
        class="menu-item"
        disabled={!hasRacks}
        onSelect={handleSelect(onshare)}
      >
        <span class="menu-label">Share</span>
        <span class="menu-shortcut">{shortcuts.share}</span>
      </DropdownMenu.Item>
      <DropdownMenu.Separator class="menu-separator" />
      <DropdownMenu.Item
        class="menu-item"
        onSelect={handleSelect(onimportdevices)}
      >
        <span class="menu-label">Import Devices</span>
      </DropdownMenu.Item>
      <DropdownMenu.Item
        class="menu-item"
        onSelect={handleSelect(onimportnetbox)}
      >
        <span class="menu-label">Import from NetBox</span>
      </DropdownMenu.Item>
      <DropdownMenu.Item
        class="menu-item"
        onSelect={handleSelect(onnewcustomdevice)}
      >
        <span class="menu-label">New Custom Device</span>
      </DropdownMenu.Item>
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>
