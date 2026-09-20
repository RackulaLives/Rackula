# Spike #3293: external research

Question: how should Rackula support layouts of about 100 racks, instead of the fixed `MAX_RACKS = 10` cap or a larger arbitrary number?

This document is external prior art only. Rackula's own codebase facts are in `docs/research/3293-codebase.md`; the measurements quoted below as "our numbers" come from this spike (production build, Chromium, 1600x1000 viewport, 4x CPU throttle) and from #3287.

Our numbers, for reference, because every section below is read against them:

- Cost tracks rendered SVG elements. 100 racks in one row: load 3.0 s, longest main-thread task 2.3 s, zoom p95 167 ms, selection 716 ms.
- Rack frame chrome is about 9 SVG elements per U per face, so 100 dual-face 48U racks is about 89,000 elements before any device.
- Zoom cost is layout, not script: over 20 wheel steps, script 21 ms, style 38 ms, layout 2,603 ms.
- Removing only the U-number `<text>` elements (8,400 of them) cut that layout time from 1,883 ms to 267 ms. SVG `<text>` appears to cost roughly 30x a `<rect>` during a scale change.
- Pan is free at every size (CSS transform only, no re-layout).

Every version-specific or contested number is flagged inline. Anything that could not be verified against a primary source is marked unverified.

---

## 1. How other tools present hundreds of racks

### 1.1 The headline finding

No surveyed tool renders full-detail elevations for a hundred racks on one screen. Every one of them uses at least one of four levers: paginate, scope to a container, degrade fidelity, or require an explicit selection.

| Tool | Multi-rack surface | Fidelity | Bound on count |
| --- | --- | --- | --- |
| NetBox | Horizontal scroll strip of full SVG elevations | Full detail, plus "Images only" and "Labels only" density modes | Paginated, default 50, cap 1000 |
| RackTables | Wrapped grid of cached PNG mini-elevations | Low-resolution thumbnail, scale-parameterised | `RACKS_PER_ROW` default 12 per line, 0 disables |
| openDCIM | One row of cabinets side by side, about 258 px each | Compact elevation | Unbounded, but scoped to a single row |
| Device42 | Selected racks on one screen, cross-rack drag and drop | Full detail | User selection only |
| Sunbird dcTrack | Multi-select cabinet elevations, floor map with Isolate | Full detail on the isolated subset | User selection only |
| Hyperview | Floor plan footprints in 2D and 3D | Plan view, not elevation | Elevations are one rack at a time |
| draw.io / Visio | Infinite canvas, user-imposed pages and layers | Full detail | No rack-aware structure at all |

### 1.2 NetBox

Inspected at `main`, `netbox/release.yaml` reading `version: "4.7.1"`, published 2026-09-15, so everything here is NetBox 4.7.x.

Data model. `Rack` has a required `site` FK, an optional `location` FK (`on_delete=SET_NULL`), an optional `group` FK to `dcim.RackGroup` with `help_text=_('physical grouping')`, plus `rack_type`, `tenant` and `role`. The docs say: "Each rack must be assigned to a site, and may optionally be assigned to a location within that site. Racks can also be organized by user-defined functional roles or by rack groups. The name and facility ID of each rack within a location must be unique."

`Location` is a nested tree: "Locations can be nested to form a hierarchy. For example, you may have floors within a site, and rooms within a floor", and "A location may represent a floor, room, cage, or similar organizational unit." Two corrections to the common assumption:

- `Location` is no longer MPTT on `main`. It now subclasses `NestedLtreeGroupModel` (PostgreSQL `ltree`); the old `NestedGroupModel` is annotated "Deprecated MPTT-backed nested group base, retained for backwards compatibility with plugins."
- NetBox removed `RackGroup` in v2.11 (renaming it to `Location`) and has since reintroduced it. The v4.6 release notes say: "A flat RackGroup model has been reintroduced to provide a lightweight secondary axis of rack organization (e.g. by row or aisle) that is independent of the location hierarchy." The model doc adds: "Rack groups are flat and do not form a hierarchy."

That second point is the single most transferable data-model finding in this section. NetBox tried one nested hierarchy for everything, found it insufficient for real datacentre rows, and added a second deliberately flat grouping axis on top rather than deepening the tree.

Rack Elevations gallery. Route `dcim:rack_elevation_list` at `/dcim/rack-elevations/`. The view docstring is literally "Display a set of rack elevations side-by-side." The template is a single horizontally scrolling strip of inline-block SVG elevations:

```html
<div style="white-space: nowrap; overflow-x: scroll;">
  {% for rack in page %}
  <div style="display: inline-block; margin-right: 12px"></div>
</div>
```

Not a grid, not thumbnails, not virtualised. The same template carries a density control: a `<select class="rack-view">` offering Images and Labels, Images only, or Labels only, plus a Front/Rear toggle and a Sort By dropdown.

Pagination limits, from `netbox/netbox/config/parameters.py`: `PAGINATE_COUNT` default 50, `MAX_PAGE_SIZE` default 1000. `EnhancedPaginator.default_page_lengths = (25, 50, 100, 250, 500, 1000)`. `get_paginate_count` resolves the `per_page` query parameter, then the saved user preference, then `PAGINATE_COUNT`, and returns "the lesser of the calculated value and MAX_PAGE_SIZE." So NetBox renders 50 complete rack elevations on one page by default and a user can legitimately push that to 1000.

Pixel budget. `RACK_ELEVATION_DEFAULT_UNIT_WIDTH` default 220, `RACK_ELEVATION_DEFAULT_UNIT_HEIGHT` default 22, with the docs noting the height "should be approximately one tenth of RACK_ELEVATION_DEFAULT_UNIT_WIDTH". A 42U elevation at defaults is roughly 220 x 924 px plus legend and margins, so the default page of 50 is roughly 11,000 px of horizontal scroll. NetBox ships that.

Rendering is server-side SVG (`netbox/dcim/svg/racks.py`), with a per-rack REST endpoint: `@action(detail=True) def elevation(...)` on the rack viewset, documented as "Rack elevation representing the list of rack units. Also supports rendering the elevation as an SVG", taking `face`, `render`, `unit_width`, `unit_height`, `legend_width`, `margin_width`, `exclude`, `expand_devices`, `include_images`. There is no NetBox endpoint that renders a whole row as one image.

Drill-down is filter-driven, not a separate hierarchy screen. The Locations list has a per-row button whose href is `{% url 'dcim:rack_elevation_list' %}?site={{ record.site.slug }}&location_id={{ record.pk }}` with title "View elevations".

No documented maximum racks per site or per location was found. That is absence of evidence in the docs and source read, not a positive statement of "unlimited".

### 1.3 openDCIM

Schema from `create.sql`. The spatial chain is `fac_DataCenter` -> `fac_Zone` -> `fac_CabRow` -> `fac_Cabinet`, with `fac_DataCenter.ContainerID` pointing at a level above (campus/container, with its own mini-map).

- `fac_Zone` is a rectangle on the floor plan: `MapX1`, `MapY1`, `MapX2`, `MapY2`, plus `MapZoom int(11) DEFAULT '100'`. A zone is literally a rectangle plus a zoom level.
- `fac_CabRow` is `CabRowID`, `Name`, `DataCenterID`, `ZoneID`. Both zone and row are optional and unique per data centre: the bulk cabinet help text reads "The name of an existing row to place this cabinet within. The combination of Data Center + Row must be unique. Optional."
- `fac_Cabinet.Location` is the cabinet label (varchar 20), with a parallel `LocationSortable` column so that "A10" sorts after "A9". A precomputed sort key for human rack names is a detail worth stealing.
- `FrontEdge varchar(7) NOT NULL DEFAULT "Top"` is a per-cabinet orientation flag driving front, rear or side rendering in the row view.
- `U1Position` exists on both `fac_DataCenter` and `fac_Cabinet`: a layout-wide numbering direction with a per-rack override.

`rowview.php` renders every cabinet in the selected row side by side, with no pagination and no cap, sizing the container as cabinets x 278 px (258 px cabinet plus 20 px margin). Those pixel figures come from a file-reading summary rather than a verbatim source fragment, so treat them as medium confidence. Note 258 px is a deliberate step below the full detail elevation.

Floor plan. openDCIM imports a floor plan rather than drawing one: `mapmaker.php` loads `<img id="map" src="$mapfile">` and uses jQuery `imgAreaSelect` to capture `x1/x2/y1/y2` per cabinet; `zone.php` does the same with the label "Click and drag on the image to select an area for this zone". The map becomes clickable once coordinates exist and shows colour-coded capacity metrics. Wiki wording, including "Zones are used to group cabinets in large data centers so that the tree of cabinets is easier to use", comes from search-engine snippets because wiki.opendcim.org redirects https to http and could not be fetched directly: unverified, though the mechanism is corroborated in source.

The sidebar cabinet tree is loaded asynchronously (`sidebar.inc.php` calls `scripts/ajax_navmenu.php`), which is itself a scaling pattern: the navigation tree is not rendered with the page.

### 1.4 RackTables

Everything is an `Object` with an `objtype_id`; `Rack`, `Row` and `Location` are SQL views over it. From `wwwroot/inc/install.php`: objtype 1560 = rack, 1561 = row, 1562 = location, with containment expressed through a generic `EntityLink` table carrying `parent_entity_type` and `child_entity_type` strings. Rack height is `AttributeValue.attr_id = 27`, rack sort order is `attr_id = 29`. `Location` nests into `Location`; `Row` belongs to a `Location`; `Rack` belongs to a `Row`.

RackTables ships the only hard, documented rack-count limit found anywhere in the survey:

```
('RACKS_PER_ROW','12','uint','yes','no','yes','Racks per row'),
('ROW_SCALE','2','uint','no','no','yes','Picture scale for rack row display'),
('DEFAULT_RACK_HEIGHT','42','uint','yes','no','yes','Default rack height'),
```

In `wwwroot/inc/interface.php`:

```php
// Zero value effectively disables the limit.
$maxPerRow = getConfigVar ('RACKS_PER_ROW');
...
// Maximum number of racks per row is proportionally less, but at least 1.
$maxPerRow = max (floor (getConfigVar ('RACKS_PER_ROW') / getConfigVar ('ROW_SCALE')), 1);
```

So `RACKS_PER_ROW` is a user-settable wrap width, not a data cap: after 12 racks the display wraps to a new line, and 0 disables it. In the dedicated row view the wrap width is divided by `ROW_SCALE` (default 2), giving 6 racks per visual line at defaults (that division is in the quoted code; the resulting 6 is arithmetic, not a quoted constant).

The overview does not render live elevations. It renders cached PNG mini-elevations held in the database:

```sql
CREATE TABLE `RackThumbnail` (
  `rack_id` int(10) unsigned NOT NULL,
  `thumb_data` blob,
  ...
```

with `loadRackThumbCache($rack_id)`, `getRackThumbLink($rack, $scale = 1, ...)`, a `printRackThumbImage` handler that sets `Content-Type: image/png`, and write-time invalidation: `foreach (getResidentRackIDs ($object_id) as $rack_id) usePreparedDeleteBlade ('RackThumbnail', array ('rack_id' => $rack_id));`. There is a test asserting the cache is NULL before and populated after first render.

