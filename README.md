# Schematic Editor

A static web app for previewing, inspecting and bulk-editing Litematica `.litematic` schematics.
Design: `docs/superpowers/specs/2026-09-29-litematica-editor-design.md`.

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

## Manual in-game check

After changing anything under `src/core/litematic/`:

1. `npm run dev`, open a fixture, click **Save**.
2. Copy the downloaded file into `.minecraft/schematics/`.
3. In game, open Litematica's *Load Schematics* menu, load the file and place it.
4. Verify: it loads without errors, block count in the schematic info matches, chests keep
   their contents, signs keep their text, and entities (item frames, armor stands) are present.
