/**
 * Accordion component wrapper for Bits UI
 *
 * Uses type="single" for exclusive accordion behavior (only one section open at a time).
 * Provides all Bits UI Accordion primitives for flexible composition.
 *
 * @example
 * ```svelte
 * <script>
 *   import { Accordion } from '$lib/components/ui/Accordion';
 * </script>
 *
 * <Accordion.Root type="single" value="section-1">
 *   <Accordion.Item value="section-1">
 *     <Accordion.Header>
 *       <Accordion.Trigger>Section 1</Accordion.Trigger>
 *     </Accordion.Header>
 *     <Accordion.Content>
 *       Content here
 *     </Accordion.Content>
 *   </Accordion.Item>
 * </Accordion.Root>
 * ```
 */
export { Accordion } from "bits-ui";