### 1.5 Device42

Hierarchy is Building -> Room -> Rack: "a room is part of a building, and racks are part of a room". Rows are derived, not modelled: "In the visual room layout, rows are created automatically" by dragging and arranging racks.

Room Layout View is a top-down floor plan with zoom and an editable grid. Hovering a rack gives a popup with "View [name] Layout", "View [name] details" and "View [name] Power Unit Map".

The multi-rack surface is selection-driven: from the Racks list, select racks, then Actions, then "Show Front Layout of selected racks", which opens "the visual layout (front view) of all the selected racks on one screen", with drag and drop of devices between racks. This is the only multi-rack view in the survey that supports cross-rack drag and drop, and the set shown is an explicit user selection rather than "everything in the room". No documented cap: unverified rather than unlimited.

### 1.6 Sunbird dcTrack

Help is version-pinned; the page fetched is the v6.0.0 help set, so specifics are version-specific. Definition, verbatim: "Cabinet Elevations are graphical and text representations of cabinets and their contents", "found on various pages and dialogs in both the dcTrack Web Client and Classic View".

The interesting navigation primitive is Isolate: rather than paginating, the floor map stays whole and the user selects one or more cabinets to promote into full elevation detail, with search results driving the selection. Multi-select cabinet elevations across sites and rows is a named feature ("Visualize contents of multiple racks across any site to view real-time capacity"), though that citation is a marketing screenshot page, not documentation.

Floor plans are imported, not drawn: created in "Microsoft Visio or AutoCAD 2012 (and earlier)" and saved as .DWG for upload. dcTrack organises by Site, then Location, then rows, with cabinets "grouped by data center rows or logical groupings"; the underlying model and table names are closed source and unverified. No documented cabinet cap.

### 1.7 Hyperview

Hyperview does not have a fixed Facility/Floor/Room/Rack hierarchy. It has one generic, arbitrarily nestable `Location` asset type: "Locations in Hyperview are considered groups for containing assets. The default location is All." The supported asset types list `Location` and `Rack` as the only container types addable manually. Depth and naming of floor, room and zone are entirely user-defined, which is exactly the shape a tool needs if it wants grouping without committing to fixed level names.

Location Layout has Map Mode (child locations pinned on Google Maps, coloured by alarm status) and Floor Plan Mode (background image, grids, tiles, shapes, labels, racks and sensors), switchable 2D to 3D with layer toggles and a "View Contained Assets" button on floor-mounted assets. Rack Layout is one rack at a time and comprises three panels: "the Rack Elevation widget, the Zero U or Unplaced assets grid, and the Shelves grid". That two-grid pattern is a good answer to "where do things go that have no U position". No documented limits: unverified.

### 1.8 draw.io and Visio

draw.io rack shapes live in the `mxgraph.rackGeneral.*` namespace in `src/main/webapp/shapes/rack/mxRack.js` (for example `SHAPE_RACK_RACK_CABINET : 'mxgraph.rackGeneral.rackCabinet2'`, `SHAPE_RACK_HOR_CABLE_DUCT : 'mxgraph.rackGeneral.horCableDuct'`, with a `UNIT_NUM : 'unitNum'` property key). A default `unitSize = 20` and a fixed-shape unit height of 14.8 come from a file-reading summary: medium confidence. No `mxgraph.rackF5` style was found; F5 shapes appear to be a separate vendor library: unverified.

The rack cabinet is a resizable mxGraph container and equipment shapes drop into U slots as children ("Drag the blue circles at the top or bottom. This automatically adds additional rack space"). Numbering direction is a style property (`Display Numbers`). For many racks the rack documentation says nothing; draw.io's generic answers are pages (tabs along the bottom, shape links that jump to a page, multi-page print to a single PDF) and layers. No documented shape or page limit: unverified. Practically, draw.io puts everything on an infinite canvas with no rack-aware grouping and expects the user to impose structure by hand. That is the failure mode to avoid at 100 racks.

Visio's Rack Diagram template glues equipment to racks by connection point: "Connection points at the lower corners of the equipment shape are glued to the connection points on the Rack shape." Microsoft's "Network Equipment Shapes for Microsoft Visio" download provides 24 stencils with over 2,000 manufacturer shapes. Claims about "four stencils" in the template and 1:1 versus 1:10 drawing scale come from third-party tutorials and are unverified against Microsoft. Visio's answer to many racks is pages and layers. No documented limit.

### 1.9 What "row", "pod", "hall" and "zone" mean across the survey

| Term | Where it is a real model | Semantics |
| --- | --- | --- |
| Row | NetBox `dcim.RackGroup` (flat, explicitly "row or aisle"), RackTables `Row` (objtype 1561, between Location and Rack), openDCIM `fac_CabRow` (belongs to both DataCenter and Zone) | A linear group of racks with consistent hot/cold aisle orientation. Device42 derives it from positions rather than modelling it. |
| Zone | openDCIM `fac_Zone` only | A rectangle on the floor plan plus a zoom level; used to make a large cabinet tree navigable. |
| Hall | Not modelled anywhere in the survey | Industry term for the conditioned IT area ("white space"); appears in TIA-942 discussion, not in DCIM schemas. |
| Pod | Not modelled anywhere in the survey | No tool surveyed has a pod model. |
| Location / Room / Cage | NetBox `dcim.Location` (nested), RackTables `Location` (objtype 1562, self-nesting), Device42 `Room`, Hyperview `Location` (generic, arbitrarily nestable) | The nested containment axis. |

Physical-world naming precedent: ANSI/TIA-942 identifies each rack by floor tile coordinate, for example a cabinet whose right front corner sits on tile AJ05 on floor 2 is named 2AJ05. That is a grid coordinate, not a tree path, and it is worth noting as an alternative to hierarchy for identification.

---

## 2. Large-scene rendering and zoom in the browser

### 2.1 Why SVG text is expensive specifically at a new scale

This is the most directly actionable finding in the document, and it explains our measurement exactly.

Blink lays out SVG text with a font scaled to the on-screen size, so that glyphs are rasterised at their true size rather than scaled. In `layout_svg_inline_text.cc`, `ComputeNewScaledFontForStyle` carries the comment:

> "Alter font-size to the right on-screen value to avoid scaling the glyphs themselves, except when GeometricPrecision is specified."

The scaling factor comes from `SVGLayoutSupport::CalculateScreenFontSizeScalingFactor()`, which derives from the screen CTM. `StyleDidChange` then calls `UpdateScaledFont()` and, when the diff needs full layout, invalidates the ancestor:

```cpp
if (LayoutSVGText* textLayoutObject = LayoutSVGText::locateLayoutSVGTextAncestor(this)) {
  textLayoutObject->setNeedsTextMetricsUpdate();
  textLayoutObject->setNeedsLayoutAndFullPaintInvalidation(LayoutInvalidationReason::StyleChange);
}
```

Consequence: changing the effective scale changes the screen CTM, which changes the scaling factor, which requires a new scaled font, which requires SVG text metrics and layout to be recomputed. Our 2,603 ms of layout over 20 wheel steps, and the drop from 1,883 ms to 267 ms when 8,400 `<text>` elements were removed, are consistent with exactly this path. WebKit has the analogous `calculateScreenFontSizeScalingFactor()` in `RenderSVGInlineText::computeNewScaledFontForStyle()`.

The escape hatch is in the same code. On current Chromium `main`, `ComputeNewScaledFontForStyle` checks `style.GetFontDescription().TextRendering() == kGeometricPrecision` and returns a scaling factor of 1, short-circuiting the scale-dependent font computation. MDN's description matches the intent: `geometricPrecision` "lets you scale your text fluidly", and "usually makes sense in SVG, where you want your graphic to scale faithfully without distorting the text dimensions."

Three caveats before anyone reaches for `text-rendering: geometricPrecision`:

- MDN states explicitly: "WebKit precisely applies the specified value, but Gecko treats the value the same as `optimizeLegibility`." `optimizeLegibility` enables kerning and optional ligatures and is the slow option, so this could make Firefox worse while making Chromium faster.
- MDN also says `geometricPrecision` "optimizes neither readability nor performance"; the fidelity cost is that glyphs are scaled rather than rasterised at the on-screen size, so text may look softer.
- The Blink code path above is the mechanism, not a measurement of Rackula. This must be measured against the existing harness, not assumed.

Supporting, weaker evidence that text is the expensive mark type: the SVG text chapter in "Using SVG with CSS3 and HTML5" notes "for SVG, there are a lot of additional layout complexities that the normal 'text shaper' program may not handle." On the paint side, Android's font renderer documents that when text is rendered with a scale transform "the transform is forwarded to Skia/Freetype, meaning that glyphs are stored transformed in the cache textures. This improves rendering quality at the expense of performance." That is an analogue, not Chrome, and it explains paint rather than layout.

### 2.2 Viewport culling and virtualisation

What it buys, and what it costs.

tldraw culls by hiding, not unmounting. The docs are explicit: "Culled shapes stay in the DOM with `display: none`, so they cost nothing to render." The editor "queries the editor's spatial index for shapes whose page bounds intersect the viewport and marks everything else as not visible", using an R-tree. Selected shapes, shapes being edited, and shapes whose `ShapeUtil.canCull` returns false are exempt, and the docs warn to override `canCull` "only for shapes that need it: visual effects that extend past the bounds, shapes that measure their DOM, or animations that should keep running off-screen."

tldraw also documents a subtle trap in this design. Their "Back to content" button was broken because the code used "culled shapes" to detect an empty viewport, and culling excludes selected shapes, so "any selection meant that there was at least one 'non-culled' shape, and so the button would never appear." They now maintain two distinct concepts: not-visible shapes (pure geometry) and culled shapes (visibility minus exemptions).

React Flow's `onlyRenderVisibleElements` is the cautionary version. It defaults to `false`, and the API reference warns: "This might improve performance when you have a large number of nodes and edges but also adds an overhead." A maintainer advised against it because "by only rendering visible elements, when a node or edge became visible, it had to be re-initialized". Testing reports that it improved large graphs and worsened small to medium ones. Concrete bugs from unmount-style culling: nodes with null dimensions cause `getNodesInside` to return true so everything renders on first mount (issue 1589); a hidden then shown node does not fire `NodeDimensionChange` on resize (issue 4064); edges do not render when one endpoint starts offscreen (issue 4516).

JointJS separates the two axes cleanly: "Virtual rendering controls how many cells are drawn; level of detail controls how much each one draws." Only in-viewport cell views are mounted and views are progressively unmounted as they leave the viewport.

Excalidraw uses viewport culling plus a dual-canvas split (static elements cached, interactive overlay redrawn), with memoised `getRenderableElements` keyed on a scene nonce and throttled static renders. It still reports significant lag at 5000+ elements.

Costs to weigh:

