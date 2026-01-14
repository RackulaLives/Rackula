<!--
  MarkdownPreview Component
  Renders markdown text as formatted HTML with XSS protection.
  Supports inline formatting (bold, italic, code, links) and lists.
-->
<script lang="ts">
  import { parseMarkdown } from "$lib/utils/markdown";

  interface Props {
    /** The raw markdown text to render */
    content: string;
    /** Optional CSS class for the container */
    class?: string;
  }

  let { content, class: className = "" }: Props = $props();

  // Parse and sanitize markdown content
  const renderedHtml = $derived(parseMarkdown(content));
</script>

{#if renderedHtml}
  <div class="markdown-preview {className}">
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    {@html renderedHtml}
  </div>
{/if}

<style>
  .markdown-preview {
    font-size: var(--font-size-sm);
    line-height: 1.5;
    color: var(--colour-text);
    word-break: break-word;
  }

  /* Inline formatting */
  .markdown-preview :global(strong) {
    font-weight: 600;
  }

  .markdown-preview :global(em) {
    font-style: italic;
  }

  .markdown-preview :global(code) {
    font-family: var(--font-mono, monospace);
    font-size: 0.875em;
    padding: 0.125em 0.375em;
    background: var(--colour-surface-secondary);
    border-radius: var(--radius-xs);
  }

  /* Links */
  .markdown-preview :global(a) {
    color: var(--dracula-cyan);
    text-decoration: none;
  }

  .markdown-preview :global(a:hover) {
    text-decoration: underline;
  }

  /* Lists */
  .markdown-preview :global(ul),
  .markdown-preview :global(ol) {
    margin: 0.5em 0;
    padding-left: 1.5em;
  }

  .markdown-preview :global(li) {
    margin: 0.25em 0;
  }

  .markdown-preview :global(ul) {
    list-style-type: disc;
  }

  .markdown-preview :global(ol) {
    list-style-type: decimal;
  }

  /* Nested lists */
  .markdown-preview :global(ul ul),
  .markdown-preview :global(ol ol),
  .markdown-preview :global(ul ol),
  .markdown-preview :global(ol ul) {
    margin: 0.25em 0;
  }

  /* Paragraphs */
  .markdown-preview :global(p) {
    margin: 0.5em 0;
  }

  .markdown-preview :global(p:first-child) {
    margin-top: 0;
  }

  .markdown-preview :global(p:last-child) {
    margin-bottom: 0;
  }
</style>
