# M16 -- Post-Shell Keyboard, Help & Content Pass Execution Plan

Note: this plan covers GitHub milestone 35, titled "M16 -- Post-Shell Keyboard, Help & Content Pass" as of 2026-06-14. The milestone was rechartered 2026-06-12, first labelled M13, briefly retitled M13 on GitHub on 2026-06-13, then renamed to M16; the M13 label is retired and not reused.

> For agentic workers: execute one task per session via /dev-issue <number>. The GitHub issue body is the source of truth (each carries an Alignment audit 2026-06-12 section with binding ACs). Do not start a task whose listed blockers are open. Follow repo TDD policy (CLAUDE.md): tests only where behaviour warrants them.

**Goal**

Land the three issues of the rechartered M16 (milestone 35) against the new M14 shell: a keyboard-only device placement flow on the virtualized palette (#106), contextual tooltips rendered from the command registry (#117), and a hero recording of the finished shell (#728). M16 was rechartered 2026-06-12; its former contents were superseded by M14 or closed stale (see Verification).

**Position in sequence**

Working order is M02 -> M04 -> M03 -> M14 -> M16, with M15 (storage) running in parallel now. M16 is the last milestone in the chain. It deliberately runs after the M14 Canvas UX Overhaul so every task here targets the new shell, not surfaces M14 deletes.

**Cross-milestone gates in**

- #2094 (M14): virtualized DevicePalette with favourites and its own keyboard-navigation and screen-reader AC. #106 implements placement on this surface.
- #2096 (M14): command registry (single source for id, label, shortcut, scope, optional description; named distinct from src/lib/stores/commands/). #117 renders tooltip content from it, and #106 registers its placement-mode shortcuts through it.
- M14 shell completion generally: #2081 (StartScreen removal), #2072 (top bar reframe), and the side panel (#2076, #2077, #2078) that replaces the EditPanel fields the original #117 body targeted. #728 records this shell.

**Cross-milestone gates out**

None. Nothing downstream waits on M16; it closes the post-shell polish chain. The in-app coffin-mark rebrand (#2048) is already closed and does not block #728.

## Stage 1: Keyboard placement on the new palette

### Task: #106 Add keyboard alternative for device placement (a11y)

Blockers: #2094 (virtualized palette must land first); #2096 (register placement-mode shortcuts through the command registry rather than ad hoc).

Why this position: largest behavioural change in the milestone and independent of the tooltip work, so it goes first. Its shortcuts must exist in the registry before #117 surfaces shortcuts in tooltips.

Scope: keyboard-only device placement per the issue ACs: Enter on a focused palette device picks it up, arrow keys choose the target rack position, Enter/Space confirms, Escape cancels with no side effects, a visual preview shows the pending position, and a screen reader announces placement mode and position changes. The issue body predates the recharter and carries no audit section; its technical notes cite DeviceLibrary.svelte and RackSlot.svelte, which no longer exist. First step in the session: reconcile the issue's keyboard flow with the keyboard-navigation and screen-reader AC already delivered by #2094 on DevicePalette.svelte, then implement placement mode on that surface (extend rather than duplicate). Hold placement-mode state in a store (placement.svelte.ts or ui.svelte.ts) and register the mode's shortcuts via the #2096 registry so HelpPanel and tooltips pick them up for free.

Key files:

- src/lib/components/DevicePalette.svelte
- src/lib/components/DevicePaletteItem.svelte
- src/lib/components/KeyboardHandler.svelte
- src/lib/stores/placement.svelte.ts
- src/lib/stores/ui.svelte.ts
- The registry module landed by #2096 (path is set in that issue; it is not src/lib/stores/commands/, which is the undo/redo Command Pattern)

Verify:

- npm run test:run (placement flow: pick up, move, confirm, cancel; Escape leaves state unchanged)
- npm run lint
- npm run build
- Manual: npm run dev, unplug the mouse, place a device end to end with keyboard only; confirm screen reader announcements with VoiceOver

- [ ] Done when: a keyboard-only user can pick up, position, confirm, and cancel device placement on the new palette, with preview and screen reader announcements, and all six issue ACs are checked off.

## Stage 2: Registry-driven contextual tooltips

### Task: #117 Add contextual help tooltips on UI elements

Blockers: #2096 (command registry is the content source); #2076, #2077, #2078 (M14 side panel replaces the EditPanel fields the original body listed); #106 (Stage 1, so placement shortcuts appear in tooltips).

Why this position: per the issue's Alignment audit (2026-06-12) it is sequenced after #2096 and after the M14 shell replaces the original target surfaces. Running it after Stage 1 means the placement-mode commands are already registered and surface correctly.

Scope: per the audit re-scope, tooltips render label + shortcut + optional description from command-registry entries (#2096), not hand-authored per-control copy. Apply across key UI elements of the new shell, keep a consistent tooltip style, do not obstruct workflow, and keep tooltips accessible to keyboard users. Extend the existing Tooltip.svelte component. The original body's EditPanel field list is superseded; target the new shell surfaces (palette, side panel, top bar, verb bars) wherever a registry-backed command is exposed.

Key files:

- src/lib/components/Tooltip.svelte
- src/lib/components/HelpPanel.svelte (reference: already generates its shortcut list from the registry per #2096)
- The registry module landed by #2096
- src/lib/components/DevicePalette.svelte and other shell surfaces that expose registry commands

Verify:

- npm run test:run (tooltip renders label, shortcut, and description from a registry entry; keyboard focus triggers tooltips)
- npm run lint
- npm run build
- Manual: npm run dev, hover and keyboard-focus controls; confirm shortcuts match HelpPanel (both read the same registry, so any mismatch is a bug)

- [ ] Done when: key UI elements show tooltips whose label, shortcut, and description come from command-registry entries, with no surface hand-maintaining its own command copy, and the issue ACs are checked off.

## Stage 3: Hero recording of the new shell

### Task: #728 Create updated hero gif/video

Blockers: #106 and #117 (record the finished shell, including the new keyboard and help affordances); M14 shell issues #2081 and #2072 are implicit and already satisfied by milestone ordering.

Why this position: the audit records decision option (b): any recording made before the M14 shell overhaul is invalidated by it (#2081 removes StartScreen, #2072 reframes the top bar), so this is the last task. The rebrand no longer blocks (#2048 closed).

Scope: produce an updated hero recording of the app on the new shell to improve discoverability and make shared links more appealing. Per the audit, set the open ACs at pickup time: format (gif vs mp4), length (around 30 seconds), and placement (README, site, listings). Replace or supplement the current hero asset. If an interim throwaway gif is wanted for the M02 listings, that is a separate small issue, not this one.

Key files:

- assets/Rackula-hero-drac.gif (current hero asset)
- README.md (line 25 embeds the current hero)
- assets/README.md (asset inventory, update if conventions require)

Verify:

- Manual: render README.md locally or on GitHub and confirm the new media displays at the intended size
- Manual: check the recorded flow shows the new shell (no StartScreen, new top bar) and stays near the chosen length
- npm run build (only if any site placement touches app or static files)
- gh issue view 728 -R RackulaLives/Rackula (confirm the format, length, and placement ACs were set and checked)

- [ ] Done when: an updated hero recording of the new shell is committed and embedded in the agreed placements, with format, length, and placement ACs set on the issue and satisfied.

## Verification

Milestone close-out checklist:

- [ ] #106, #117, #728 all closed (gh issue list -R RackulaLives/Rackula --milestone "M16 -- Post-Shell Keyboard, Help & Content Pass" --state open returns nothing)
- [ ] Former M16 contents confirmed superseded, no orphans: #114 -> #2094, #115 -> #2095, #951 -> #2082/#2073, #767 -> #2158, #946 closed stale (all five verified closed as of 2026-06-12)
- [ ] Smoke: keyboard-only placement flow works on a production build (npm run build, then preview)
- [ ] Smoke: tooltips and HelpPanel show identical shortcuts for the same commands (single registry source)
- [ ] Smoke: README hero renders the new shell recording
- [ ] npm run test:run, npm run lint, and npm run build green on main after the final merge
- [ ] Close milestone M16 on GitHub
