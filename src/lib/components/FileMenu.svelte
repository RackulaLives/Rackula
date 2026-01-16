<!--
  FileMenu Component
  Dropdown for file operations: Save, Load, Export, Share
  Uses bits-ui DropdownMenu with Iconoir folder trigger
-->
<script lang="ts">
  import { DropdownMenu } from "bits-ui";
  import { IconFolderBold } from "./icons";
  import { formatShortcut } from "$lib/utils/platform";
  import "$lib/styles/menu.css";

  interface Props {
    onsave?: () => void;
    onload?: () => void;
    onexport?: () => void;
    onshare?: () => void;
    hasRacks?: boolean;
  }

  let { onsave, onload, onexport, onshare, hasRacks = false }: Props = $props();

  let open = $state(false);

  // Platform-aware shortcuts (Cmd on Mac, Ctrl on Windows/Linux)
  const shortcuts = {
    save: formatShortcut("mod", "S"),
    load: formatShortcut("mod", "O"),
    export: formatShortcut("mod", "E"),
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
    <IconFolderBold size={20} />
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
      </DropdownMenu.Item>
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>