- `display: none` removes an element from layout and paint but keeps the DOM node, so style recalculation and memory still scale with total node count. The general guidance is that minimising node count beats hiding.
- Mount/unmount culling in Svelte has a specific hazard: in a keyed `{#each}`, when a key changes "the DOM elements associated with that element are completely deleted and recreated from scratch for new items without trying to reuse them" (sveltejs/svelte issue 18120).
- Culling by unmount breaks screen reader virtual buffers. Reports on virtualised content describe that "virtual cursors assume documents are stable while reading" and that offscreen content is unreachable. `display: none` also removes elements from the accessibility tree. Rackula currently makes every rack a listitem focus stop, every device a button, and every port hit target `tabindex="0"`, so any culling design has to answer this.
- Spatial index: `rbush` is the standard R-tree for this, documented as "hundreds of times faster than looping over all items" for bounding-box queries, with bulk insertion "usually ~2-3 times faster" and 20-30% better subsequent query performance.

### 2.3 Semantic zoom and level of detail

This is the technique with the best measured evidence for our specific problem, because the measured cost is layout.

The JointJS level-of-detail demo renders a 1,200-node service map in three bands: full card at 60% zoom and above, plain chip between 25% and 60%, and a single tinted rectangle below 25%. Measured layout time during a zoom sweep: block level 71 ms, chip level 191 ms, card level 302 ms, summarised as "Layout time is 4x" between block and card. The implementation splits work into three operations, Render (throws the markup away and builds the level's markup), Update (writes the model into existing markup), and Transform (position and angle only), and threshold crossings touch "only the views that exist, through `paper.getCellView()`" so virtual rendering keeps working.

yWorks documents the same technique and states the rationale plainly: simplifying at smaller zoom "reduces the rendering time and memory usage per object", "text becomes unreadable in smaller zoom levels", and "we waste rendering time for displaying text, which is not readable, anyway". Their rule is "text rendering is omitted as soon as the short text becomes unreadable", and at the coarsest level "a sub-graph can be replaced by a single node".

NetBox implements the same idea as a discrete user control rather than a zoom side effect: Images and Labels, Images only, Labels only.

Known hazard: thresholds need hysteresis, or a trackpad pinch that hovers near a boundary alternates between layers.

Complexity cost: you now maintain N renderings per component and a quantised zoom tier that must be threaded to every rack component (a single reactive tier value, not a raw scale, or every rack re-renders on every wheel tick).

### 2.4 Replacing repeated geometry: `<pattern>` yes, `<use>` no

Rail holes and grid lines are the largest single contributor to our 89,000 elements, and the two obvious deduplication tools behave very differently.

`<pattern>` is a paint server. The SVG 2 spec categorises it as "never-rendered element, paint server element" and describes it as "a pre-defined graphic object which can be replicated ('tiled') at fixed intervals in x and y to cover the areas to be painted". A pattern tile is painted, not laid out once per repetition, so replacing N repeated holes with one filled `<rect>` removes N layout objects.

`<use>` does not do this. The current implementation in Blink and WebKit "is to literally cloneNode the referenced content into a ShadowRoot off the `<use>` element", so "all elements in a subtree must now be cloned". Layout objects are created per instance; you save markup bytes, not layout work.

Measured evidence on reuse strategies is mixed and is about icons rather than geometry: Cloud Four's stress test of 1,000 icons across Chrome, Edge, Firefox, Safari and Samsung Internet measured optimised average render times of inline SVG 74.91 ms, symbol sprite 98.61 ms, external sprite 126.04 ms, image element 76.35 ms, image with data URI 67.24 ms, mask image 147.87 ms. Sprites were slower than inline, not faster. A separate case study replaced "thousands" of `<path>` dots with a single `<pattern>` and took an SVG from 2.2 MB to 59 kB, but reported file size only, with no rendering benchmark.

`foreignObject` is worse than SVG text, not better: reports include that in Chrome "foreign objects aren't clipped to the bounds you provide and seem to contribute linear rendering time no matter what you put in them", that Dagster replaced foreignObjects "with raw SVG elements, achieving much better performance", and that each additional scrollbar-displaying foreignObject slows the whole SVG canvas by roughly 18%.

### 2.5 Rendering hints

`shape-rendering` accepts `auto`, `optimizeSpeed`, `crispEdges` and `geometricPrecision`, applies to `circle`, `ellipse`, `line`, `path`, `polygon`, `polyline` and `rect`, and is Baseline widely available since July 2020. `optimizeSpeed` means "the user agent shall emphasize rendering speed over geometric precision and crisp edges. This option will sometimes cause the user agent to turn off shape anti-aliasing." `crispEdges` may also snap line positions to device pixels. Both affect paint, not layout, so neither addresses our measured bottleneck; `crispEdges` may nonetheless be appropriate for rail holes and grid lines on aesthetic grounds.

`text-rendering` values, from MDN: `optimizeSpeed` "emphasizes rendering speed over legibility and geometric precision... It disables kerning and ligatures"; `geometricPrecision` is the value that short-circuits Blink's scaled-font path (section 2.1). Both should be measured, not assumed.

`textLength` and `lengthAdjust` control fitting text to a given advance width (`spacing` adjusts advances only, `spacingAndGlyphs` stretches glyphs). No evidence was found that either reduces layout cost, and per-character positioning generally implies more work, not less. Treat as no help: unverified either way.

Converting text to paths is documented as a real win in slow renderers: Sozi's performance guide says "Converting text elements to paths facilitates the work of the browser by precomputing the shape of the characters", with the tradeoff that it "will remove the original text from your document, preventing modification and indexing by search engines". For rack U numbers, which are a fixed set of two-digit strings, a pre-generated glyph path set is feasible; the accessibility and copy/paste cost is that the numbers stop being text.

### 2.6 `content-visibility` and `contain` do not apply to SVG children

The CSS Containment specification restricts `content-visibility` to elements for which size containment can apply, and "the contain property only applies to svg elements that have an associated CSS layout box". In practice that limits it to the outer `<svg>` and `<foreignObject>`. The open CSSWG issue (w3c/csswg-drafts 9466, opened October 2023) confirms this reading and has no resolution. Conclusion: `content-visibility: auto` cannot be used to skip work on `<g>` per rack. This is a dead end for our case.

### 2.7 CSS transforms, `will-change` and layer promotion

Applying transforms to SVG elements via the `transform` attribute triggers layout and paint, whereas applying a CSS transform to an HTML wrapper does not. Charlie Marsh's case study wrapped SVG elements in DOM containers and moved to CSS transforms, taking an iPad Mini from 12 FPS to 52-60 FPS on lines, 16-20 to 48-58 on line segments, and 16-20 to 55 on polygons, with paint events disappearing from DevTools. Rackula already gets this benefit: our pan is free because it is a CSS transform only.

`will-change` is not free. Every promoted layer consumes GPU memory, and implicit compositing pulls overlapping neighbours into layers too, so the cost is not local to the element you annotate. Reported failure modes include hundreds of megabytes of GPU memory from promoting list items. web.dev's guidance is to stick to compositor-only properties and manage layer count. Applying `will-change: transform` to per-rack groups "just in case" is the documented anti-pattern.

The W3C SVG WG's own "Performance in panning and zooming" proposal frames the requirements as R1 smooth start, R2 smooth transition, R3 crisp view after finishing, and proposes that a browser "tries to keep a smoothness during frequently updating transform attribute, without re-rendering" and re-render a bitmap when updates become infrequent. It notes Firefox re-rendering unexpectedly during GPU transforms and Chrome failing to update bitmap resolution with scale. The proposal was never adopted, but it is a clean statement of the design target: during the gesture, do not re-render; after the gesture, re-render once, sharply.

### 2.8 Rasterising to a bitmap during zoom

Jake Archibald's lazy async SVG rasterisation is the canonical implementation of R1 to R3 above. The premise: "When transforming an SVG image, browsers try to render on every frame to keep the image as sharp as possible. Unfortunately SVG rendering can be slow, especially for non-trivial images", with frames "10x over our frame budget". The technique uses `createImageBitmap(imgElement, sx, sy, sw, sh, {resizeWidth, resizeHeight})` to do "a really cheap bitmap zoom of the SVG using a canvas, while rendering a cropped-but-sharp version in parallel", off the main thread.

Felt migrated their map editor from SVG to Canvas and reported the SVG problems directly: "Asking React to create, diff, reconcile and update thousands of elements on every move of the mouse when panning or zooming the map gets slow"; zoom left "nasty visual artifacts"; elements flickered on zoom-out because of GPU memory exhaustion; selecting 1,000 elements meant "many thousands of SVGs" and "many thousands of event handlers"; "The DOM really isn't designed for this kind of application." Canvas gave them stable frame rates, text improvements "through texture caching", and viewport clipping of long lines that was "far, far quicker".

SnapDOM's tiled rasterisation is the production shape of this for very large scenes: window the SVG before decode by rewriting the root `width`, `height` and `viewBox`, rasterise each tile into its own canvas (default 2048 x 2048 times scale and DPR), and deliver tiles sequentially so canvases are not all retained. Their warning is the important one: "Stitching the tiles back into one giant canvas recreates the original problem."

### 2.9 Switching to Canvas or WebGL

Where the crossover sits is data-shape dependent, not a fixed element count. Reported anchors: SVG and Canvas are "neck and neck" around 1,000 marks with SVG staying fully interactive; a rough SVG ceiling is "a few thousand individual marks per chart"; auto-promotion to Canvas above roughly 8,000 points in some charting benchmarks. The distinction that actually matters: "A 5,000-point line is a single path element, while a 5,000-point scatter is 5,000 nodes." Rackula's chrome is the scatter case, not the line case.

JointJS tested up to "50,000 cards: 100,000 DOM elements" and states "SVG performance may degrade if tens of thousands of elements are all rendered at the same time", solving it with "automatic switching of the rendering layer from SVG to canvas" at extreme zoom while keeping SVG's advantage that it "is accessible by default and provides a real DOM tree with elements you can target, inspect, and style". They also note "Canvas doesn't always outperform SVG, particularly in cases with a small number of objects or over a large surface area."

mxGraph and draw.io, which are SVG-based, show performance degradation reported from roughly 1,000 objects and browser hangs at 10,000 shapes rendered at once. draw.io's own recommendations are to split across pages, use the Outline panel to navigate, and reduce shadows and gradients.

OpenSeadragon's SVG overlay plugin has a documented issue about "significant slowness when using them with a lot of objects (e.g. 100k rectangles)". That is the same order as our 89,000 elements, from an unrelated codebase.

WebGL via PixiJS is the tier below that, with SDF text and sprite batching, but the complexity cost is a full renderer rewrite plus losing the DOM-based accessibility, hit testing and CSS styling that Rackula currently depends on.

For context on DOM size generally: Lighthouse warns above roughly 800 body nodes and errors above roughly 1,400, though since Lighthouse 13 (October 2025) the audit became an "Optimize DOM size" insight that triggers on actual style and layout work exceeding 40 ms rather than a static node count. DOM node memory estimates range from roughly 200 bytes to several kilobytes per element depending on type and browser, so 89,000 SVG nodes is plausibly tens to hundreds of megabytes: order of magnitude only, unverified.

### 2.10 Breaking up the load long task

Our 2.3 s longest main-thread task is a separate problem from zoom. `scheduler.yield()` returns a promise that yields to the main thread mid-task; it is Chromium-only, with a `scheduler-polyfill` backing it with `postTask` where available and falling through to `setTimeout`, `MessageChannel` and `requestIdleCallback` otherwise. Any task over 50 ms blocks input.

---

## 3. Cap and limit models in comparable products

### 3.1 The headline finding

Across ten products examined, not one refuses to open a document that already exceeds a limit. The universal pattern is: load it, tell the user, and degrade one specific capability, usually "you cannot add more", while leaving read, view and delete fully functional. Truncation on import exists but only for legacy or foreign formats, never for the product's own current format.

| Product | Over-limit document behaviour | Existing data | Evidence |
| --- | --- | --- | --- |
| tldraw, v1 `.tldr` import | Silently truncates to the first N shapes by z-order | Dropped shapes lost | Code, strong |
| tldraw, v2 snapshot load | Loads fully, then all creation paths refuse with a toast | Preserved | Inferred from code search, not exhaustively verified |
| Figma | Opens, locks, offers Recovery Mode to editors | Preserved, "without losing your work" | Official help, strong |
| Lucidchart, on downgrade | Viewing works, editing blocked until you delete down to 60 objects | Preserved | Staff forum posts, medium |
| Airtable | Reads work, all record creation refused including forms and API | Preserved, never deleted | Official help, strong |
| Notion | Reads and edits of existing rows work, adding rows errors | Preserved | Official help, strong |
| Excalidraw | Editing never blocked, persistence silently stops, persistent red banner | At risk; this is the anti-pattern | Code plus issues, strong |
| GitHub diffs | Renders partially, hides the excess behind "Load diff" | Untouched | Official docs, strong |
| Mermaid `maxTextSize` | Replaces the render with a labelled placeholder diagram | Source untouched | Code, strong |
| Google Sheets, Excel import | Drops any cell over 50,000 characters | Documented data loss | Official docs, strong |

### 3.2 Hard object caps: tldraw

The value is version-specific. `MAX_SHAPES_PER_PAGE` was 2000, raised to 4000 in PR 3716 ("Bump max shapes to 4000"), merged 2024-05-19. It has since moved into a configurable options object: `packages/editor/src/lib/options.ts` defaults `maxShapesPerPage: 4000`, `maxPages: 40`, `maxFilesAtOnce: 100`. The docs table reads "| `maxShapesPerPage` | 4000 | Maximum shapes allowed per page |", and the docs' own example sets it to 10000. The important structural point is that tldraw converted a hard constant into a host-configurable option, because one number does not fit every embedder.

Enforcement is a single gate:

```ts
canCreateShapes(shapes): boolean {
  return shapes.length + this.getCurrentPageShapeIds().size <= this.options.maxShapesPerPage
}
```

with failure emitting a `max-shapes` event that the UI turns into a warning toast: "You've reached the maximum number of shapes allowed on ${name} (${count}). Please delete some shapes or move to a different page to continue."

Behaviour details worth copying, verified by tldraw's own `maxShapes.test.ts`:

- Batch creation is all-or-nothing. A 10-shape paste into a page with 5 slots free creates zero.
- Tools cancel the gesture and return to idle rather than partially creating.
- `groupShapes` is transactional: if the group record would exceed the cap, children are not reparented.
- `moveShapesToPage` refuses the whole move and emits `max-shapes`.

Two failure modes to design against. Issue 5781, "Drawing a shape at the max shapes per page limit causes a crash": an arrow creation path bypassed the gate and threw `Error: expected shape` instead of toasting. PR 9297 notes the event can fire once per loop iteration, so one interaction can emit `max-shapes` hundreds of times; debounce the toast.

For over-limit documents, tldraw's v1 import truncates:

```ts
const v1Shapes = Object.values(v1Page.shapes ?? {})
  .sort((a, b) => (a.childIndex < b.childIndex ? -1 : 1))
  .slice(0, editor.options.maxShapesPerPage);
```

A code search for `maxShapesPerPage` returns only 9 files, none of them the v2 snapshot load path, which suggests the cap is enforced on creation and page-move only, not on document load. That inference is not exhaustively verified but it is the most transferable design decision in this section.

Note also that tldraw uses two different failure UXs in one codebase: `maxShapesPerPage` toasts, while page creation beyond `maxPages` is a silent no-op.

### 3.3 Soft warnings with continued operation

Figma publishes no object count at all. From "Reduce memory usage in files": "there's an active memory limit of 2GB per browser tab"; at 90% "Figma will show a red alert tile in the left sidebar"; at 100% "Figma will lock the file and inform you that there's no available memory". And explicitly: "Unfortunately, there isn't a specific number of layers, data, or resources you can look out for." The budget is bytes, not objects.

Figma's over-limit open path is the strongest precedent in the survey: "If your design file is at 100% of your memory limit upon open and you have editor permissions, you now have the option to recover your file by entering Recovery Mode", which "allows you to reduce memory usage and return your file to an editable state without losing your work". On entry, all pages load and the manage-memory modal opens; the user must get below 90% to exit. Viewers without edit access do not get recovery mode.

Miro publishes a three-tier model: "The maximum number of objects that you can add to a board is 100,000", "However performance can be impacted starting from 1,000 objects", and "For a better experience, we recommend keeping the number of objects on the board below 5,000." Miro also states that object type matters more than count, with uploaded files, high-resolution images, vector PDFs and pen drawings being disproportionately expensive. What Miro does at exactly 100,000 is not documented: unverified. Note a Miro community moderator has said "Miro hasn't published any limitations on absolute board size", which contradicts the help article.

Lucidchart's free-plan cap is 60 objects per document, and Lucid staff confirm "The 60 object limit also applies to shapes and also lines" and "lines and text boxes also count towards this limit in addition to true shapes". Paid plans publish no numeric limit: unverified whether an internal one exists. On downgrade, "you will only be able to edit your three most recent documents", and a document over 60 objects means "you will no longer be able to edit it". View always works, edit is gated, the user must delete down. This is commercially motivated rather than performance motivated, which is a different design intent from Rackula's.

Excalidraw has no element cap. Its effective limit is localStorage quota, and the enforcement is reactive rather than predictive: it catches the actual `QuotaExceededError`, sets an atom, and renders a persistent danger banner reading "Browser storage quota exceeded. Changes will not be saved." PR 8890 records that the author considered firing at 97% capacity and abandoned it in favour of firing on the real error. The banner clears on the next successful save. Editing is never blocked.

The cautionary tale is what came before that fix: issue 8395, "Going over the local storage limit while using Excalidraw can lead to unintended data loss", reporting that boards silently stop saving and that "Some users report losing their entire board unexpectedly after leaving the excalidraw.com domain".

### 3.4 Complexity budgets that count several things

GitHub's diff limits are the textbook multi-axis budget, from the repository limits doc:

- "The maximum number of files in a single diff is limited to 300."
- "The maximum number of renderable files (such as images, PDFs, and GeoJSON files) in a single diff is limited to 25."
- "No single file's diff may exceed 20,000 lines that you can load or 500 KB of raw diff data."
- "No total diff may exceed 20,000 lines that you can load or 1 MB of raw diff data."
- "Four hundred lines and 20 KB are automatically loaded for a single file."
- Behaviour on exceed: "Some portions of a limited diff may be displayed, but anything exceeding the limit is not shown."

Six simultaneous named axes plus progressive loading. Nothing is blocked; the view degrades and offers "Load diff".

Notion is the cleanest small version: "Each Notion database can hold up to 250,000 rows"; approaching it, "You'll see a warning in your database that you're getting close. You can still add rows"; at or over, "You won't be able to add new rows. Requests to add rows will return an error." Plus secondary byte budgets: 2.5 MB of property data per page and 1.5 MB for all properties in the database schema, and a separate 500-properties-per-database limit.

Mermaid shows two budgets with two different failure modes. `maxTextSize` defaults to 50000 and degrades gracefully, swapping the diagram for a placeholder: `'graph TB;a[Maximum text size in diagram exceeded];style a fill:#faa'`. `maxEdges` defaults to 500 and throws, with an error that names the current value, the limit and the escape hatch: "Edge limit exceeded. N edges found, but the limit is M. Initialize mermaid with maxEdges set to a higher number to allow more edges. You cannot set this config via configuration inside the diagram as it is a secure config." Both defaults are version-specific (`maxEdges` 500 was introduced by PR 5086; issue 8260 reports `maxTextSize` behaviour changing in v12.0.0). The known usability failure is that the error historically surfaced as a generic "Syntax error in text".

Airtable's plan caps are per base, cumulative across tables: Free "1000 records per base", Team "50000 records per base", Business "125000 records per base". Over the limit, existing data is never deleted and reads keep working, but "Bases that exceed the Free plan's record limit can't create new records, including records added through forms or the Airtable API". The phrase "read-only" is a community characterisation; the documented fact is "can't create new records".

Google Sheets is the counterexample on import: "Up to 10 million cells or 18,278 columns (column ZZZ)", and "When you convert a document from Excel to Google Sheets, any cell with more than 50,000 characters will be removed in Sheets". Documented silent data-dropping on import.

Visio and PowerPoint shape-count guidance is not worth citing. Microsoft's own support specialist, asked about a 50,000-shape page, answered that such usage "may relate to underlying technical limitations or specific behaviors within the software that aren't widely documented" and gave no number. The commonly circulated 1,000-shape figures are unverified against Microsoft documentation.

---

## 4. Data and transport limits

Our 100-rack test files are 1.5 to 2.0 MB of YAML. Rackula's own current limits, for reference: `MAX_YAML_BYTES = 5 MB` on local load, a hard-coded 1 MB cap on the server layout PUT and GET body, share links compressed with `LZString.compressToEncodedURIComponent` with `MAX_ENCODED_LENGTH = 64 KB` and a dialog warning above 1800 URL characters.

### 4.1 localStorage

Chrome and Chromium. Two numbers that are both correct because they are the same limit in different units. The quota constant is `const uint32 kPerStorageAreaQuota = 10485760; // 10 MiB` in `storage_area.mojom`, and the accounting is `size_t QuotaForString(const String& s) { return s.length() * sizeof(UChar); }` in `storage_area_map.cc`, preceded by the comment "For quota purposes we count each character as 2 bytes." So the budget is 10,485,760 bytes of UTF-16, which is 5,242,880 characters across all keys plus all values in one storage area. localStorage and sessionStorage are separate areas. The constant was raised from 5M to 10M in August 2013.

Practical consequence: an ASCII YAML string costs 2 bytes per character in Chrome. A 2.0 MB ASCII layout consumes 4,000,000 of 10,485,760 bytes. Two such layouts fit, three do not.

Firefox. Pref `dom.storage.default_quota`, default 5120, units KB, scoped to the whole eTLD+1 rather than the origin (Bugzilla 1429788). Accounting is "counted over len(key)+len(value) for all stored tuples that ignores actual on-disk costs", so UTF-16 code units, not encoded bytes. Net: about 5,242,880 characters shared across all subdomains.

Safari and WebKit. `constexpr unsigned localStorageQuotaInBytes = 5 * MB;` in `LocalStorageManager.cpp`, with `StorageMap::setItem` summing `key.sizeInBytes()` and `value.sizeInBytes()`, and `String::sizeInBytes()` returning `length() * (is8Bit() ? sizeof(Latin1Character) : sizeof(char16_t))`. WebKit therefore differs from Chromium: an ASCII string costs 1 byte per character, a 16-bit-backed string costs 2. Whether WTF's `MB` is 1024*1024 was not verified directly, so treat the exact character budget as approximate.

Safari eviction. WebKit's 2020 post states ITP deletes "all of a website's script-writable storage after seven days of Safari use without user interaction on the site", covering "Indexed DB, LocalStorage, Media keys, SessionStorage, Service Worker registrations and cache". The wording matters: seven days of browser usage, not seven calendar days. Home-screen web apps are "not part of Safari and thus have their own counter of days of use". Whether `navigator.storage.persist()` exempts an origin from this is unverified.

The HTML spec sets no quota number at all; it only says `setItem` "Throws a QuotaExceededError if the new value couldn't be set". Every browser's 5 MB traces back to a non-normative suggestion in the older W3C Web Storage note, which WebKit's source comment cites directly.

### 4.2 IndexedDB and the Origin Private File System

Quota model, all version-specific and with sources that disagree. Per MDN: Chromium up to 60% of total disk per origin with a browser-wide 80% cap; Firefox best-effort is the smaller of 10% of total disk or a 10 GiB eTLD+1 group limit, with persistent mode at 50% of disk capped at 8 TiB; Safari and WebKit on macOS 14+ and iOS 17+ about 60% per origin for browser apps and 80% overall, with cross-origin frames getting about a tenth of the parent's quota, and legacy Safari at 1 GiB per origin then a prompt. Quotas are computed from total disk size, not free space, to limit fingerprinting.

WebKit's own post confirms the Safari 17 numbers and adds "Safari 17.0 no longer prompts users about a website wanting to use more space."

Contested: web.dev's "Storage for the web" still says Firefox allows "up to 50% of free disk space" with a 2 GB group limit and that "Safari... appears to allow about 1GB". Prefer MDN plus the WebKit blog for Safari 17+ and current Firefox.

`navigator.storage.estimate()` returns `{usage, quota, usageDetails}`, and MDN warns "Between compression, deduplication, and obfuscation for security reasons, they will be imprecise." Chrome adds that cross-origin opaque resources contribute padding bytes to `usage`. `persist()` opts into persistent mode; Firefox prompts, while Chrome, Edge and Safari auto-decide on engagement heuristics. Eviction under pressure is LRU by origin and removes the whole origin's data across all storage APIs at once.

OPFS over IndexedDB, per MDN: it "doesn't require the same series of security checks and permission grants and is therefore faster than File System Access API calls", offers "a set of synchronous calls... that can be run inside web workers only so as not to block the main thread" via `createSyncAccessHandle()`, and "is subject to browser storage quota restrictions, just like any other origin-partitioned storage mechanism". Circulating performance figures (around 90 ms for a 100 MB sync-handle write versus around 850 ms for IndexedDB) come from third-party blogs, not vendors: approximate and unverified.

### 4.3 URL length and share links

The fragment is not sent to the server. MDN, verbatim: "The fragment is not sent to the server when the URI is requested; it is processed by the client (e.g., the browser) after the resource is retrieved." So a `#`-fragment share link is bounded by browser URL handling and by whatever the recipient's messaging app tolerates, not by any CDN or origin request-line limit.

Browser limits. Chromium's security docs state: "Chrome limits URLs to a maximum length of 2MB for practical reasons and to avoid causing denial-of-service problems in inter-process communication", with display separately capped: "Chrome's omnibox limits URL display to 32kB (`kMaxURLDisplayChars`)". The constant `url::kMaxURLChars = 2097152` is widely reported and the error string "Refusing to load URL as it exceeds 2097152 characters" is observed in the wild, but the primary header line was not fetched. Edge inherits Chromium. For Firefox, no primary-sourced general URL limit was found; the only verifiable Mozilla limit is `network.url.max-length`, a 32 MB cap on `data:` URLs specifically, shipped in Firefox 97. The frequently repeated Firefox 65,536 figure appears only in aggregator blogs: unverified. Safari's commonly cited 80,000 characters is likewise unverified. The classic 2,083 is Internet Explorer only (Microsoft KB208427); IE went out of support 2022-06-15.

Server and CDN limits, which apply to path plus query but never the fragment: Cloudflare states "URLs have a limit of 16 KB", with request and response headers each capped at 128 KB (raised 2025-10-16). nginx's `large_client_header_buffers` defaults to `4 8k`, effectively capping the request line at 8 KB with a 414 beyond that; note that an oversized single line must fit in one buffer, so four 8k buffers do not give 32k for one line. RFC 7230 places no predefined limit but recommends supporting at least 8000 octets and requires 414 on an over-long request-target.

Messaging apps. No vendor documents a URL length limit. Slack documents a message limit, not a URL limit: messages over 40,000 characters are truncated. Reports of Slack truncating URLs over roughly 4 KB, WhatsApp truncating long URLs, and email clients wrapping them are anecdotal with no measurements: unverified. There is no citable safe number; anything above a few kilobytes should be assumed to break somewhere in the chat or email chain.

QR code capacity, version 40 (177 x 177 modules):

| Error correction | Numeric | Alphanumeric | Byte  | Kanji |
| ---------------- | ------- | ------------ | ----- | ----- |
| L (7%)           | 7,089   | 4,296        | 2,953 | 1,817 |
| M (15%)          | 5,596   | 3,391        | 2,331 | 1,435 |
| Q (25%)          | 3,993   | 2,420        | 1,663 | 1,024 |
| H (30%)          | 3,057   | 1,852        | 1,273 | 784   |

Alphanumeric mode covers only uppercase A-Z, 0-9 and nine symbols, so a base64url payload encodes in byte mode: 2,953 bytes at level L is the hard ceiling.

### 4.4 Cloudflare Workers and R2

Request body size is set by the zone plan, not the Workers plan: Free 100 MB, Pro 100 MB, Business 200 MB, Enterprise 500 MB by default, with Enterprise self-serve up to 5 GB since 2026-09-04. Over the limit returns 413.

Other Workers limits: CPU time per HTTP request 10 ms on Free and up to 5 minutes on Paid with a 30 s default; subrequests 50 on Free, 10,000 on Paid and raisable; 6 simultaneous open connections; 128 MB memory per isolate; 64 MiB uncompressed script size. Response body size has no enforced limit, though CDN cache limits apply (512 MB Free/Pro/Business, 5 GB Enterprise).

R2: maximum object size 5 TiB (footnoted as 5 GiB less than 5 TiB), maximum single-part upload 5 GiB (footnoted as 5 MiB less), maximum 10,000 parts, minimum part size 5 MiB except the last, object key 1,024 bytes, object metadata 8,192 bytes, and a maximum of 1 concurrent write per second to the same key with 429 beyond that. Workers KV values cap at 25 MiB with the same 1 write/sec/key rule.

Nothing in Cloudflare's platform is the binding constraint at 2 MB. Rackula's own hard-coded 1 MB server PUT cap is.

### 4.5 In-browser compression

`CompressionStream` and `DecompressionStream` support, from MDN browser-compat-data:

| Format          | Chrome        | Firefox            | Safari        |
| --------------- | ------------- | ------------------ | ------------- |
| Constructor     | 80            | 113                | 16.4          |
| `"gzip"`        | 80            | 113                | 16.4          |
| `"deflate"`     | 80            | 113                | 16.4          |
| `"deflate-raw"` | 103           | 113                | 16.4          |
| `"brotli"`      | not supported | 147                | 18.4          |
| `"zstd"`        | not supported | 138 (experimental) | not supported |

caniuse corroborates `deflate-raw` at Chrome/Edge 103, Firefox 113, Safari 16.4, at about 95% global support. Two things to take from this: `deflate-raw` is safe on every engine that has the API at all, except Chrome 80 to 102; and do not plan on brotli or zstd in this API, because Chrome supports neither format here despite supporting both as HTTP content encodings. The brotli and zstd rows are new and version-volatile; re-check before relying on them. MDN marks the API Baseline widely available since May 2023 but warns "Some parts of this feature may have varying levels of support".

Compression ratio. There is no authoritative benchmark for YAML. The best citable JSON anchor is Lemire's measurement on `twitter.json`: 617 KB uncompressed, 51 KB with default gzip, 48 KB with default zstd, so roughly 12:1, with decompression throughput of 175 MB/s for gzip and 360 MB/s for zstd. Rackula's YAML is far more repetitive than `twitter.json`, so real ratios should be better, but measure the actual corpus rather than citing a number.

Sanity check on share links: even at 20:1, 2.0 MB becomes 100 KB, and base64url inflates that by 4/3 to roughly 133 KB. That is over 40x Cloudflare's 16 KB URL limit and over 40x QR level-L capacity. Even at 100:1 you land near 27 KB encoded, still over 16 KB. URL-embedded full layouts are not viable at this file size. Rackula's own source comment claims an extreme 100-rack, 4,200-device minimal share payload encodes to about 35 KB, which is consistent: rack count is not the binding constraint on the share link, loss of ports and connections is.

### 4.6 js-yaml

js-yaml is on the 5.x line (`[5.4.2] - 2026-09-13` in the changelog); the npm `latest` tag was not verifiable because npmjs.com returns 403 to automated fetches. 5.x is a breaking release with a migration guide at `docs/migrate_v4_to_v5.md`.

There is no built-in size limit, by design. js-yaml's own safety doc states: "The YAML spec by design allows compact documents that produce objects which are expensive to materialize. Guard against this when the input is untrusted", and its first recommendation is "Limit the input size to the smallest acceptable value."

Documented non-linear behaviour, all recent and all adversarial-input paths rather than ordinary block mappings:

- 5.4.1 (2026-08-26): "Count empty mappings in merge sequences toward `maxTotalMergeKeys` to limit CPU usage"; "Hard-limit merge sequence size to 100"
- 5.2.2 (2026-07-24): "Avoid exponential parsing time for nested flow sequence pairs"
- 5.2.1 (2026-07-02): "Remove quadratic complexity from `!!omap` addItem"
- 5.2.0 (2026-06-26): added `maxTotalMergeKeys` (default 10000) and `maxAliases` (default -1, unlimited)
- 4.2.0 (2026-06-01): added `maxDepth` (default 100); "Fix potential DoS via quadratic complexity in merge"

If Rackula ever parses user-supplied YAML server-side, set `maxDepth`, `maxAliases`, `maxTotalMergeKeys` and a byte cap explicitly.

Dump is the historically slow path, not load. Issue 362 reports 17 MB of JSON, roughly 69,000 objects: `safeDump` took 59.78 s on Node 6.1.1 and 53.34 s on Node 8.2.1 against `JSON.stringify` at 1.91 s and 1.70 s, roughly 30x, with the reporter suspecting "O(n^2) string allocations". Filed 2017 and closed 2017-08-02; whether it was actually fixed is unverified. Given Rackula writes YAML on every save, that is the number worth benchmarking first against the 1.5 to 2.0 MB corpus. No issue reporting slow loading of a multi-megabyte well-formed document was found.

js-yaml versus eemeli/yaml, from the `yaml` repo's own discussion: a February 2022 benchmark showed stringify at js-yaml 7,946 ms versus yaml@2 2,442 ms, and parse at js-yaml 504 ms versus yaml@2 9,584 ms, summarised as "js-yaml is much quicker than yaml in reading, much slower in writing". A June 2025 report in the same thread measured a 14,000-line YAML with 463 anchors and 1,457 aliases at 50 ms with js-yaml@4.1.0 versus 6,900 ms with yaml@2.3.4. The maintainer's explanation is that "yaml handles its input in stages: lexing, parsing to a CST, composing an AST, then converting to JS. It all adds up", favouring "power rather than speed". Document sizes for the 2022 run are not stated, so the absolute milliseconds are indicative only.

---

## 5. Raster and export limits

Rackula currently renders a composite export SVG for all selected racks and rasterises PNG at `scale = 2`. 100 dual-view racks is about 52,000 px of SVG, so about 104,000 px of canvas.

### 5.1 The headline finding

A 104,000 px wide single canvas is impossible in every current browser, and the blocker is the per-side cap, not memory.

| Engine | Max side | Max area | Source |
| --- | --- | --- | --- |
| Chrome / Edge (Blink) | 65,535 | 268,435,456 px (32768 x 8192) | `kMaxSkiaDim` and `kMaxCanvasArea` in `canvas_rendering_context_host.cc` |
| Firefox 148 and earlier | 32,767 | about 536,870,911 px since Firefox 112 | Bug 1282074, bug 1759728 |
| Firefox 149+ | 65,535 | area must fit in 32 bits | Bug 1911583, unverified in practice |
| Safari, macOS | no per-side constant found | 268,435,456 px (16384 x 16384) | `maxCanvasArea()` in `CanvasBase.cpp` |
| Safari, iOS family | no per-side constant found | 67,108,864 px (8192 x 8192) | same, raised from 4096 x 4096 in 2024 |

Chromium's constants, verbatim:

```cpp
static constexpr int kMaxCanvasArea = 32768 * 8192;  // Maximum canvas area in CSS pixels
static constexpr int kMaxSkiaDim   = 65535;          // Maximum width/height in CSS pixels.
```

with the adjacent comment: "Firefox limits width/height to 32767 pixels, but slows down dramatically before it reaches that limit. We limit by area instead, giving us larger maximum dimensions, in exchange for a smaller maximum canvas size."

These are version-specific. The legacy Blink tree had the same area with `MaxSkiaDim = 32767`; the per-side cap went to 65,535 at some point, community-attributed to Chrome 73 and corroborated by a 2020 observation that "Chrome allows canvas of size 65535x1 nowadays". The exact CL is unverified.

Firefox has two independent limits: a 32,767 per-dimension cap "inherited from some of the 3rd party libraries we use internally to render content", and a byte allocation cap `gfx.max-alloc-size`, historically 500,000,000 bytes and raised to `INT32_MAX` (2,147,483,647) in bug 1759728, verified fixed in Firefox 112.0a1 on 2023-02-28. Note the dating mismatch: the pref change landed in Firefox 112 but community tables attribute the larger area to "Firefox 122+". Prefer the source-plus-bug chain.

WebKit used to limit canvas memory rather than area: `maxActivePixelMemory()` returned `ramSize() / 4` on iOS and `max(ramSize() / 4, 2151 MB)` elsewhere, producing the familiar "Total canvas memory use exceeds the maximum limit (X MB)" console warning. That limit was removed in commit 6bd11f3 (2023-06-29) because "pages that use a lot of transient canvas memory can hit our artificial limits even when they are no longer referencing canvases". Current WebKit limits area only.

Derived arithmetic, at 4 bytes per pixel: at 104,000 px wide the maximum height allowed by area alone would be 2,581 px on Chrome, Edge and macOS Safari, 5,162 px on Firefox 112+, and 645 px on iOS Safari 17.4+. Even ignoring the per-side cap, one row of 100 racks at full rack height does not fit; 104,000 x 2,000 would be 208 Mpx, about 832 MB of bitmap.

MDN no longer publishes a table, stating only that "While in most cases the maximum dimensions exceed 10,000 x 10,000 pixels, notably iOS devices limit the canvas size to only 4,096 x 4,096 pixels" and "Exceeding the maximum dimensions or area renders the canvas unusable, drawing commands will not work." MDN's old Firefox area figure of 472,907,776 is not trustworthy; mdn/content issue 9379 argued it was wrong and the table was subsequently removed.

The `jhildenbiddle/canvas-size` project publishes a community-measured table (Chrome 73+ desktop 65,535 side and 16,384 x 16,384 area; Firefox 122+ 32,767 side and 23,168 x 23,168 area; Mobile Safari 9+ 4,096 x 4,096 area). It is explicitly community-measured with the caveat that "Results may vary based on hardware and operating system"; its Mobile Safari row predates the 2024 iOS bump to 8192 x 8192.

### 5.2 What happens on overflow

No browser throws when you create an oversized canvas. Failures are silent or deferred.

- Chromium: `toDataURL` returns the literal string `"data:,"` when the canvas is not paintable; `toBlob` invokes the callback with a null blob. MDN confirms: "If the height or width of the canvas is 0 or larger than the maximum canvas size, the string `data:,` is returned", and for toBlob "null may be passed if the image cannot be created for any reason". Rackula's current export surfaces this as "Failed to create blob".
- WebKit: a one-time console warning "Canvas area exceeds the maximum limit (width * height > N)." and `validateArea()` returning false. Observed behaviour differs between platforms: iOS Safari refuses to give a rendering context, while macOS Safari may allow creation then throw `InvalidStateError` from `getImageData`.
- Firefox: historically threw from drawing calls rather than clamping (`ctx.scale()` raising `NS_ERROR_FAILURE` above 32,767), fixed in Firefox 63 by pre-clamping.
- The general problem, from the canvas-size docs: "browsers do not provide a way to determine what their limitations are, nor do they provide any kind of feedback after an unusable canvas has been created." You must feature-detect by probing, not catch an error. geOps documents abandoning a hand-rolled binary-search probe because it failed on iOS, switching to the `canvas-size` package, and caching the result in localStorage because probing is expensive.

OffscreenCanvas in Chromium inherits the same limits by code sharing: `OffscreenCanvas` subclasses `CanvasRenderingContextHost`, which carries `IsValidImageSize()` with both constants, and `offscreen_canvas.cc` does not re-check size. Firefox and WebKit parity is inferred from shared layering, not tested: unverified. Nothing in the HTML spec grants OffscreenCanvas larger bitmaps.

### 5.3 Workarounds

Tiling. SnapDOM's tiled rasterisation is the clearest worked example: it states "A common practical ceiling is 16,384 pixels on one side, with an area limit as well; the exact failure point varies by engine and machine", then rewrites the serialised SVG's root `width`, `height` and `viewBox` to describe only the requested window before `Image.decode()`, rasterises each tile into its own canvas (default 2048 x 2048 times scale and DPR), and delivers tiles through a sequential callback so canvases are not retained. The warning that matters: "Stitching the tiles back into one giant canvas recreates the original problem." Deliver N images, a ZIP, or a multi-page PDF; do not re-merge in the browser. html2canvas issue 1210 is the standing request for exactly this and it is still not built in.

Multi-page PDF. The PDF page size limit, per the Adobe PDF 1.7 reference: "In Acrobat versions 5.0 and later, the minimum allowed page size is 3 by 3 units (approximately 0.04 by 0.04 inch); the maximum is 14,400 by 14,400 units (200 by 200 inches)." PDF 1.6 added `/UserUnit`, and Acrobat 7.0 supports a maximum UserUnit of 75,000, giving a theoretical maximum dimension of 15,000,000 inches. Viewer behaviour differs: Acrobat enforces the cap, macOS Preview ignores `UserUnit` and accepts arbitrary MediaBox values. jsPDF hard-clamps, warning "A page in a PDF can not be wider or taller than 14400 userUnit. jsPDF limits the width/height to 14400" and applying `Math.min(14400, ...)` in `beginPage`; it does not implement `/UserUnit`, and the clamp-but-still-draw failure mode (content overflows and is cropped) is a reported bug. pdf-lib appears to write whatever MediaBox you give it with no enforced limit: unverified, and Acrobat will still complain "The dimensions of this page are out-of-range. Page content might be truncated."

Arithmetic for our case: 104,000 px at 72 dpi is 1,444 inches, about 7.2x over the 200-inch page limit. One rack per page, or a handful per page, stays inside 14,400 units with no UserUnit trickery.

SVG export. There is no size limit in the SVG specification; SVG 1.1 requires numbers to support at least single precision (range about -3.4e38 to +3.4e38), and integers are exact to 16,777,216, so 104,000 is trivially in range. The browser layout ceiling is separate and far away: Blink stores layout in fixed point with 6 fractional bits, so `LayoutUnit` maxes around 33,554,432 px. Expect scroll and paint cost, not a hard failure. The trap is that an SVG only stays cheap while it stays vector; the moment you rasterise it you are back inside section 5.1, which is exactly why SnapDOM windows the SVG before decode. Desktop editors are a different story: Illustrator's normal maximum artboard is widely reported as 227.54 inches (16,384 pt) with a 10x "large canvas" mode, though Adobe's own help page returned 403 and the figure is unverified; large SVGs are also reported as practically uneditable in Inkscape and Illustrator because of element count.

Per-rack export is the established pattern. NetBox renders elevations as SVG per rack per face via `GET /api/dcim/racks/<id>/elevation/?render=svg&face=rear&unit_width=300&unit_height=35`, introduced in NetBox v2.7 (2020-01-16), and has no endpoint that renders a whole row as one image. Whether Visio tooling defaults to one rack per page is unverified.

Print. Browser print pagination is vertical, so wide content is clipped at the right edge or must be scaled down; the standard remedies are landscape, reduced margins, a scale percentage, or "fit to printable area". Fixed overflow containers and floats are common causes of truncated print output. Chrome DevTools Protocol `Page.printToPDF` takes `paperWidth` and `paperHeight` in inches (defaults 8.5 x 11) and documents no maximum, though extreme small values are known to crash the tab; whatever Chrome emits, the consuming viewer still applies the 200-inch rule. One rack per portrait sheet is the shape that survives both the PDF page limit and the print pipeline.

---

## What this suggests for Rackula

- Raise `MAX_RACKS` to something like 100 but do not make it a silent hard wall. Every product surveyed that ships a hard cap pairs it with a single enforcement gate plus a named, actionable message, and tldraw's issue 5781 shows that any creation path bypassing the gate becomes a crash rather than a toast (section 3.2).
- Do not refuse to open an over-budget file. Zero of ten products surveyed block the open; the universal pattern is load, tell the user, and disable only "add more" while read, view and delete keep working. Figma's Recovery Mode and Notion's "You won't be able to add new rows" are the models; Google Sheets' silent cell-dropping on Excel import and Excalidraw's silently-stops-saving are the anti-patterns (section 3.1, 3.3).
- Prefer a two-tier soft model over one number. Miro (degrade from 1,000, recommend under 5,000, ceiling 100,000) and Figma (alert at 90%, lock at 100%) both warn well before they act. A warning threshold well below the refusal threshold matches the field (section 3.3).
- If a multi-axis budget is used, follow GitHub and Notion rather than Mermaid: several independently named budgets, each with its own threshold and its own message naming the current value, the limit and the escape hatch. One opaque composite score over racks, devices, ports and connections gives the user nothing to act on (section 3.4).
- Measure `text-rendering: geometricPrecision` on the U-number labels before doing anything structural. Blink's `ComputeNewScaledFontForStyle` returns a scaling factor of 1 for that value, short-circuiting the screen-CTM-dependent font recomputation that is the most likely cause of our 2,603 ms zoom layout. The caveat is real: Gecko treats the value as `optimizeLegibility`, so Firefox could get worse (section 2.1).
- Collapse rail holes and grid lines into `<pattern>` fills, not `<use>` instances. A pattern is a paint server and is painted per tile; `<use>` clones the referenced subtree into a shadow root and creates layout objects per instance, so it saves markup but not layout (section 2.4).
- Level of detail is the technique with the best measured evidence for a layout-bound cost. JointJS measured 71 ms, 191 ms and 302 ms of layout for block, chip and card levels on the same scene, and yWorks states the rule as "text rendering is omitted as soon as the short text becomes unreadable". Quantise zoom into three tiers before it reaches per-rack components, and add hysteresis at the thresholds (section 2.3).
- Expose fidelity as a user control too, not only as a zoom side effect. NetBox's "Images and Labels / Images only / Labels only" select on the multi-rack view is the direct precedent, and it lets a user who needs 100 racks visible choose to pay for it (section 1.2).
- If culling is added, cull by hiding rather than unmounting, and keep two separate concepts. tldraw hides with `display: none` because "culled shapes stay in the DOM"; React Flow's unmount-style `onlyRenderVisibleElements` "adds an overhead", re-initialises on reappearance, and has a trail of bugs. In Svelte, a keyed `{#each}` recreates DOM from scratch on key change. Also note tldraw's "Back to content" bug: do not use the culled set to answer geometric questions (section 2.2).
- Budget for the accessibility cost of any virtualisation. Rackula currently makes every rack a listitem, every device a button and every port `tabindex="0"`; `display: none` removes elements from the accessibility tree, and virtualised content is documented to break screen reader virtual buffers. A roving tabindex over racks, with ports reachable only within the focused rack, is the standard answer (section 2.2).
- Adopt a flat grouping axis, not a deeper tree. NetBox removed `RackGroup` in v2.11 and reintroduced it in v4.6 precisely to give "a lightweight secondary axis of rack organization (e.g. by row or aisle) that is independent of the location hierarchy", stating "Rack groups are flat and do not form a hierarchy". RackTables and openDCIM both model a row as a first-class level. No surveyed tool models a pod or a hall (section 1.2, 1.9).
- Consider a selection-scoped or filter-scoped canvas as the cheap path to 100 racks. Device42's "Show Front Layout of selected racks" and Sunbird's Isolate both make the expensive view a function of an explicit selection, which lifts the model cap without a virtualisation rewrite. NetBox reaches its elevation gallery as a filtered URL, not a separate screen (section 1.5, 1.6, 1.2).
- For an overview of all 100 racks, follow RackTables: a cached low-fidelity per-rack representation, invalidated on mutation of that rack, wrapped into a grid, with the real elevation only on drill-in. Rackula can do this client-side with `createImageBitmap` or an offscreen canvas rather than a database blob (section 1.4, 2.8).
- Move the server PUT cap before anything else ships. Our 100-rack files are 1.5 to 2.0 MB against a hard-coded 1 MB server body cap, while Cloudflare's own zone limit is 100 MB even on Free and R2 objects go to 5 TiB. Cloudflare is not the constraint; our own constant is (section 4.4).
- Stop treating localStorage as viable at this size. Chrome charges 2 bytes per character against a 10,485,760-byte counter, so a 2.0 MB ASCII layout consumes 4 MB and two layouts nearly exhaust the origin; Safari additionally deletes script-writable storage after seven days of browser use without interaction. IndexedDB or OPFS with `navigator.storage.persist()` is the correct home, and OPFS sync access handles keep a 2 MB write off the main thread (section 4.1, 4.2).
- Accept that full layouts cannot travel in a URL at this size, and make the fallback explicit. Even at 20:1 compression plus base64, 2 MB lands near 133 KB, over 40x Cloudflare's 16 KB URL limit and over 40x the 2,953-byte QR level-L ceiling. The existing 1800-character warning and file-download fallback is the right shape; a server-stored short id is the only design that scales (section 4.3, 4.5).
- Default composite PNG export to per-rack or paged output above some rack count. 104,000 px exceeds every browser's per-side cap (Chrome 65,535, Firefox 32,767 before 149), and toDataURL silently returns `"data:,"` while toBlob returns null rather than throwing. 1,444 inches is also 7.2x the 14,400-unit PDF page limit that jsPDF clamps to. NetBox's one-rack-one-SVG endpoint is the precedent, and Rackula already has unused per-rack ZIP and multi-page PDF code paths (section 5.1, 5.2, 5.3).
- Feature-detect the canvas ceiling rather than catching an error, and cache the result. Browsers give no API for their limits and no feedback on failure; geOps documents probing with the `canvas-size` package and caching the answer because probing is expensive (section 5.2).

---

## Sources

### Section 1: how other tools present hundreds of racks

NetBox: https://github.com/netbox-community/netbox/blob/main/netbox/dcim/models/racks.py, https://github.com/netbox-community/netbox/blob/main/netbox/dcim/models/sites.py, https://github.com/netbox-community/netbox/blob/main/netbox/dcim/views.py, https://github.com/netbox-community/netbox/blob/main/netbox/dcim/urls.py, https://github.com/netbox-community/netbox/blob/main/netbox/dcim/api/views.py, https://github.com/netbox-community/netbox/blob/main/netbox/dcim/api/serializers_/racks.py, https://github.com/netbox-community/netbox/blob/main/netbox/dcim/svg/racks.py, https://github.com/netbox-community/netbox/blob/main/netbox/dcim/tables/template_code.py, https://github.com/netbox-community/netbox/blob/main/netbox/dcim/migrations/0228_rack_group.py, https://github.com/netbox-community/netbox/blob/main/netbox/netbox/config/parameters.py, https://github.com/netbox-community/netbox/blob/main/netbox/netbox/models/__init__.py, https://github.com/netbox-community/netbox/blob/main/netbox/utilities/paginator.py, https://github.com/netbox-community/netbox/blob/main/netbox/templates/dcim/rack_elevation_list.html, https://github.com/netbox-community/netbox/blob/main/netbox/release.yaml, https://github.com/netbox-community/netbox/blob/main/docs/models/dcim/rack.md, https://github.com/netbox-community/netbox/blob/main/docs/models/dcim/rackgroup.md, https://github.com/netbox-community/netbox/blob/main/docs/models/dcim/location.md, https://github.com/netbox-community/netbox/blob/main/docs/release-notes/version-4.6.md, https://github.com/netbox-community/netbox/blob/main/docs/configuration/default-values.md, https://netboxlabs.com/docs/netbox/configuration/miscellaneous/, https://netboxlabs.com/docs/netbox/models/dcim/rack/, https://netboxlabs.com/docs/netbox/models/dcim/location/

openDCIM: https://github.com/opendcim/openDCIM/blob/master/create.sql, https://github.com/opendcim/openDCIM/blob/master/rowview.php, https://github.com/opendcim/openDCIM/blob/master/cabnavigator.php, https://github.com/opendcim/openDCIM/blob/master/mapmaker.php, https://github.com/opendcim/openDCIM/blob/master/zone.php, https://github.com/opendcim/openDCIM/blob/master/bulk_cabinet.php, https://github.com/opendcim/openDCIM/blob/master/sidebar.inc.php, https://wiki.opendcim.org/wiki/index.php/Map_Navigation, https://wiki.opendcim.org/wiki/index.php/FloorPlan

RackTables: https://github.com/RackTables/racktables/blob/master/wwwroot/inc/install.php, https://github.com/RackTables/racktables/blob/master/wwwroot/inc/interface.php, https://github.com/RackTables/racktables/blob/master/wwwroot/inc/database.php, https://github.com/RackTables/racktables/blob/master/wwwroot/inc/solutions.php, https://github.com/RackTables/racktables/blob/master/tests/RackspaceFunctionsTest.php, https://wiki.racktables.org/index.php/RackTablesUserGuide

Device42: https://docs.device42.com/infrastructure-management/buildings-rooms-and-racks/, https://docs.device42.com/infrastructure-management/buildings-rooms-and-racks/racks/, https://docs.device42.com/infrastructure-management/buildings-rooms-and-racks/buildings-and-rooms/

Sunbird dcTrack: https://www.sunbirddcim.com/help/dcTrack/v600/en/Content/dcTrack/Use_Cabinet_Elevations_in_the_Web_Client_and_Classic.htm, https://www.sunbirddcim.com/screen-shots/multi-select-cabinet-elevation-views-any-site-and-row, https://info2.sunbirddcim.com/rack-elevation-software-2/, https://s3.amazonaws.com/dcTrack.Docs/dcTrack_6.0.3_GA/dcTrack_6.0.3_User_Guide.pdf

Hyperview: https://docs.hyperviewhq.com/user-guide/quickstart/index.html, https://docs.hyperviewhq.com/user-guide/layout-management/index.html, https://docs.hyperviewhq.com/user-guide/layout-management/topics/location-layouts.html, https://docs.hyperviewhq.com/product/asset-management/topics/supported-asset-types.html

draw.io and Visio: https://www.drawio.com/docs/diagram-types/rack-diagrams/, https://www.drawio.com/blog/rack-diagrams, https://www.drawio.com/docs/manual/pages/, https://www.drawio.com/doc/faq/page-add, https://github.com/jgraph/drawio, https://support.microsoft.com/en-us/visio/create-a-rack-diagram, https://www.microsoft.com/en-us/download/details.aspx?id=4604, https://www.drawio.com/docs/manual/editor/panels/, https://drawio-app.com/blog/simplify-diagram-navigation-in-draw-io/

Data centre terminology: https://en.wikipedia.org/wiki/TIA-942, https://www.bradyid.com/resources/articles/tia-942-data-center-standard, https://anvilfield.com/field-guides/datacenter/data-center-white-space-gray-space-layout/

### Section 2: large-scene rendering and zoom in the browser

SVG text and Blink internals: https://chromium.googlesource.com/chromium/src/+/refs/heads/main/third_party/blink/renderer/core/layout/svg/layout_svg_inline_text.cc, https://chromium.googlesource.com/chromium/src/+/94ccfef1071cee24bbe7125d79704a504c41106a/third_party/WebKit/Source/core/layout/svg/LayoutSVGInlineText.cpp, https://developer.mozilla.org/en-US/docs/Web/CSS/text-rendering, https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/shape-rendering, https://oreillymedia.github.io/Using_SVG/extras/ch19-performance.html, https://medium.com/@romainguy/androids-font-renderer-c368bbde87d9, https://sozi.baierouge.fr/pages/tutorial-performance.html, https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/text

Culling and virtualisation: https://tldraw.dev/sdk-features/culling, https://tldraw.dev/sdk-features/visibility, https://tldraw.dev/blog/back-to-content, https://reactflow.dev/api-reference/react-flow, https://reactflow.dev/learn/advanced-use/performance, https://github.com/xyflow/xyflow/issues/3883, https://github.com/xyflow/xyflow/issues/4064, https://github.com/xyflow/xyflow/issues/4516, https://github.com/wbkd/react-flow/issues/1589, https://github.com/wbkd/react-flow/issues/967, https://deepwiki.com/excalidraw/excalidraw/5.1-canvas-rendering-pipeline, https://github.com/excalidraw/excalidraw/issues/7280, https://github.com/excalidraw/excalidraw/issues/2222, https://github.com/mourner/rbush, https://github.com/sveltejs/svelte/issues/18120

Level of detail: https://github.com/clientIO/joint-demos/pull/62, https://www.jointjs.com/blog/jointjs-performance-overview-testing-diagrams-with-100-000-nodes, https://www.yfiles.com/resources/how-to/level-of-detail-for-large-diagrams, https://en.wikipedia.org/wiki/Level_of_detail_(computer_graphics)

Geometry reuse: https://svgwg.org/svg2-draft/pservers.html, https://cloudfour.com/thinks/svg-icon-stress-test/, https://bitcrowd.dev/optimizing-svgs-with-patterns-and-symbols/, https://bugzilla.mozilla.org/show_bug.cgi?id=1450250, https://css-tricks.com/too-many-svgs-clogging-up-your-markup-try-use/, https://github.com/dagster-io/dagster/pull/224, https://groups.google.com/g/mozilla.dev.tech.svg/c/l6bYdF9E_6w

Containment, transforms and compositing: https://github.com/w3c/csswg-drafts/issues/9466, https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/content-visibility, https://www.crmarsh.com/svg-performance/, https://web.dev/articles/stick-to-compositor-only-properties-and-manage-layer-count, https://www.w3.org/Graphics/SVG/WG/wiki/Proposals/Performance_in_panning_&_zooming

Rasterisation and renderer choice: https://jakearchibald.com/2017/lazy-async-svg/, https://felt.com/blog/from-svg-to-canvas-part-1-making-felt-faster, https://snapdom.dev/blog/huge-page-mosaic/, https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas, https://www.jointjs.com/blog/svg-versus-canvas, https://apexcharts.com/blog/svg-vs-canvas-charts/, https://github.com/jgraph/mxgraph/issues/265, https://groups.google.com/g/drawio/c/RKNBCRn6Yu0, https://github.com/openseadragon/svg-overlay/issues/15, https://pixijs.com/8.x/guides/components/renderers

DOM size, scheduling and accessibility: https://developer.chrome.com/docs/lighthouse/performance/dom-size, https://web.dev/articles/dom-size-and-interactivity, https://developer.mozilla.org/en-US/docs/Web/API/Scheduler/yield, https://developer.chrome.com/blog/use-scheduler-yield, https://a11y-solutions.stevenwoodson.com/solutions/focus/roving-focus/, https://webaim.org/techniques/keyboard/

### Section 3: cap and limit models in comparable products

tldraw: https://github.com/tldraw/tldraw/blob/main/packages/editor/src/lib/options.ts, https://github.com/tldraw/tldraw/pull/3716, https://github.com/tldraw/tldraw/issues/5781, https://github.com/tldraw/tldraw/pull/9297, https://github.com/tldraw/tldraw/blob/main/apps/docs/content/sdk-features/pages.mdx, https://tldraw.dev/sdk-features/performance, https://tldraw.dev/sdk-features/options

Figma: https://help.figma.com/hc/en-us/articles/360040528173-Reduce-memory-usage-in-files, https://forum.figma.com/product-updates-3/recovery-out-of-memory-files-with-recovery-mode-27916, https://forum.figma.com/ask-the-community-7/file-out-of-memory-not-be-able-to-open-30527

Miro: https://help.miro.com/hc/en-us/articles/360013588560-Board-performance-and-loading-issues, https://community.miro.com/ask-the-community-45/maximum-miro-board-size-limits-to-be-performant-1920

Lucidchart: https://community.lucid.co/product-questions-3/lucidchart-free-plan-60-shape-restriction-122, https://community.lucid.co/product-questions-3/shape-limit-in-lucidchart-10624, https://community.lucid.co/product-questions-3/do-lose-access-to-documents-or-editing-ability-after-lucidchart-free-trial-ends-261

Excalidraw: https://github.com/excalidraw/excalidraw/issues/711, https://github.com/excalidraw/excalidraw/issues/8395, https://github.com/excalidraw/excalidraw/issues/8411, https://github.com/excalidraw/excalidraw/pull/8890, https://github.com/excalidraw/excalidraw/issues/10101

Row and complexity budgets: https://support.airtable.com/articles/2277136852-airtable-plans-overview, https://support.airtable.com/articles/4087973664-adding-duplicating-and-deleting-airtable-records, https://www.notion.com/help/optimize-database-load-times-and-performance, https://support.google.com/drive/answer/37603, https://mermaid.js.org/config/schema-docs/config.html, https://github.com/mermaid-js/mermaid/pull/5086, https://github.com/mermaid-js/mermaid/issues/8260, https://github.com/mermaid-js/mermaid/issues/8262, https://docs.github.com/en/enterprise-server@3.19/repositories/creating-and-managing-repositories/repository-limits, https://docs.github.com/en/rest/pulls/pulls, https://learn.microsoft.com/en-us/answers/questions/5447013/how-many-maximum-shapes-can-a-page-in-visio-have

### Section 4: data and transport limits

localStorage: https://github.com/chromium/chromium/blob/main/third_party/blink/public/mojom/dom_storage/storage_area.mojom, https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/modules/storage/storage_area_map.cc, https://bugzilla.mozilla.org/show_bug.cgi?id=1429788, https://bugzilla.mozilla.org/show_bug.cgi?id=461684, https://lists.w3.org/Archives/Public/public-webapps-github/2017Oct/0861.html, https://github.com/WebKit/WebKit/blob/main/Source/WebCore/storage/StorageMap.cpp, https://github.com/WebKit/WebKit/blob/main/Source/WTF/wtf/text/WTFString.h, https://github.com/WebKit/WebKit/blob/main/Source/WebCore/page/Settings.yaml, https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/, https://html.spec.whatwg.org/multipage/webstorage.html

Quota, IndexedDB and OPFS: https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria, https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/estimate, https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system, https://webkit.org/blog/14403/updates-to-storage-policy/, https://web.dev/articles/storage-for-the-web, https://developer.chrome.com/blog/estimating-available-storage-space/, https://bugs.webkit.org/show_bug.cgi?id=209563

URLs, QR and transport: https://chromium.googlesource.com/chromium/src/+/master/docs/security/url_display_guidelines/url_display_guidelines.md, https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Fragment, https://bugzilla.mozilla.org/show_bug.cgi?id=1741426, https://support.microsoft.com/en-us/help/208427/maximum-url-length-is-2,083-characters-in-internet-explorer, https://developers.cloudflare.com/fundamentals/reference/connection-limits/, https://developers.cloudflare.com/changelog/post/2025-10-16-header-limit-increase/, http://nginx.org/en/docs/http/ngx_http_core_module.html#large_client_header_buffers, https://www.ietf.org/rfc/rfc7230.html, https://docs.slack.dev/changelog/2018-truncating-really-long-messages/, https://github.com/backnotprop/plannotator/issues/187, https://www.thonky.com/qr-code-tutorial/character-capacities, https://en.wikipedia.org/wiki/QR_code, https://www.qrcode.com/en/about/version.html

Cloudflare Workers and R2: https://developers.cloudflare.com/workers/platform/limits/, https://developers.cloudflare.com/changelog/post/2026-09-04-enterprise-self-serve-upload-limits/, https://developers.cloudflare.com/support/troubleshooting/http-status-codes/4xx-client-error/error-413, https://developers.cloudflare.com/r2/platform/limits/, https://developers.cloudflare.com/r2/objects/multipart-objects/, https://developers.cloudflare.com/kv/platform/limits/

Compression and YAML: https://github.com/mdn/browser-compat-data/blob/main/api/CompressionStream.json, https://caniuse.com/mdn-api_compressionstream_compressionstream_deflate-raw, https://developer.mozilla.org/en-US/docs/Web/API/CompressionStream/CompressionStream, https://web.dev/blog/compressionstreams, https://lemire.me/blog/2021/06/30/compressing-json-gzip-vs-zstd/, https://github.com/nodeca/js-yaml/blob/master/CHANGELOG.md, https://github.com/nodeca/js-yaml/blob/master/docs/safety.md, https://github.com/nodeca/js-yaml/issues/362, https://github.com/eemeli/yaml/discussions/358

### Section 5: raster and export limits

Canvas limits: https://chromium.googlesource.com/chromium/src/third_party/+/refs/heads/main/blink/renderer/core/html/canvas/canvas_rendering_context_host.cc, https://chromium.googlesource.com/chromium/src/third_party/+/refs/heads/main/blink/renderer/core/html/canvas/html_canvas_element.cc, https://chromium.googlesource.com/chromium/src/third_party/+/refs/heads/main/blink/renderer/core/offscreencanvas/offscreen_canvas.h, https://chromium.googlesource.com/chromium/blink/+/master/Source/core/html/HTMLCanvasElement.cpp, https://issues.chromium.org/issues/40349850, https://bugzilla.mozilla.org/show_bug.cgi?id=1282074, https://bugzilla.mozilla.org/show_bug.cgi?id=1759728, https://bugzilla.mozilla.org/show_bug.cgi?id=1911583, https://bugzilla.mozilla.org/show_bug.cgi?id=1485730, https://raw.githubusercontent.com/WebKit/WebKit/main/Source/WebCore/html/CanvasBase.cpp, https://github.com/WebKit/WebKit/commit/6bd11f3792f05b4e58e5647bf173212879fa62cc, https://github.com/jhildenbiddle/canvas-size, https://github.com/jhildenbiddle/canvas-size/issues/2, https://github.com/mdn/content/issues/9379, https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/canvas

Overflow behaviour: https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toDataURL, https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob, https://pqina.nl/blog/canvas-area-exceeds-the-maximum-limit/, https://pqina.nl/blog/total-canvas-memory-use-exceeds-the-maximum-limit/, https://developer.apple.com/forums/thread/112218, https://geops.com/en/blog/html-canvas-for-raster-exports

Export workarounds: https://snapdom.dev/blog/huge-page-mosaic/, https://github.com/niklasvh/html2canvas/issues/1210, https://alexwlchan.net/2024/big-pdf/, https://kb.datalogics.com/article/how-large-can-a-pdf-document-be-in-inches-101.html, https://github.com/parallax/jsPDF/issues/3829, https://github.com/parallax/jsPDF/issues/3120, https://www.w3.org/Graphics/SVG/1.1/types.html, https://oreillymedia.github.io/Using_SVG/extras/ch08-precision.html, https://chromium.googlesource.com/chromium/src/third_party/+/refs/heads/main/blink/renderer/platform/geometry/layout_unit.h, https://netboxlabs.com/docs/netbox/en/stable/release-notes/version-2.7/, https://chromedevtools.github.io/devtools-protocol/tot/Page/
