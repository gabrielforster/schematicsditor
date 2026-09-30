# Litematica Schematic Editor — Design

Date: 2026-09-29
Status: Draft (awaiting review)

## 1. Goal

A static web app where a player drops in a `.litematic` file (Litematica mod), previews it in 3D, inspects it (layer-by-layer view, material list), bulk-edits it (replace blocks, family swap), and downloads a valid `.litematic` that loads back into Litematica.

**Primary jobs**
1. Block swapping / cleanup — bulk find-and-replace, re-export.
2. Inspection / planning — layer view, material list, locating blocks.

**Non-goals (v1)**
- Per-block building tools (place/break individual blocks, copy/paste regions).
- Formats other than `.litematic` (Sponge `.schem`, vanilla `.nbt`, legacy `.schematic`). The core must not preclude adding `.schem`/`.nbt` later.
- Minecraft versions before 1.13 (numeric block IDs).
- Regenerating the Litematica preview image.
- Drag-handle gizmos for box selection.
- Desktop app or backend of any kind.

**Success criteria**
- An edited file loads correctly in Litematica.
- Unknown / unmodified data survives a read → write round trip unchanged.
- Schematics up to ~50M blocks (bounding volume) open and remain usable without freezing the tab (rendering may be progressive/slower).

## 2. Platform & stack

- Static web app: TypeScript + Vite + React. No backend.
- Three.js for rendering; deepslate for NBT I/O and block model resolution.
- Hosted on GitHub Pages via a GitHub Action.

## 3. Architecture

```
src/
  core/            pure TS, no DOM/Three — unit-tested in Node
    nbt/           thin wrapper over deepslate NBT (gzip in/out)
    litematic/     read(bytes) → Schematic, write(Schematic) → bytes
    model/         Schematic, Region, BlockState, Palette
    edit/          replace, family swap, scopes, undo stack
    families/      curated wood/stone/color families (JSON + loader)
    materials/     block → item counts, stacks/shulkers, CSV
  render/          Three.js scene, camera, chunk manager, selection & layer clipping
    workers/       mesh workers (textured mesher, colored mesher)
    assets/        mcmeta asset loader + deepslate model resolution + cache
  ui/              React: top bar, region panel, selection panel, replace dialog, family swap, material list
  workers/         parse worker (gunzip + NBT + unpack off main thread)
scripts/           build-time generation (colored palette, block list validation)
```

Boundaries:
- `core` knows nothing about rendering or the DOM.
- `render` reads the model and subscribes to change events (`{ regionId, dirtyChunks | paletteChange }`); it never mutates the model.
- `ui` calls `core/edit` operations and `render` view controls.

## 4. Data model

- **BlockState**: `name` + sorted properties map. Canonical key string, e.g. `minecraft:oak_stairs[facing=north,half=top]`.
- **Region**:
  - `name`, `position`, `size` — size normalized to positive; Litematica's negative sizes are converted by shifting position to the minimum corner. The model is normalized in memory, but the file's original Position/Size are kept (`fileBox`) and written back unchanged, because Litematica stores entity positions relative to the raw Position, not the normalized min corner. Regions without an original box (e.g. constructed in memory) are written normalized.
  - `palette: BlockState[]`
  - `blocks: Uint16Array` of palette indices (`Uint32Array` if palette > 65,535).
  - Index order matches Litematica: `index = y*sizeX*sizeZ + z*sizeX + x`.
  - `tileEntities` indexed by position; `entities`, pending block/fluid ticks passed through untouched.
  - Unknown region-level tags preserved verbatim.
- **Schematic**: metadata (Name, Author, Description, TimeCreated, TimeModified, preview image, etc.), regions list, `MinecraftDataVersion`, `Version`/`SubVersion`, and unknown root tags preserved verbatim.

## 5. File I/O

**Read**
1. Gunzip + parse NBT (in the parse worker).
2. For each region, unpack the `BlockStates` long array into the typed array. Litematica's packing allows values to span two longs; `bits = max(2, ceil(log2(paletteSize)))`.
3. Transfer typed arrays to the main thread (Transferable, zero-copy).

