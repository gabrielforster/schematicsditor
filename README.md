# Schematic Editor

A static web app for previewing, inspecting and bulk-editing Litematica `.litematic` schematics.
Everything runs in the browser; files are never uploaded.

**Live:** https://gabrielforster.github.io/schematicsditor/

## Usage

1. Open the site and drop a `.litematic` file anywhere (or click **Open**). No file at hand?
   Click **Open the sample schematic** for a small house with a garden.
2. Look around: drag to orbit, right-drag to pan, scroll to zoom; **Fit view** recenters and
   **Fly** switches to WASD. **Textured** / **Colored** switches the render mode. Textures
   come from [misode/mcmeta](https://github.com/misode/mcmeta); offline, the view falls back
   to colored mode.
3. Inspect: the left panel shows and hides regions, draws a box selection (**Pick corners**)
   and limits the visible layers (**From Y** / **To Y**, **Single layer**, ↑/↓). The
   **Materials** tab counts items, stacks and shulker boxes, exports CSV or text, and
   highlights a material in the view when you click its row.
4. Edit: **Replace** swaps blocks (with property carry-over, scopes and a preview count);
   **Family swap** turns a whole wood, stone or color family into another. Ctrl+Z / Ctrl+Y
   undo and redo.
5. Save: **Save** or Ctrl+S downloads `<name>.litematic`. The file is re-read and compared
   before the download starts; a mismatch blocks the download with an error.

Supported: Minecraft 1.13 and newer (`MinecraftDataVersion` ≥ 1519).

## Development

Node 24 is required (`.nvmrc` and `.mise.toml` pin 24.16.0; with mise, run `mise trust` once
if it asks).

```bash
npm install
npm run dev        # dev server
npm test           # unit tests (Vitest)
npm run typecheck
npm run build      # static build in dist/
npm run test:e2e   # end-to-end test (Playwright, Chromium), against a production build
```

Before the first `npm run test:e2e`, install the browser once: `npx playwright install chromium`
(on a fresh Linux machine: `npx playwright install --with-deps chromium`). The end-to-end test
blocks every request that leaves the local server, so it needs no network and always renders
in colored mode.

## Deployment

`.github/workflows/deploy.yml` builds the site with Node 24 and publishes `dist/` to GitHub
Pages on every push to `master` (or by hand from the Actions tab). `.github/workflows/ci.yml`
runs the typecheck, unit tests, build and end-to-end test on every pull request.

One-time setup by the repository owner: **Settings → Pages → Build and deployment → Source:
GitHub Actions**. Until that is set, the deploy job fails with HTTP 404 when it creates the deployment.
The build uses relative asset paths (`base: './'`), so it works under
`https://<owner>.github.io/<repo>/` without further configuration.

## Sample schematic and round-trip fixtures

`scripts/samples/samples.ts` builds small synthetic schematics with the core writer:

- `src/assets/sample.litematic` — the empty state's sample (a house with stairs, glass, a door,
  a chest with items and a wall torch, plus a garden region stored with a negative size and an
  armor stand). The same file is `tests/fixtures/sample-house.litematic` and the end-to-end
  fixture.
- `tests/fixtures/wide-palette.litematic` — 301 palette entries (9-bit packing), a mod block
  and unknown tags at every level.

After changing a builder, regenerate and commit the files:

```bash
npm run generate:samples
npm test           # tests/scripts/samples.test.ts fails while a committed file is stale
```

Every `.litematic` file in `tests/fixtures/` must survive read → save → read unchanged
(`tests/core/litematic/fixtures.test.ts`). Add real files exported from the game there too:
multiple regions, regions placed with negative size, chests and signs (tile entities), mobs
and item frames (entities), and files from several Minecraft versions.

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

After changing anything under `src/core/litematic/`, and before each release:

1. Open the live site (or `npm run dev`), click **Open the sample schematic**, replace
   `oak_planks` with `spruce_planks`, and press Ctrl+S. Do the same with at least one real
   schematic of your own.
2. Copy the downloaded files into `.minecraft/schematics/`.
3. In game, open Litematica's *Load Schematics* menu, load each file and place it.
4. Verify: it loads without errors and the block count in the schematic info matches the
   editor's stats. For the sample: the walls are spruce, the chest holds 16 torches, 8 bread
   and 3 oak saplings, water sits in the garden, and the armor stand stands on the grass in
   the garden's south-east part, inside the fence (it is stored relative to the garden's
   raw Position, so a misplaced stand means entity positions broke). For your own files:
   chests keep their contents, signs keep their text, and entities (item frames, armor
   stands) are where they were.
