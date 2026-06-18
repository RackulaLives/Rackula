<script lang="ts">
  import { Accordion } from "$lib/components/ui/Accordion/index.js";

  interface Section {
    id: string;
    title: string;
    content: string;
  }

  interface Props {
    sections: Section[];
    defaultValue?: string;
  }

  let { sections, defaultValue = "" }: Props = $props();
</script>

<div class="accordion-wrapper">
  <Accordion.Root type="single" value={defaultValue}>
    {#each sections as section (section.id)}
      <Accordion.Item value={section.id} class="accordion-item">
        <Accordion.Header>
          <Accordion.Trigger class="accordion-trigger"
            >{section.title}</Accordion.Trigger
          >
        </Accordion.Header>
        <Accordion.Content class="accordion-content">
          <div class="accordion-content-inner">{section.content}</div>
        </Accordion.Content>
      </Accordion.Item>
    {/each}
  </Accordion.Root>
</div>

<style>
  .accordion-wrapper {
    width: 100%;
  }

  /* Trigger styling */
  :global(.accordion-trigger) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: var(--space-2, 0.5rem) var(--space-3, 0.75rem);
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 500;
    text-align: left;
    background: var(--colour-surface-secondary, #1e1e1e);
    border: none;
    border-bottom: 1px solid var(--colour-border, #333);
    cursor: pointer;
    color: var(--colour-text-primary, #fff);
    transition:
      background-color 150ms ease,
      color 150ms ease;
  }

  :global(.accordion-trigger:hover) {
    background: var(--colour-surface-hover, #2a2a2a);
  }

  :global(.accordion-trigger:focus-visible) {
    outline: 2px solid var(--colour-accent, #4a90d9);
    outline-offset: -2px;
  }

  :global(.accordion-trigger[data-state="open"]) {
    background: var(--colour-surface-active, #252525);
  }

  /* Content styling with CSS Grid animation */
  :global(.accordion-content) {
    display: grid;
    grid-template-rows: 0fr;
    transition: grid-template-rows 200ms ease-out;
    overflow: hidden;
  }

  :global(.accordion-content[data-state="open"]) {
    grid-template-rows: 1fr;
  }

  :global(.accordion-content[data-state="closed"]) {
    grid-template-rows: 0fr;
  }

  :global(.accordion-content-inner) {
    min-height: 0;
    padding: var(--space-2, 0.5rem) var(--space-3, 0.75rem);
    background: var(--colour-surface-primary, #1a1a1a);
  }

  /* Reduced motion support */
  @media (prefers-reduced-motion: reduce) {
    :global(.accordion-content) {
      transition: none;
    }
  }
</style>
