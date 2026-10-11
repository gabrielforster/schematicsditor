# Schematic Editor

A static web app for previewing, inspecting and bulk-editing Litematica `.litematic` schematics.

## Development

```bash
npm install
npm run dev        # dev server
npm test           # unit tests (Vitest)
npm run typecheck
npm run build      # static build in dist/
```

## Round-trip fixtures

Put real `.litematic` files exported from the game in `tests/fixtures/`. Every file there
must survive read → save → read unchanged (`tests/core/litematic/fixtures.test.ts`). Useful
coverage: single region, multiple regions, a region placed with negative size, chests/signs
(tile entities), mobs/item frames (entities), and files from several Minecraft versions.

## Block data

`src/core/registry/blocks.json` (block list, properties, defaults) and `items.json` (item ids)
are snapshots of [misode/mcmeta](https://github.com/misode/mcmeta)'s summary data. To update
them for a new Minecraft release:

```bash
npm run generate:registry -- <version>   # e.g. 26.3; omit for the newest stable release
npm test                                  # family and item-mapping tests flag renamed or new blocks
```

## Colored palette

Colored mode draws every block as a cube in its average texture color, from
`src/render/palette/colors.json`. The file is generated from mcmeta's textures and models
(same source as the block registry) and works offline. Regenerate it after updating the
block registry:

```bash
npm run generate:palette            # the bundled registry's version
npm run generate:palette -- 1.21.4  # a specific version
npm test                            # the palette version must match the registry version
```

Textured mode fetches block models and the texture atlas for the file's Minecraft version
from mcmeta at runtime and keeps them in the browser's Cache API.

## Manual rendering check

After changing anything under `src/render/`, run `npm run dev` and open a schematic that has
glass, water, stairs, leaves, a chest and at least one block from a mod:

1. Textured mode: textures appear after a short colored phase; the mod block is a magenta
   cube; water and stained glass are see-through; no gaps or missing faces between chunks.
2. **Colored**: the same shapes as solid colors; glass and water are translucent.
3. **Layers**: drag **From Y** / **To Y**; cut faces look solid. ↑/↓ moves the range. With
   **Single layer** checked, the layer below shows faded.
4. **Materials**: click the stone row; stone stays solid, everything else fades.
5. **Pick corners**, click two blocks: a yellow box appears and the min/max fields fill in.
   Editing the numbers and clicking **Apply** moves the box.
6. Hovering shows the block state and coordinates next to the pointer.
7. **Replace** `stone` with `gold_block`: the view updates; **Undo** restores it.
8. In DevTools, clear site data and go offline, then reload and open the file: the view
   falls back to colored with a **Retry textures** notice. Go online and click it: textures
   return. Reload offline again: textures load from the cache.
9. **Fly**: WASD, Space and Shift move the camera.

## Manual UI check

After changing anything under `src/ui/` or `src/workers/`, run `npm run dev`:

1. The empty state explains what to do. Drop a `.litematic` file anywhere: a "Drop to open"
   overlay appears, then the schematic opens and the stats overlay counts blocks and chunks.
2. Drop a `.png`: an error explains it is not a Litematica file, **Technical details**
   expands, and the open schematic stays open.
3. **Regions**: unchecking a region hides it; block counts match the schematic info in game.
4. **Materials**: sort by each column, filter, switch the scope to **Visible layers** with a
   Y range set, **Export CSV** downloads a file, **Copy as text** pastes a list.
5. **Replace**: add `oak_stairs` and Alt+click a stone block (its state joins "from"), pick
   `spruce_stairs`, set `half` to `top`, check **Use layer range**: the preview count changes;
   replacing a chest warns that its contents will be dropped. **Replace**, then Ctrl+Z.
6. **Family swap**: Oak → Spruce previews a count and lists unmapped shapes; **Swap** works
   and one Undo reverts it.
7. Rename the schematic in the top bar and press Ctrl+S: `<new name>.litematic` downloads
   without freezing the page, and loads back with the new name.
8. Open a file over 32 MB: a warning asks before reading it. Open one with a region over
   5 million blocks: a notice suggests colored mode.

## Manual in-game check

After changing anything under `src/core/litematic/`:

1. `npm run dev`, open a fixture, click **Save**.
2. Copy the downloaded file into `.minecraft/schematics/`.
3. In game, open Litematica's *Load Schematics* menu, load the file and place it.
4. Verify: it loads without errors, block count in the schematic info matches, chests keep
   their contents, signs keep their text, and entities (item frames, armor stands) are present.
