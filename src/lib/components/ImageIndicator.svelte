<!--
	ImageIndicator Component
	Shows device image availability with a camera icon
	Left half = front image, Right half = rear image
-->
<script lang="ts">
  interface Props {
    front?: boolean;
    rear?: boolean;
    size?: number;
  }

  let { front = false, rear = false, size = 14 }: Props = $props();

  // Don't render if no images available
  const hasImages = $derived(front || rear);

  // Determine fill states
  const leftFill = $derived(front ? "currentColor" : "none");
  const rightFill = $derived(rear ? "currentColor" : "none");

  // Title for accessibility
  const title = $derived(
    front && rear
      ? "Front and rear images available"
      : front
        ? "Front image available"
        : "Rear image available",
  );
</script>

{#if hasImages}
  <span class="image-indicator" aria-hidden="true">
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <title>{title}</title>
      <!-- Camera body outline -->
      <rect
        x="1"
        y="4"
        width="14"
        height="10"
        rx="2"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
      />
      <!-- Viewfinder bump -->
      <rect
        x="5"
        y="2"
        width="6"
        height="3"
        rx="1"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
      />
      <!-- Left half fill (front) -->
      <rect
        class="indicator-left"
        x="2"
        y="5"
        width="6"
        height="8"
        rx="1"
        fill={leftFill}
      />
      <!-- Right half fill (rear) -->
      <rect
        class="indicator-right"
        x="8"
        y="5"
        width="6"
        height="8"
        rx="1"
        fill={rightFill}
      />
    </svg>
  </span>
{/if}

<style>
  .image-indicator {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--colour-text-muted);
    flex-shrink: 0;
  }
</style>