**Write**
1. Compact unused palette entries and remap indices.
2. Repack into long arrays with Litematica's spanning bit layout.
3. Recompute metadata: `TotalBlocks` (non-air), `TotalVolume`, `EnclosingSize`, `RegionCount`, `TimeModified`. Preserve `MinecraftDataVersion` and `Version`.
4. Keep the existing preview image.
5. **Round-trip guard**: re-read the produced bytes and compare to the in-memory model (palette, blocks, metadata). On mismatch, block the download and show an error.

**Version handling**
- `MinecraftDataVersion` < 1.13 → reject with explanation.
- Newer than the newest known mcmeta version → load with latest assets and show a warning.

## 6. Threading

- **Parse worker**: decode large files off the main thread.
- **Edits on main thread**: operate directly on typed arrays. A full scan of 50M `Uint16` entries is ~100ms. Unscoped replaces are palette-only rewrites (near-free).
- **Mesh worker pool** (size = `navigator.hardwareConcurrency`): receives copies of 16³ chunk slices plus a 1-block border (for cross-chunk culling), returns vertex/index buffers as Transferables.

## 7. Undo / redo

- Unscoped (palette) replace: store palette diff only.
- Scoped replace: store `(indices: Uint32Array, oldValues: Uint16Array|Uint32Array)` plus any palette additions and removed tile entities.
- Family swap = one compound history entry.
- History capped at ~256MB; oldest entries evicted first.

## 8. Rendering

### 8.1 Modes (user toggle)
- **Textured** (default): real block models and textures.
- **Colored**: solid cubes, per-block average texture color.

### 8.2 Assets (textured mode)
- Fetched at runtime from `misode/mcmeta` GitHub branches (blockstates, models, texture atlas), choosing the version matching the file's `MinecraftDataVersion`, falling back to the newest release.
- Resolved to model elements and UVs via deepslate.
- Cached with the browser Cache API.
- On fetch failure: auto-switch to colored mode, show a notice with a retry button.

### 8.3 Colored palette
- Generated at build time by a script from mcmeta textures (block name → average RGB), bundled as JSON. Colored mode works fully offline.
- Missing entries: stable hash-derived color.

### 8.4 Chunk meshing
- Chunk size 16³. Each chunk yields an opaque mesh and a transparent mesh (glass, water, leaves, ice, etc.); transparent drawn after opaque with depth-write off.
- Face culling: skip faces adjacent to opaque full cubes; skip faces between identical transparent blocks.
- Opaque/full-cube knowledge: from deepslate model data (textured) or a bundled list (colored).
- Colored mesher emits cubes for every non-air block. Textured mesher emits model elements with blockstate rotations.
- Scheduling: nearest-to-camera chunks first; progressive appearance.
- For regions > ~5M blocks volume, suggest (not force) colored mode.
- Unknown blocks: magenta cube in both modes.

### 8.5 Layer view
- Y-range slider + single-layer toggle; ↑/↓ steps layers.
- Visible Y range is an input to the mesher, so cut faces render solid.
- On range change, only chunks intersecting the new boundary are remeshed.
- Single-layer mode draws the layer below faded (ghost).

### 8.6 Interaction
- **Picking**: voxel DDA raycast against the model grid (not meshes). Hover tooltip shows block state and coordinates. Alt+click = eyedropper into the replace dialog's "from" field.
- **Box selection**: click two corner blocks → wireframe box; min/max coordinates editable numerically.
- **Highlight**: clicking a material list row highlights matching blocks and fades the others (remesh with a highlight set).
- **Camera**: orbit/pan/zoom, fit-to-view, optional WASD fly mode.
- **Regions**: each region is its own set of chunk meshes at its offset; show/hide per region.

### 8.7 Incremental updates
- Edits emit dirty chunk sets; only those remesh.
- Palette-level edits remesh chunks containing affected palette indices.

## 9. Editing

### 9.1 Replace
- **From**: searchable block picker; one or more matchers, each one of:
  - exact state (`oak_stairs[facing=north]`),
  - any state of a block (`oak_stairs`),
  - partial property match (`oak_stairs[half=top]`).
- **To**: searchable picker over all blocks for the file's Minecraft version (from deepslate/mcmeta block data), including air.
  - Property carry-over: copy every property the target block shares with the source state; fill the rest with the target's defaults; explicitly chosen target properties win.
