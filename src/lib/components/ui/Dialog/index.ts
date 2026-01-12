/**
 * Dialog component wrapper for Bits UI
 *
 * Provides headless dialog primitives with built-in accessibility,
 * focus management, and keyboard navigation.
 *
 * @example
 * ```svelte
 * <script>
 *   import { Dialog } from '$lib/components/ui/Dialog';
 *   let open = $state(false);
 * </script>
 *
 * <Dialog.Root bind:open>
 *   <Dialog.Trigger>Open</Dialog.Trigger>
 *   <Dialog.Portal>
 *     <Dialog.Overlay />
 *     <Dialog.Content>
 *       <Dialog.Title>Title</Dialog.Title>
 *       <Dialog.Description>Description</Dialog.Description>
 *       <Dialog.Close>Close</Dialog.Close>
 *     </Dialog.Content>
 *   </Dialog.Portal>
 * </Dialog.Root>
 * ```
 */
export { Dialog } from "bits-ui";
