/**
 * Tabs component wrapper for Bits UI
 *
 * Provides headless tab primitives with built-in accessibility,
 * focus management, and keyboard navigation.
 *
 * @example
 * ```svelte
 * <script>
 *   import { Tabs } from '$lib/components/ui/Tabs';
 *   let value = $state('devices');
 * </script>
 *
 * <Tabs.Root bind:value>
 *   <Tabs.List>
 *     <Tabs.Trigger value="devices">Devices</Tabs.Trigger>
 *     <Tabs.Trigger value="racks">Racks</Tabs.Trigger>
 *   </Tabs.List>
 *   <Tabs.Content value="devices">Devices content</Tabs.Content>
 *   <Tabs.Content value="racks">Racks content</Tabs.Content>
 * </Tabs.Root>
 * ```
 */
export { Tabs } from "bits-ui";
