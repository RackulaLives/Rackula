# Research Spike #2020: Command Palette (Ctrl+K) - External Findings

Browser-based Svelte 5 rack-layout app (canvas, direct-manipulation, client-side + server build).
Research date: 2026-06-13. All claims web-sourced; see Key Sources.

## Invocation & Browser Interception

The single most important verified fact: **Ctrl+K / Cmd+K is interceptable in practice, but NOT 100% reliably on every browser, and the failure mode is real.**

- `Ctrl+K` is a hardcoded address-bar shortcut in Chrome, Edge, and Firefox ("search the web from the address bar"). `Cmd+K` is similar on macOS but less aggressively claimed by the OS/browser.
- In normal page focus, calling `event.preventDefault()` (plus `stopPropagation()`) on the `keydown` event DOES override the default in Chrome, Firefox, and Safari for the overwhelming majority of cases. This is what GitHub, Slack, Notion, Linear, Figma, Vercel, PostHog all rely on, and it works for them. Bind on `keydown` (not `keypress`), and prefer the capture phase so you win over other handlers.
- The known hard-failure case: **Chrome/Edge on Windows can still steal `Ctrl+K` to the address bar in some configurations**, and users report it. cmdk's own issue #288 documents this and the maintainer's conclusion is blunt: browser-level shortcuts cannot always be overridden by a web page; the recommended mitigation is to offer an alternative shortcut, document the limitation, and/or allow rebinding. GitHub hit this widely enough that they shipped **user-customisable palette shortcuts** in their Accessibility settings, and there are recurring community threads (GitHub Discussions #14762, #24057, #130778; GitLab issue #419094) about the conflict.
- Practical takeaway for Rackula: bind `Ctrl/Cmd+K` as the primary, expect ~95%+ success, but (a) do not make it the only way in, and (b) consider a settings-level rebind escape hatch later (not required for v1). When the page already has focus inside the app canvas, interception is reliable; the edge cases cluster around fresh page loads / address-bar-focused states on Windows Chrome.

Platform convention:
- macOS: `Cmd+K`. Windows/Linux: `Ctrl+K`. Detect platform and show the correct glyph (⌘ vs Ctrl). This is the universal convention (Figma, PostHog, Slack, Linear all do exactly this split). Do not show `Cmd` to Windows users.

Accessibility / keyboard-trap concerns:
- Intercepting a global shortcut is fine for a11y as long as the resulting dialog is itself escapable (`Esc`), focus is managed, and the shortcut is documented in the help/shortcuts list. The risk is not the interception itself but creating a focus trap once open. WAI-ARIA dialog semantics (focus moves in on open, returns to the trigger on close, `Esc` always closes) avoid this.
- Because some users physically cannot produce `Ctrl+K` (or it is stolen by their browser), a **visible affordance is an accessibility requirement, not just nice-to-have** - the palette must not be the sole path to any command.

Secondary / discoverable invocation (so it is not the only path):
- A visible clickable element (a header "search or jump to" pill/button, or a small command icon) is the standard secondary trigger. UX-pattern consensus: "Trigger = opens the palette from a keyboard shortcut OR a visible button" - both, not either.
- `/` (slash) is a common alternate trigger, but note it is overloaded: Notion uses `/` specifically for in-content block insertion, distinct from its `Cmd+K` link/search palette. If Rackula ever wants a slash trigger it should mean the same thing as Ctrl+K (avoid Notion's two-meaning split unless intentional).
- Other historical contenders are `Cmd+E` and `Cmd+/`, but `Cmd/Ctrl+K` is now the dominant expectation.

## Discoverability

What works (observed in real apps):
- **Visible header element with the shortcut printed in it.** The "Search or jump to..." pill (GitHub, Grafana, Sourcegraph) with a `Ctrl K` / `⌘K` key-hint badge rendered inside it. This is repeatedly cited as the best discoverability move: it is a button (clickable, screen-reader reachable), it advertises the shortcut, and it teaches the keyboard path passively.
- **Tooltip on a command-bar icon** showing the shortcut ("great for discoverability and learning the tool").
- **Listing it in the help / keyboard-shortcuts overlay.** Rackula already has a `?` shortcuts help dialog - the palette shortcut should appear there.

Anti-patterns (explicitly called out):
- **Withholding commands so they are ONLY reachable via the palette.** Stated as "the worst crime against discoverability": the palette should expose what is already reachable through menus/sidebars, not replace them. Corollary for Rackula: do not remove or hollow out the Devices sidebar in favour of the palette.
- **Introducing hidden power-user behaviour before the plain UI path is strong.** UX Patterns: "Do not introduce hidden power-user behavior before the plain path is already strong." The palette is an accelerator layered on top of a discoverable UI, not a substitute for one.
- Aggressive onboarding tooltips/coachmarks are tolerated but secondary; the durable win is the always-visible header pill plus help-menu entry, not a one-time popup.

## Behaviour (fuzzy search, recents, contextual)

Ranking / matching approaches and libraries:
- **cmdk (pacocoursey)** uses the `command-score` library: a fuzzy subsequence scorer tuned for command lists (rewards contiguous matches, word boundaries, start-of-string). Good defaults, command-palette-specific, minimal config.
- **kbar** uses **Fuse.js** under the hood for fuzzy command search.
- **Fuse.js** (already in Rackula's stack): full fuzzy library with relevance scoring, multi-key search, weighting, token/extended search. Strength: tunable relevance and multi-field search. Cost: heavier and can feel "too fuzzy" (low-quality matches) without tuning thresholds; slower on large lists.
- **fuzzysort**: the performance specialist - fast subsequence matching on large lists with little config, but fewer relevance knobs.
- Matching spectrum: substring (predictable, can miss) < fuzzy subsequence (typo/skip tolerant, the command-palette norm) < fully scored multi-field (most powerful, needs tuning).
- Recommendation for Rackula: the command set is small (dozens, not thousands), so raw speed is irrelevant. **Reuse the already-bundled Fuse.js** rather than adding cmdk/command-score/fuzzysort - avoids a new dependency. Tune the threshold tighter than the default to avoid junk matches on a small command set, and weight a `keywords`/alias field so "place" finds "Add device", etc.

Recents / frequency (MRU vs MFU):
- VS Code keeps recently-run commands at the top of the palette (recency-ordered MRU). Linear surfaces recent commands/workspaces. Raycast blends frequency + recency for its top "fallback" suggestions.
- MRU (most-recently-used) is simpler and matches user mental model better for an occasional-use tool; MFU (most-frequently-used) shines for daily drivers like Raycast.
- For a small app like Rackula: a lightweight MRU (last ~5 commands, persisted to localStorage) is worth it and cheap; full frequency scoring is over-engineering for v1.

Contextual / selection-aware commands:
- Best-practice palettes show commands relevant to the current selection/context (Linear groups by context; the "Contextual palette" variant shows "only actions related to the current object or page"). When a device is selected in Rackula, the palette empty state could surface "Duplicate selected device", "Delete selected", "Move up/down" - the same actions already bound to keys, now discoverable.
- The UX-pattern taxonomy distinguishes three variants you can mix: Universal launcher (all actions), Contextual palette (current object only), Recent-first palette (promotes repeat use). Rackula can do a hybrid: recents + contextual block at top, full command list below.

Nested / sub-command modes:
- The established pattern is a **prefix sigil to switch modes**: VS Code's Quick Open uses `>` to enter command mode and `?` to list mode prefixes; Notion uses `/`. cmdk/Linear support pushing a sub-page (a "command stack") so selecting a parent command (e.g. "Change theme >") drills into a filtered sub-list without closing the palette.
- For Rackula this matters for the scope question below: a `>`-style mode or a pushed sub-page is how you would optionally fold device-search into the same palette without polluting the top-level command list.

Empty state (before the user types):
- Do NOT show a blank box. Standard content: recents first, then suggested/contextual actions, then a grouped command list. UX Patterns explicitly says to design empty/loading/error states deliberately ("Explains what to do when the query matches nothing"). For Rackula: empty state = recents (if any) + context actions for current selection + a short grouped list of top commands (Add device, Export, Share, Toggle display mode, Fit all).

## Accessibility & UX Patterns

Correct ARIA pattern (this is the authoritative model - WAI-ARIA Authoring Practices, Combobox with Listbox popup):
- The text input has `role="combobox"`, `aria-autocomplete="list"`, `aria-expanded` (true when results shown), `aria-controls` pointing at the listbox id, and `aria-activedescendant` pointing at the id of the currently highlighted option.
- The results container has `role="listbox"`; each row has `role="option"` with a unique id and `aria-selected` on the active one.
- **DOM focus stays on the input at all times.** Arrow keys do NOT move real focus into the list; they only change which option `aria-activedescendant` points to (and the visual highlight). This is the key correctness point - it keeps typing continuous while navigating results. Screen readers announce the active option via `aria-activedescendant`.
- The whole thing lives inside an accessible modal dialog (focus moves in on open, is trapped within while open, returns to the trigger on close). cmdk composes exactly this (combobox input + listbox + Radix-style dialog), tested with VoiceOver.
- General principle (UX Patterns): semantic HTML first, ARIA only to fill gaps; verify the entire flow is completable by keyboard alone.

Keyboard model (standard, expected):
- `Ctrl/Cmd+K` (or click pill) to open; `Esc` to close (always).
- `ArrowDown` / `ArrowUp` move the highlighted option (via `aria-activedescendant`, with wrap-around typically).
- `Enter` runs the highlighted command.
- Optional: `Tab`/`Shift+Tab` or typing immediately filters. Typing always refocuses/filters from anywhere in the palette.
- On open: clear or select the previous query, move focus to the input. On close: restore focus to the trigger element.

Typical visual structure (cmdk anatomy, widely copied):
1. **Input row** - search field at top, optional leading search icon, anchors focus.
2. **Grouped results** - section headers ("Recent", "Devices", "Actions"), separating buckets so the list is scannable.
3. **Result item** - label + optional secondary hint text + optional trailing **shortcut badge** (e.g. shows `Ctrl+E` next to "Export" - doubles as passive shortcut teaching).
4. **Footer / key-hint bar** - small legend (e.g. "↑↓ navigate · ↵ select · esc close"), reinforces the keyboard model.
5. **Empty state** - shown when query matches nothing or before typing (see above).

## Scope precedent (commands vs entity search)

The strong precedent: **mature tools separate "run a command" from "find/insert an entity," usually by trigger or by an explicit sub-mode** - they do not dump everything into one flat list by default.

- **VS Code**: Command Palette (`Ctrl+Shift+P`) runs commands; **Quick Open (`Ctrl+P`)** is a separate, file/entity-navigation surface. They are deliberately different shortcuts. You *can* unify - typing `>` in Quick Open jumps to command mode - but the default surfaces are split.
- **Notion**: `/` slash menu = insert content blocks (entity insertion); `Cmd+K` = link/search/navigation. Two distinct triggers, two distinct jobs.
- **Figma**: Quick Actions (`Cmd/Ctrl+K`) runs tools/commands/plugins (align, rename, run plugin). It is command-oriented, not the primary way you drag/insert design objects - that stays in the canvas/toolbars.
- **Linear**: command palette is command/navigation-first, with contextual grouping; entity navigation is folded in but grouped, not flattened.

Implication for Rackula's open question (should the palette also do device search + placement?):
- The precedent leans toward **keeping the Devices sidebar as the canonical place-a-device path** and making the palette command-first (Export, Share, Undo/Redo, Toggle display mode, Fit all, Add rack, contextual selection actions). This also satisfies the "don't withhold commands from non-palette UI" anti-pattern - direct manipulation of devices on a canvas is the natural, discoverable path.
- If device search is wanted inside the palette, the precedent says do it as a **dedicated sub-mode** (a pushed sub-page like "Add device >" or a prefix), not interleaved into the top-level command list. That mirrors VS Code's `>` split and Notion's separate `/` and keeps the command list legible. This is the recommended compromise: command-first palette now, optional "Add device" sub-mode later, sidebar remains the primary placement path either way.

## Key Sources

- cmdk (pacocoursey) repo and README (anatomy, command-score, ARIA combobox/listbox, VoiceOver testing): https://github.com/pacocoursey/cmdk/blob/main/README.md
- cmdk issue #288 - Ctrl+K stolen by Chrome on Windows, browser shortcuts can't always be overridden: https://github.com/pacocoursey/cmdk/issues/288
- GitHub community discussion - command palette overrides browser shortcut: https://github.com/orgs/community/discussions/14762
- GitHub community discussion - Ctrl+K conflicts with browser shortcut: https://github.com/orgs/community/discussions/24057
- GitHub community discussion - Ctrl+K palette stopped working (2024): https://github.com/orgs/community/discussions/130778
- GitLab issue - Ctrl+K should disable default browser behaviour: https://gitlab.com/gitlab-org/gitlab/-/issues/419094
- WAI-ARIA Authoring Practices, Combobox pattern (combobox + listbox, aria-activedescendant, focus stays on input): https://www.w3.org/WAI/ARIA/apg/patterns/combobox/ and example https://wai-aria-practices.netlify.app/aria-practices/examples/combobox/combobox-autocomplete-list.html
- UX Patterns for Developers - Command Palette (trigger=shortcut OR button, variants, empty state, don't hide power-user behaviour): https://uxpatterns.dev/patterns/advanced/command-palette
- UX Patterns (gitbook) - discoverability, "withholding options is the worst crime", trigger/input/results/footer anatomy: https://outdraw-academy.gitbook.io/ux-patterns/command-palette
- kbar (Fuse.js-backed fuzzy command search): https://github.com/timc1/kbar
- Fuse.js (already in Rackula stack): https://www.fusejs.io/
- Fuzzy library comparison (fuse.js vs fuzzysort vs fuzzy-search): https://npm-compare.com/fuse.js,fuzzy-search,fuzzysort
- VS Code keybindings - Command Palette (Ctrl+Shift+P) vs Quick Open (Ctrl+P), `>` to switch modes: https://code.visualstudio.com/docs/configure/keybindings
- PostHog cmd-k docs (Cmd+K mac / Ctrl+K win-linux, platform glyph split): https://posthog.com/docs/cmd-k
- Figma actions menu (Cmd/Ctrl+K quick actions, command-oriented): https://help.figma.com/hc/en-us/articles/23570416033943-Use-the-actions-menu-in-Figma-Design
- Grafana epic - command palette discoverability ("Search or jump to" pattern): https://github.com/grafana/grafana/issues/60852
- Destiner - Designing a Command Palette (state, recents, grouping): https://destiner.io/blog/post/designing-a-command-palette/
