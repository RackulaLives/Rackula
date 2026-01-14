/**
 * ContextMenu component wrapper for Bits UI
 *
 * Provides headless context menu primitives with built-in accessibility,
 * keyboard navigation, and proper positioning.
 *
 * @example
 * ```svelte
 * <script>
 *   import { ContextMenu } from '$lib/components/ui/ContextMenu';
 * </script>
 *
 * <ContextMenu.Root>
 *   <ContextMenu.Trigger>
 *     <div>Right-click me</div>
 *   </ContextMenu.Trigger>
 *   <ContextMenu.Portal>
 *     <ContextMenu.Content>
 *       <ContextMenu.Item onSelect={() => console.log('clicked')}>
 *         Menu Item
 *       </ContextMenu.Item>
 *       <ContextMenu.Separator />
 *       <ContextMenu.Item disabled>Disabled Item</ContextMenu.Item>
 *     </ContextMenu.Content>
 *   </ContextMenu.Portal>
 * </ContextMenu.Root>
 * ```
 */
export { ContextMenu } from "bits-ui";
