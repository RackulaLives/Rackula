/**
 * Popover component wrapper for Bits UI
 *
 * Provides headless popover primitives with built-in accessibility,
 * focus management, and floating positioning.
 *
 * @example
 * ```svelte
 * <script>
 *   import { Popover } from '$lib/components/ui/Popover';
 *   let open = $state(false);
 * </script>
 *
 * <Popover.Root bind:open>
 *   <Popover.Trigger>Open</Popover.Trigger>
 *   <Popover.Portal>
 *     <Popover.Content side="bottom" sideOffset={8}>
 *       Content here
 *     </Popover.Content>
 *   </Popover.Portal>
 * </Popover.Root>
 * ```
 */
export { Popover } from "bits-ui";