- **Scope**: whole schematic | selected regions | Y range (one click to reuse the layer slider range) | box selection; scopes combine by intersection.
- **Preview**: "N blocks will change" count before applying.
- **Block entities**: warn in preview when replaced blocks carry block entity data; drop that data on apply, except when the target has the same block entity type (e.g. chest ↔ trapped chest, sign ↔ sign variants), where it is kept.
- Delete = replace with air.

### 9.2 Family swap
- Separate tab: source family, target family, scope.
- Families: wood (oak, spruce, birch, jungle, acacia, dark oak, mangrove, cherry, bamboo, crimson, warped, pale oak), stone-likes (stone, cobblestone, stone bricks, deepslate variants, sandstone, blackstone, …), 16 dye colors (wool, concrete, concrete powder, terracotta, glazed terracotta, stained glass/panes, carpet, beds, banners, candles, shulker boxes, …).
- Each family maps shape keys → block names (e.g. `planks, log, stripped_log, wood, stripped_wood, stairs, slab, fence, fence_gate, door, trapdoor, button, pressure_plate, sign, wall_sign, hanging_sign, wall_hanging_sign`).
- A swap = one replace per shape key the two families share, using property carry-over. Shapes without a counterpart are listed as "unmapped" in the preview and left unchanged.
- Family JSON is hand-curated and validated against the block list at build time (test fails on unknown names).

## 10. Material list

- Counts grouped by item, not block state.
- Block→item mapping for special cases (`wall_torch`→`torch`, `redstone_wire`→`redstone`, wall signs → sign, double slab = 2 slabs, door/bed halves counted once, etc.). Fluid sources shown as buckets; itemless blocks (fire, piston heads, portal, …) listed in a separate section.
- Columns: item, count, stacks (64 or 16 per item), shulker boxes (27 stacks). Sortable; search filter.
- Follows the current scope: all | visible layers | box selection.
- CSV export and "copy as text".
- Clicking a row highlights those blocks in the 3D view.
- Unknown blocks listed with an "unknown" marker.

## 11. UI layout

- **Top bar**: Open, Save, Undo/Redo, Textured/Colored toggle, file name/author (editable).
- **Left panel**: Regions (show/hide, block counts), Selection (box coordinates, Y range).
- **Center**: 3D viewport, hover tooltip, stats overlay (blocks, chunks, meshing progress).
- **Right panel**: tabs — Materials | Replace | Family swap.
- **Open**: drag-and-drop anywhere or the Open button. Empty state explains usage and offers a small bundled sample schematic.
- **Save**: download `<name>.litematic`; Ctrl+S.

## 12. Error handling

| Situation | Behavior |
|---|---|
| Not gzip / bad NBT / no `Regions` | Friendly message + collapsible technical details; current schematic stays open |
| Pre-1.13 `MinecraftDataVersion` | Reject with explanation |
| Newer than known mcmeta | Load with latest assets + warning |
| Unknown block names | Preserved and written back as-is; magenta cube; "unknown" in material list; replaceable |
| Asset fetch failure | Auto-switch to colored mode + retry button |
| Mesh worker failure / OOM for a chunk | Red outline on that chunk, error logged, rest keeps rendering |
| Very large file | Warning before loading |
| Round-trip mismatch on save | Block download, show error |

## 13. Testing

- **Core unit tests (Vitest)**: bit pack/unpack (spanning values, 2-bit minimum, large palettes / Uint32 path), negative region sizes, metadata read/write/recompute, property carry-over, scope combinations, undo for palette and scoped edits, family data validation, stack/shulker math, item mapping.
- **Round-trip fixtures**: real `.litematic` files (single-region, multi-region, negative size, with tile entities and entities, several MC versions) through read → write → read with deep equality, including unknown tags. User supplies some files from their game; synthetic fixtures cover edge cases.
- **Meshing tests**: tiny handcrafted chunks (single block, 2×2×2, glass-next-to-glass, a stair) asserting expected face counts and culling.
- **E2E (Playwright), minimal**: load fixture → render → one replace → save → downloaded bytes parse correctly.
- **Manual in-game check**: documented in the README — load an edited file in Litematica and verify.

## 14. Future (explicitly out of v1)

- Sponge `.schem` and vanilla `.nbt` import/export (shared palette model makes this incremental).
- Drag handles for box selection.
- Per-block editing, copy/paste.
- Regenerating the preview image.
