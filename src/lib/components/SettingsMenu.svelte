<!--
  SettingsMenu Component
  Dropdown for settings: Theme, Annotations, Banana for Scale
  Uses bits-ui DropdownMenu with Iconoir settings trigger
-->
<script lang="ts">
  import { DropdownMenu } from "bits-ui";
  import {
    IconGearBold,
    IconSquare,
    IconSquareFilled,
    IconSunBold,
    IconMoonBold,
  } from "./icons";
  import { ICON_SIZE } from "$lib/constants/sizing";
  import "$lib/styles/menu.css";

  interface Props {
    theme?: "dark" | "light";
    showAnnotations?: boolean;
    showBanana?: boolean;
    warnOnUnsavedChanges?: boolean;
    ontoggletheme?: () => void;
    ontoggleannotations?: () => void;
    ontogglebanana?: () => void;
    ontogglewarnunsaved?: () => void;
  }

  let {
    theme = "dark",
    showAnnotations = false,
    showBanana = false,
    warnOnUnsavedChanges = true,
    ontoggletheme,
    ontoggleannotations,
    ontogglebanana,
    ontogglewarnunsaved,
  }: Props = $props();

  let open = $state(false);

  function handleSelect(action?: () => void) {
    return () => {
      action?.();
      open = false;
    };
  }
</script>

<DropdownMenu.Root bind:open>
  <DropdownMenu.Trigger class="toolbar-icon-btn" aria-label="Settings menu">
    <IconGearBold size={ICON_SIZE.md} />
  </DropdownMenu.Trigger>

  <DropdownMenu.Portal>
    <DropdownMenu.Content
      class="menu-content menu-inline"
      sideOffset={4}
      align="end"
    >
      <DropdownMenu.Item
        class="menu-item"
        onSelect={handleSelect(ontoggletheme)}
      >
        <span class="menu-icon">
          {#if theme === "dark"}
            <IconSunBold size={ICON_SIZE.sm} />
          {:else}
            <IconMoonBold size={ICON_SIZE.sm} />
          {/if}
        </span>
        <span class="menu-label"
          >{theme === "dark" ? "Light" : "Dark"} Theme</span
        >
      </DropdownMenu.Item>

      <DropdownMenu.CheckboxItem
        class="menu-item"
        checked={showAnnotations}
        onCheckedChange={handleSelect(ontoggleannotations)}
      >
        {#snippet children({ checked })}
          <span class="menu-checkbox">
            {#if checked}
              <IconSquareFilled size={ICON_SIZE.sm} />
            {:else}
              <IconSquare size={ICON_SIZE.sm} />
            {/if}
          </span>
          <span class="menu-label">Show Annotations</span>
        {/snippet}
      </DropdownMenu.CheckboxItem>

      <DropdownMenu.CheckboxItem
        class="menu-item"
        checked={showBanana}
        onCheckedChange={handleSelect(ontogglebanana)}
      >
        {#snippet children({ checked })}
          <span class="menu-checkbox">
            {#if checked}
              <IconSquareFilled size={ICON_SIZE.sm} />
            {:else}
              <IconSquare size={ICON_SIZE.sm} />
            {/if}
          </span>
          <span class="menu-label">Banana for Scale</span>
        {/snippet}
      </DropdownMenu.CheckboxItem>

      <DropdownMenu.Separator class="menu-separator" />

      <DropdownMenu.CheckboxItem
        class="menu-item"
        checked={warnOnUnsavedChanges}
        onCheckedChange={handleSelect(ontogglewarnunsaved)}
      >
        {#snippet children({ checked })}
          <span class="menu-checkbox">
            {#if checked}
              <IconSquareFilled size={ICON_SIZE.sm} />
            {:else}
              <IconSquare size={ICON_SIZE.sm} />
            {/if}
          </span>
          <span class="menu-label">Warn on Unsaved Changes</span>
        {/snippet}
      </DropdownMenu.CheckboxItem>
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>
