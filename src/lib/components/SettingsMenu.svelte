<!--
  SettingsMenu Component
  Dropdown for settings: Theme, Annotations, Banana for Scale
  Uses bits-ui DropdownMenu with Iconoir settings trigger
-->
<script lang="ts">
  import { DropdownMenu } from "bits-ui";
  import Icon from "@iconify/svelte";
  import "$lib/styles/menu.css";

  interface Props {
    theme?: "dark" | "light";
    showAnnotations?: boolean;
    showBanana?: boolean;
    ontoggletheme?: () => void;
    ontoggleannotations?: () => void;
    ontogglebanana?: () => void;
  }

  let {
    theme = "dark",
    showAnnotations = false,
    showBanana = false,
    ontoggletheme,
    ontoggleannotations,
    ontogglebanana,
  }: Props = $props();

  let open = $state(false);
</script>

<DropdownMenu.Root bind:open>
  <DropdownMenu.Trigger class="toolbar-icon-btn" aria-label="Settings menu">
    <Icon icon="ph:gear-bold" />
  </DropdownMenu.Trigger>

  <DropdownMenu.Content
    class="menu-content menu-inline"
    sideOffset={4}
    align="end"
  >
    <DropdownMenu.Item
      class="menu-item"
      onSelect={() => {
        ontoggletheme?.();
        open = false;
      }}
    >
      <span class="menu-label">{theme === "dark" ? "Light" : "Dark"} Theme</span
      >
    </DropdownMenu.Item>

    <DropdownMenu.CheckboxItem
      class="menu-item"
      checked={showAnnotations}
      onCheckedChange={() => {
        ontoggleannotations?.();
        open = false;
      }}
    >
      {#snippet children({ checked })}
        <span class="menu-checkbox">{checked ? "✓" : ""}</span>
        <span class="menu-label">Show Annotations</span>
      {/snippet}
    </DropdownMenu.CheckboxItem>

    <DropdownMenu.CheckboxItem
      class="menu-item"
      checked={showBanana}
      onCheckedChange={() => {
        ontogglebanana?.();
        open = false;
      }}
    >
      {#snippet children({ checked })}
        <span class="menu-checkbox">{checked ? "✓" : ""}</span>
        <span class="menu-label">Banana for Scale</span>
      {/snippet}
    </DropdownMenu.CheckboxItem>
  </DropdownMenu.Content>
</DropdownMenu.Root>
