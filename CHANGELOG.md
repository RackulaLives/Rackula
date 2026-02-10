# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.8.0] - 2026-02-10

### Added

- Mobile bottom navigation bar with Framework7-inspired design (#641, PR #1055, #1062, #1063)
- Slim toolbar mode for mobile viewports (PR #1054)
- Mobile file actions sheet (PR #1059)
- Rack indicator strip with navigation dots (PR #1056)
- Mobile view sheet controls (#643, PR #1058)
- Compact mobile toolbar quick actions (PR #1060)
- Mobile device library trigger in bottom nav (PR #1061)
- Mobile rack swipe navigation (PR #1076)
- Touch long-press context menus (PR #1086)
- Mobile floating undo/redo controls (#1046, PR #1098)
- Virtual keyboard viewport adaptation (#1049, PR #1097)
- Phase 1 NetBox homelab device import: 40 image-priority devices (#1109, PR #1134)
- E2E test infrastructure and wizard keyboard shortcuts (#903, PR #1128)
- Layout store contract safety net tests (#910, PR #1083)
- BottomSheet interaction test coverage (PR #1072)

### Changed

- Mobile warning modal updated with positive messaging (PR #1053)
- Mobile export/share dialogs made responsive (#1047, PR #1123, #1126)
- BottomSheet refactored to one-way open prop (PR #1073)
- Tokenized shared dialog mobile content padding (#1162, PR #1165)

### Fixed

- Start Screen startup path stabilized (#1122, PR #1168)
- Svelte a11y build warnings resolved (#1028, PR #1172)
- App.svelte state_referenced_locally warning resolved (#1171, PR #1179)
- Stale canvas touch listener lifecycle hardened (#1089, PR #1099)
- Swipe pan rejection aligned with dominance ratio (#1090, PR #1093)
- Swipe listener lifecycle and logging tightened (PR #1082)
- Swipe gesture review follow-ups addressed (PR #1081)
- Two-way binding to derived sheet state avoided (PR #1064)
- Selection store sync, a11y improvements, and Safari iOS dark rack colours (PR #1057)
- Persistence Start Screen integration into app launch flow (PR #1065)
- Firefox logo SVG decode errors and persistence health handling hardened (PR #1092)
- Keyboard viewport scroll excluded from select elements (#1103)
- Zip export folder names sanitized (PR #1074)
- Review & Clean Up action routed through real cleanup workflow (#1125, PR #1138)
- Dev deploy env persistence and checkout permissions fixed (#1147, PR #1148, #1149)

### Security

- API CORS hardened and write-route auth defaults tightened (#1124, PR #1135)
- CORS explicitly configured for dev domain

### Technical

- Restored svelte-check/typecheck baseline (#1121, PR #1136)
- NetBox homelab device curation spike delivered (#1096, PR #1118)
- Authentication v1 architecture spike and ADR (#1100, PR #1167)
- Security threat model research document added (#1069, PR #1070)
- Nginx auth hardening section added to self-hosting guide (#1112, PR #1127)
- Self-hosting docs: storage paths, persistence setup, and audit checklist updated (PR #1156, #1157, #1159, #1163)
- Container/self-hosting runtime and CI guardrails tightened (#1155, PR #1161, #1169)
- .env.example expanded for persistence and API security vars (#1153, PR #1159)
- Deploy dev workflow and docker-compose updated
- Hoisted mock resets in cleanup prompt spec (#1150, PR #1158)
- Star history chart added to README (PR #1071, #1075)
- Bumped dependencies: svelte 5.49.1→5.50.0, simple-icons, @types/node, eslint, Playwright, and others (PR #1139, #1140, #1141, #1142, #1143, #1146)
- Updated copyright year and owner in LICENSE (PR #1166)
- YAML viewer/editor spike recommendations (#573, PR #1173)

## [0.7.9] - 2026-02-03

### Security

- Fix ReDoS vulnerability in @isaacs/brace-expansion (5.0.0 to 5.0.1, CVSS 9.2) (PR #1038)
- Fix nginx security header inheritance bug: /assets/ location was silently dropping all security headers (#1037, PR #1038)
- Add HSTS, Referrer-Policy, and Permissions-Policy headers to all responses (PR #1038)
- Add 1MB request body size limit on layout PUT endpoints to prevent memory exhaustion (PR #1038)
- Centralize security headers into shared nginx include snippet to prevent header drift (#1039, PR #1040)
- Add startup warning when CORS_ORIGIN is unset in production (PR #1040)
- Update jsPDF 4.0.0 to 4.1.0, resolving 4 CVEs: race condition, XMP injection, PDF injection, BMP DoS (PR #1033)

### Technical

- Bump GitHub Actions: claude-code-action, codeql-action, docker/login-action (PR #1034)
- Bump development dependencies: Stryker, jsdom, happy-dom, svelte-check, @types/node, globals (PR #1035, #1032, #1031)
- Remove deprecated X-XSS-Protection header (CSP replaces it) (PR #1038)

## [0.7.8] - 2026-02-02

### Fixed

- Persistence API 404 errors on /layouts endpoints - routes now mount at root (#1007, PR #1008)
- Stale localStorage overwriting newer server data during session storage race conditions (#1012, PR #1014)
  - Thanks to @Mihai-B for reporting this issue!
- Auto-save creating empty layout on every visit to root URL (#1003, PR #1013)
- Nginx /api and /api/ edge case request handling (#1010, PR #1015)
- CSP script hashes updated to match current build output (PR #1021)

### Added

- Compatibility aliases for /api/\* routes for direct API access (#1009, PR #1019)

### Technical

- Migrated Vitest config to v4 poolOptions format (#1017, PR #1018)
- Addressed CodeRabbit feedback on session-storage tests (PR #1016)

## [0.7.7] - 2026-01-31

### Fixed

- Persistence mode now actually persists data with proper YAML serialization (PR #1001)
- Auto-save now works correctly with cloud status indicators
- Start screen displays appropriately when persistence is enabled
- Layout auto-loads on startup if a saved layout exists
- Metadata and UUID handling for persisted layouts
- Thanks to @timothystewart6 for the comprehensive persistence fix!

### Technical

- Production deployment now syncs docker-compose.yml from repo to prevent config drift
- Added --remove-orphans flag to clean up stale containers during deployment
- Fixed inch mark character escaping in changelog for GitHub Actions

## [0.7.6] - 2026-01-31

### Added

- Rack width selector in custom device form with smart defaults based on active rack (#970)

### Changed

- Device palette now hides incompatible devices instead of graying them out (#996)
- Empty brand categories are hidden when no compatible devices are available

### Fixed

- Custom devices cannot be created for 10-inch racks - now properly supports 10-inch, 19-inch, or both (#970)
- Shorter racks stretch to match tallest rack height in multi-rack layout (#997)
- structuredClone fails on Svelte 5 state proxy during auto-save (#998)
- Double selection highlight on active rack (#999)

## [0.7.5] - 2026-01-30

### Added

- Configurable nginx listen port via `RACKULA_LISTEN_PORT` environment variable (#980, PR #994)
  - Enables advanced deployments where container and host ports need to match
  - Backward compatible: existing deployments unchanged
  - Thanks to @stavros-k for the feature request and initial implementation

### Technical

- Bump Svelte from 5.48.5 to 5.49.0 (PR #981)
- Bump bits-ui from 2.15.4 to 2.15.5 (PR #982)
- Bump @eslint/compat from 2.0.1 to 2.0.2 (PR #985)
- Bump development dependencies (PR #992)

## [0.7.4] - 2026-01-30

This release introduces the `:persist` image tag, enabling persistence for self-hosted installs via the rackula-api server-side container. See the [Self-Hosting Guide](docs/guides/SELF-HOSTING.md) for details.

### Added

- Cisco brand pack with core homelab/enterprise devices (#987, PR #988)
- Custom brand icons for AC Infinity, CyberPower, DeskPi, and Netgate
- 8 new brand icons from simple-icons: Fortinet, Netgear, Palo Alto, Cisco, QNAP, Lenovo, Blackmagic Design, Apple (#990, PR #991)
- CI workflow to publish :persist Docker image tag (#973, PR #974)

### Changed

- Unified API port configuration under RACKULA_API_PORT environment variable (#960, #962)
- Refactored self-hosting documentation for current deployment methodology (#944, PR #976)
- Docker compose now references :persist image tag (PR #975)

### Fixed

- Duplicate slug detection and airflow normalization for brand pack devices (PR #989)
- nginx envsubst escaping for read-only container filesystems (#968)
- Docker healthcheck now uses PORT environment variable (#961, PR #955)

### Technical

- Dependencies: svelte 5.48.5, simple-icons 16.6.1, happy-dom 20.4.0, @types/node 25.1.0, globals 17.2.0
- GitHub Actions updates (PR #959)

## [0.7.3] - 2026-01-24

### Fixed

- Splash screen blocking localStorage persistence on startup (#948)
- Canvas not filling available space due to bits-ui wrapper regression (#897, #931) - thanks @Aries223 for reporting
- Rack focus positioning not accounting for drawer width (#950)
- Rack bottoms misaligned in multi-rack layout focus calculations (#949)

### Technical

- Bump globals from 17.0.0 to 17.1.0 (#932)

## [0.7.2] - 2026-01-24

### Fixed

- Canvas not filling available space with small racks (#931, #897)

## [0.7.1] - 2026-01-24

### Fixed

- Splash screen no longer shows "Persistence API unavailable" warning to SaaS users (#942, #943)

## [0.7.0] - 2026-01-24

Major release featuring multi-rack support, persistent storage API, and improved data format.

### Added

- Multi-rack support: Create and manage multiple racks in a single layout (#938)
- Persistent storage API: Self-hosted deployments can now save layouts server-side (#858, #864)
- Runtime API detection: App automatically detects API availability without rebuild (#936, #941)
- UUID-based layout storage with folder-per-layout structure (#916, #917, #926, #927)
- Folder-structure zip export for browser-only users (#919, #928)
- Import support for new folder-structure zip format (#920, #930)
- Metadata section in YAML schema (id, name, schema_version, description) (#915, #922)
- Version info displayed on splash screen (#905, #906)
- Rackula logo on StartScreen (#902)
- bits-ui Checkbox component (#828, #881)
- bits-ui Switch component for toggle switches (#880, #884)
- E2E tests for device metadata persistence (#887, #889)
- E2E tests for rack Focus context menu (#908, #912)
- Carlton E2E regression test for decimal positions (#883, #886)

### Changed

- Layout format migration: automatically converts old formats on first save (#918, #929)
- About dialog: removed redundant header and X close button (#900, #904)

### Fixed

- localStorage migration for legacy rack format when upgrading from v0.6.x (#935, #940)
- Focus and fit-all calculations for rack centering (#908, #913, #914)
- fitAll dimensions for single-view racks (#911)
- Autosave loading prevented after "New Layout" click (#899, #909)
- RackList props restored after persistence refactor (#895, #896)
- Rear view toggle works for bayed rack groups (#874, #888)
- Decimal U positions accepted in layout files (#879, #885)
- Half-width blocked slot indicators positioning (#875, #877)
- Bayed racks exported as connected groups (#873)

### Technical

- Runtime API detection replaces build-time VITE_PERSIST_ENABLED flag (#936, #941)
- API sidecar support for dev environment (#937)
- CodeRabbit pre-push hook integration

## [0.6.16] - 2026-01-08

Fixed some regressions in device placement logic after refactoring.

Also learning a bit about how vitest works (or doesn't) with >3k tests.

Also added a little widget for displaying app build info for development purposes.

### Added

- feature: added/refactored the About menu to show relevant info about the app version, build time (#441)

### Fixed

- bug: Changing device face to 'both' bypasses collision detection (#450)
- bug: Full-depth devices with overridden face still block opposite face placements (#444)

### Technical

- bug: Test suite crashes with JavaScript heap memory limit / IPC channel error (#446)

### Research

- Ongoing work on multi-rack support and multi-bay racks.

## [0.6.15] - 2026-01-05

### Fixed

- Safari coordinate conversion bug causing drop target offset when zoomed (replaced getScreenCTM with getBoundingClientRect) (#424)
- Safari text selection during device drag (#424)
- Safari logo disappearance in party mode (#423)

### Technical

- Audit and migrate remaining foreignObject elements to SVG-native implementations (#420, PR #422)

## [0.6.14] - 2026-01-04

## Added

#251: feat: port tooltips on hover
#146: Support half-width devices in full width rack
#403: feat: Add IP Address field to Device Edit Panel

### Fixed

#415: Docker container never marked as healthy - thanks to @HellsCrimson for reporting!
#411: Safari 18.x: Device positioning broken - grab handles stacked at top of rack - thanks to @@brandonb927 for reporting
#393: drag and dropping not working on Safari/Mac

### Technical

#399: chore: Address CodeRabbit feedback from #398 (Safari pointer events fix)
#400: fix: Refactor PortIndicators to use SVG-native pointer events (Safari compatibility)
#406: chore: consolidate brand pack tests into single parameterized file
#407: chore: remove redundant schema validation tests
#408: chore: audit and reduce high-volume test files
#409: chore: add high-value tests for under-tested areas
#418: chore: remove unused face option from createTestDevice helper in collision tests

## [0.6.13] - 2026-01-03

### Fixed

- Safari device selection and drag-and-drop not working (WebKit Bug #230304 workaround) - thanks @Daishi1938 for reporting! (#397, #393, #394, PR #398)

### Technical

- Cable path rendering algorithm research spike (#262, PR #395)

## [0.6.12] - 2026-01-03

### Added

- PlacedPort schema and port instantiation for connection infrastructure (#363, PR #389)
- MVP Connection model with port-based references (#365, PR #392)

### Fixed

- Docker images now build for both amd64 and arm64 architectures (#390, PR #391)

## [0.6.11] - 2026-01-02

### Fixed

- Face override not working on full-depth devices (#383, PR #385)

## [0.6.10] - 2026-01-02

### Added

- Network interface port indicators on devices with color-coded types (#249, PR #378; #250, PR #382)
- Fuzzy search with Fuse.js in device library (#310, PR #373)
- Cable data model and schema (#261, PR #355)
- Apple brand pack: Xserve, Xserve RAID (#340, PR #353)
- AC Infinity brand pack: Cloudplate T1, T2, T7 cooling fans (#337, PR #343)
- 27 Ubiquiti device images from vastoholic/draw-io (#339, PR #350)

### Changed

- Self-hosted Space Grotesk font for logo wordmark (#377, PR #379)

### Fixed

- Banana orientation and icon (#348, PR #349)
- CodeRabbit feedback on PortIndicators and fuzzy search (PR #374, PR #381)

### Technical

- Collision toast notification test suite (#307, PR #351)
- Extracted getDeviceDisplayName helper function (#348, PR #354)

## [0.6.9] - 2025-12-31

### Added

- 21-inch rack support for OCP Open Rack width (#149)
- NetBox YAML import for device types (#259)
- Resizable device library sidebar with keyboard shortcuts (#318)
- Multi-field device search with relevance scoring (#308)
- Rack-side annotations column (#173)
- Mobile long-press editing for devices (#230)
- Paraglide JS 2.0 internationalization infrastructure (#182)
- Build time indicator in dev environment (#328, #336)
- MikroTik RB5009 device (#280)
- Banana for scale easter egg (#313)

### Fixed

- Device library panel content after #259 regression
- iOS Safari long press for device edit menu (#232)
- Rack + annotations centering relative to name heading (#304)
- Banana positioning and rotation (#317)

### Technical

- Research spikes: isometric rendering (#321), device search (#281), NetBox DnD patterns (#200)
- Performance baseline for port visualization (#255)

## [0.6.8] - 2025-12-30

### Added

- Device depth visibility badges and Add Device toggle (#240, #241)
- DeskPi brand pack: 8 devices for 10-inch rack accessories (#226)
- Tier 1 analytics for core feature adoption metrics (#223)
- DRackula prefix for development environment (#215)

### Changed

- Restored Dracula purple logo with white brand text (#233)

### Fixed

- Consolidated duplicate createRack function exports (#224)

### Technical

- iOS Safari E2E tests via BrowserStack (#228)
- Android Chrome E2E tests (#229)
- Network interface visualization spike research (#237)

## [0.6.7] - 2025-12-29

### Added

- Mobile tap-to-place editing experience (PR #174)
- Toggle to disable rear view on canvas (#207, PR #222)
- White logo with rainbow gradient on hover (#216, PR #221)

### Fixed

- Canvas.svelte a11y warnings with ARIA role (#208, PR #213)
- U numbering direction in export (#217, PR #220)

## [0.6.6] - 2025-12-29

### Added

- Invert U numbering toggle in EditPanel (#204, PR #210)

### Fixed

- Zod jitless mode to avoid CSP violations (#211, PR #212)

## [0.6.5] - 2025-12-29

### Added

- UI controls for 0.5U device positioning (#145, PR #179)
- Auto-resize device labels for longer text (PR #178)
- create-issue Claude Code skill (#194, PR #195)

### Changed

- Extracted device movement logic into shared utility (PR #180)
- Docker compose configuration update (PR #170)

### Fixed

- Export respects colour_override on placed devices (#171, PR #175)
- localStorage mock and test timeout (#193, PR #197)
- Removed invalid project-status-sync workflow (#201, PR #203)

### Technical

- Beszel monitoring backend spike (#199, PR #202)

## [0.6.4] - 2025-12-28

### Added

- Face override on all device types (#161)
- Warning modal for mobile users (#165)
- Delete custom device types from library (#162, PR #164)

### Fixed

- Brand pink for mobile warning modal button (#163, PR #169)

### Technical

- Regression tests for blank panel depth detection (PR #160)
- Regression tests for custom multi-U device placement (#166, PR #168)

## [0.6.3] - 2025-12-28

### Added

- Widow's peak logo with Space Grotesk font and heartbeat animation (PR #148)

### Fixed

- Toolbar logo border and analytics subdomain (PR #147)

## [0.6.2] - 2025-12-27

### Changed

- Minor fixes and improvements

## [0.6.1] - 2025-12-27

### Changed

- Rebranded to Rackula name

## [0.5.9] - 2025-12-20

### Added

- Device palette search with keyboard navigation and highlighting (#13)
- Notes field for racks in edit panel
- localStorage auto-save for session persistence (#85)
- Mobile view UI with touch gestures and viewport detection (#85)
- Shareable layout links via URL (#89)
- NetBox device import automation (#106)
- Ubiquiti brand pack device images (#6)
- Visual environment indicator in titlebar (#69)
- GitHub Issue Types and size label automation (#81)

### Changed

- Redesigned device edit panel UX (#12)
- Reduced visual noise in EditPanel (#11)
- Standardized mobile breakpoint to 1024px (#85)
- Migrated test environment from jsdom to happy-dom (#79)
- Improved mobile toolbar UX with hamburger menu (#85)
- Starter library now loads as runtime constant (#100)

### Fixed

- PlacedDevice UUID generation now uses generateId() (#114)
- App test stability for CI
- Share link crypto.randomUUID error
- File picker dialog race conditions (#45)
- Orphaned image cleanup for memory leaks (#46)
- Device auto-import reactivity (#43)
- Export preview error messages (#44)
- Rectangular mounting holes on rack rails (#18)
- Device images extend past rack rails for realism (#9)

### Security

- XSS defense measures and documentation
- Explicit permissions for GitHub workflows (CWE-275)

### Technical

- Comprehensive test coverage expansion
- Docker caching and CI workflow optimization (#77)
- Pre-commit hooks optimization (#76, #78)
- Documentation reorganization with ARCHITECTURE.md (#26)

## [0.2.1] - 2025-12-01

### Added

- WCAG AA accessibility compliance with ARIA audit
- Color contrast verification utilities
- Animation keyframes system (device-settle, drawer, toast, dialog, shake)
- Reduced motion support (CSS + JavaScript utilities)
- 5th U number highlighting for easier rack unit reading
- Tabular figures and monospace font for U numbers
- Comprehensive accessibility test suite

### Changed

- Design tokens system consolidated in `src/lib/styles/tokens.css`
- Edit panel visual hierarchy improved
- Form inputs consistent styling

### Technical

- Test suite expanded to 1043 tests
- Added accessibility checklist documentation

## [0.2.0] - 2025-11-30

### Added

- Front/rear rack view toggle with device face filtering
- Device face assignment (front, rear, or both)
- Fit All zoom button with F keyboard shortcut
- Rack duplication with Ctrl/Cmd+D shortcut
- Device library import from JSON files
- Layout migration from v0.1 to v0.2

### Changed

- Device Library toggle button replaces branding in toolbar
- Rack titles now positioned above racks (not below)
- Device icons vertically centered in rack slots
- Help panel shows only GitHub link

### Fixed

- Coordinate calculations now use getScreenCTM() for better zoom/pan handling
- Drag-and-drop works correctly at all zoom levels and pan positions

### Technical

- Integrated panzoom library for smooth canvas zoom/pan
- Added comprehensive test coverage (793 tests)

## [0.1.1] - 2025-12-01

### Changed

- Rescoped to single-rack editing for v0.1 stability
- Multi-rack support deferred to v0.3
- Removed rack reordering UI (drag handles)
- Simplified canvas layout for single rack (centered)

### Added

- Save-first confirmation dialog when replacing rack
- Warning toast when loading multi-rack files
- E2E tests for single-rack behavior

### Removed

- Multi-rack canvas display (deferred to v0.3)
- Cross-rack device moves (deferred to v0.3)
- Rack reordering controls (deferred to v0.3)

## [0.1.0] - 2025-11-28

### Added

- Initial release of Rackula
- Visual rack editor with SVG rendering
- Drag-and-drop device placement from palette
- Device movement within and between racks
- Collision detection and prevention
- Starter device library with 23 common devices
- Custom device creation with category colors
- Edit panel for rack and device properties
- Dark and light theme support
- Keyboard shortcuts for all actions
- Save/load layouts as JSON files
- Export to PNG, JPEG, SVG, and PDF
- Session auto-save to browser storage
- Help panel with keyboard shortcuts reference
- Docker deployment configuration
- Comprehensive test suite (unit, component, E2E)
