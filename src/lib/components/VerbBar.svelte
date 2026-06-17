<!--
  VerbBar Component (#2075)

  A presentation-only floating toolbar that renders a row of icon verb buttons
  for the current selection. It does not position itself, read stores, or own
  layering: the overlay measures geometry, positions a container, and passes the
  ordered, already-enabled verbs plus a dispatch callback in as props.

  Accessibility: the toolbar uses a roving tabindex (one button in the tab order
  at a time) with ArrowLeft/ArrowRight wrapping and Home/End jumps. Each button
  is icon-only with an aria-label and title. Activation (click, Enter, Space) is
  handled natively by the buttons and forwarded through ondispatch.
-->
<script lang="ts">
  import type { ActionId } from "$lib/actions/registry";
  import { ICON_SIZE } from "$lib/constants/sizing";
  import { nextRovingIndex } from "$lib/utils/roving-index";
  import type { Component } from "svelte";
  import {
    IconChevronUp,
    IconChevronDown,
    IconChevronRight,
    IconCopy,
    IconDownloadBold,
    IconFitAllBold,
    IconFlip,
    IconTrash,
  } from "./icons";

  export interface VerbItem {
    id: ActionId;
    label: string;
  }

  interface Props {
    verbs: VerbItem[];
    ariaLabel: string;
    ondispatch: (id: ActionId) => void;
  }

  let { verbs, ariaLabel, ondispatch }: Props = $props();

  const iconForVerb: Partial<Record<ActionId, Component<{ size?: number }>>> = {
    "move-device-up": IconChevronUp,
    "move-device-down": IconChevronDown,
    "move-device-slot": IconChevronRight,
    "flip-device-face": IconFlip,
    "duplicate-selection": IconCopy,
    "delete-selection": IconTrash,
    "focus-rack": IconFitAllBold,
    "export-rack": IconDownloadBold,
  };

  // The active button is the only one in the tab order. It defaults to the
  // first button. Keydown moves it; the verb list changing can leave it stale,
  // so the rendered tabindex reads from a clamped derived value rather than
  // mutating state in an effect.
  let activeIndex = $state(0);
  let buttons = $state<HTMLButtonElement[]>([]);

  const clampedActiveIndex = $derived(
    verbs.length > 0 ? Math.min(activeIndex, verbs.length - 1) : 0,
  );

  function isDestructive(id: ActionId): boolean {
    return id === "delete-selection";
  }

  function handleKeydown(event: KeyboardEvent) {
    const next = nextRovingIndex(clampedActiveIndex, event.key, verbs.length);
    if (next === clampedActiveIndex) return;
    event.preventDefault();
    activeIndex = next;
    buttons[next]?.focus();
  }
</script>

{#if verbs.length > 0}
  <div
    class="verb-bar"
    role="toolbar"
    aria-label={ariaLabel}
    aria-orientation="horizontal"
    tabindex="-1"
    onkeydown={handleKeydown}
  >
    {#each verbs as verb, index (verb.id)}
      {@const Icon = iconForVerb[verb.id]}
      <button
        bind:this={buttons[index]}
        class="verb-button"
        class:destructive={isDestructive(verb.id)}
        type="button"
        aria-label={verb.label}
        title={verb.label}
        tabindex={index === clampedActiveIndex ? 0 : -1}
        onclick={() => ondispatch(verb.id)}
      >
        {#if Icon}
          <Icon size={ICON_SIZE.md} />
        {/if}
      </button>
    {/each}
  </div>
{/if}

<style>
  .verb-bar {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1);
    border-radius: var(--radius-full);
    border: 1px solid var(--verb-bar-border);
    /* Sheen gradient layered over the translucent body so the bar reads as a
       lens catching light, not frosted plastic. */
    background: var(--verb-bar-sheen), var(--verb-bar-bg);
    backdrop-filter: var(--verb-bar-backdrop);
    -webkit-backdrop-filter: var(--verb-bar-backdrop);
    /* Specular rim (inset light top edge + dark bottom) plus the floating
       drop shadow. */
    box-shadow: var(--verb-bar-rim), var(--shadow-lg);
  }

  /* Without backdrop-filter the translucent body has no blur to separate it
     from the canvas, so fall back to a near-solid background. */
  @supports not ((backdrop-filter: blur(1px)) or
    (-webkit-backdrop-filter: blur(1px))) {
    .verb-bar {
      background: var(--verb-bar-bg-solid);
    }
  }

  /* Fall back to a near-solid background when the user reduces transparency,
     so icon contrast stays legible without the backdrop blur. */
  @media (prefers-reduced-transparency: reduce) {
    .verb-bar {
      background: var(--verb-bar-bg-solid);
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
    }
  }

  .verb-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: var(--touch-target-min);
    min-height: var(--touch-target-min);
    width: var(--touch-target-min);
    height: var(--touch-target-min);
    padding: 0;
    border: none;
    border-radius: var(--radius-full);
    background: transparent;
    color: var(--colour-text);
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }

  .verb-button:hover {
    background: var(--colour-overlay-hover);
    color: var(--colour-primary);
  }

  .verb-button:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring-glow);
    color: var(--colour-primary);
  }

  .verb-button.destructive:hover,
  .verb-button.destructive:focus-visible {
    color: var(--colour-button-destructive);
  }

  @media (prefers-reduced-motion: no-preference) {
    .verb-button {
      transition:
        background-color var(--duration-fast) var(--ease-out),
        color var(--duration-fast) var(--ease-out),
        transform var(--duration-fast) var(--ease-out);
    }

    .verb-button:active {
      transform: scale(0.97);
    }
  }
</style>
