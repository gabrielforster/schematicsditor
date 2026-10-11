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
2. Colored mode: the same shapes as solid colors; glass and water are translucent.
3. Layers: set a Y range; cut faces look solid. ↑/↓ moves the range. With **Single** checked,
   the layer below shows faded.
4. Highlight `minecraft:stone`: stone stays solid, everything else fades.
5. **Pick two corners**, click two blocks: a yellow box appears and the min/max fields fill in.
   Editing the numbers and clicking **Apply** moves the box.
6. Hovering shows the block state and coordinates.
7. Replace `minecraft:stone` → `minecraft:gold_block`: the view updates; **Undo** restores it.
8. In DevTools, clear site data and go offline, then reload and open the file: the view
   falls back to colored with **Retry textures**. Go online and click it: textures return.
   Reload offline again: textures load from the cache.
9. **Fly**: WASD, Space and Shift move the camera.

## Manual in-game check

After changing anything under `src/core/litematic/`:

1. `npm run dev`, open a fixture, click **Save**.
2. Copy the downloaded file into `.minecraft/schematics/`.
3. In game, open Litematica's *Load Schematics* menu, load the file and place it.
4. Verify: it loads without errors, block count in the schematic info matches, chests keep
   their contents, signs keep their text, and entities (item frames, armor stands) are present.
