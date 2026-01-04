# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
