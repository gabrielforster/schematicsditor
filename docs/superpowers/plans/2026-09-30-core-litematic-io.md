# Core `.litematic` I/O Implementation Plan (Plan 1 of 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tested, DOM-free TypeScript core that reads a `.litematic` file into an in-memory model, writes it back to a valid `.litematic` with a round-trip guard, and parses it off the main thread in a Web Worker.

**Architecture:** `src/core` is pure TypeScript (no DOM, no Three.js) and is unit-tested in Node with Vitest. deepslate handles NBT and gzip. Our code only does Litematica's bit packing, the model, and the mapping between the model and NBT. Packed block data is handled as 32-bit words (low half of each 64-bit long first), so pack/unpack never touches BigInt. Unknown NBT tags are kept as deepslate `NbtCompound`s and written back verbatim. For worker transport they are converted to deepslate JSON, because structured clone strips class prototypes.

**Tech Stack:** TypeScript 7, Vite 8, Vitest 5, deepslate 0.27 (`deepslate/nbt`), Node 24 for tests.

**Spec:** `docs/superpowers/specs/2026-09-29-litematica-editor-design.md`. This plan covers §3 (the `core/nbt`, `core/litematic`, `core/model` and `workers/` parse-worker parts), §4, §5, the parse worker in §6, and the I/O and round-trip items in §13. It also covers the "Not gzip / bad NBT / no Regions", "Pre-1.13" and "Round-trip mismatch" rows of §12.

**Plan series** (each plan produces working, tested software on its own):
1. **Core `.litematic` I/O** (this plan): model, read, write, round-trip guard, parse worker, temporary dev harness.
2. **Editing core**: block registry from mcmeta (block list, properties, defaults), property carry-over, matchers, scopes, replace, undo/redo, families + validation, material list (§7, §9, §10).
3. **Rendering**: Three.js scene, chunk manager, colored + textured meshers, mesh worker pool, assets (including the "newer than known mcmeta" warning from §5), layer view, picking, selection, highlight (§8).
4. **UI**: React app shell, panels, dialogs, error surfaces, drag-and-drop, save flow (§11, §12). Replaces this plan's dev harness.
5. **Ship**: GitHub Pages Action, Playwright E2E, bundled sample schematic (§2, §13 E2E).

## Global Constraints

- Static web app: TypeScript + Vite + React, no backend. (React arrives in Plan 4. This plan adds no UI framework.)
- `src/core` must not import DOM, Three.js or React APIs. It must run under Vitest's `node` environment.
- Block index order: `index = y*sizeX*sizeZ + z*sizeX + x`.
- Bits per entry: `bits = max(2, ceil(log2(paletteSize)))`. Values may span two longs.
- Block arrays: `Uint16Array` of palette indices, `Uint32Array` when the palette has more than 65,536 entries (indices above 65,535).
- Regions are normalized on read (positive size, min-corner position), but the file's original Position/Size are kept as `fileBox` and written back unchanged (Litematica stores entity positions relative to the raw Position, not the normalized min corner). Regions without an original box are written normalized.
- Minimum supported `MinecraftDataVersion`: 1519 (Minecraft 1.13). Lower or missing → reject.
- On write: compact unused palette entries; recompute `TotalBlocks` (non-air), `TotalVolume`, `EnclosingSize`, `RegionCount`, `TimeModified`; preserve `MinecraftDataVersion`, `Version`, `SubVersion`; keep `PreviewImageData`.
- Air = `minecraft:air`, `minecraft:cave_air`, `minecraft:void_air`. Written palettes always have `minecraft:air` at index 0.
- Unknown root, metadata and region tags, plus `Entities`, `PendingBlockTicks` and `PendingFluidTicks`, survive read → write unchanged.
- Round-trip guard: re-read the produced bytes and compare to the model. On mismatch, throw instead of returning bytes.
- Tests import `describe/it/expect` from `vitest` explicitly (no globals).
- TDD: in any step that adds a test file with several tests, add them one at a time and watch each fail before writing the code that passes it. The full file is shown for reference.
- Commit after every task. Commit messages end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

These are the inputs most likely to hurt a real user that the spec implies but never spells out. Each has a pinning test in the task named in brackets.

1. **Corrupt block data** (a truncated `BlockStates` long array, or a palette index beyond the palette, e.g. from a hand-edited or partly written file). Expect a friendly `corrupt` error, not a crash or silent garbage blocks later. [Task 4: `rejects truncated block data`, `rejects palette indices beyond the palette`]
2. **Palette without air at index 0** (air elsewhere, or no air at all, as other tools write). Expect the saved file to have air at index 0 and every block unchanged. [Task 5: `moves air to index 0…`, `adds air at index 0…`]
3. **Equivalent block states spelled differently** (same properties in a different order, or duplicate palette entries). Expect them merged on save and compared as equal by the guard. [Task 5: `merges palette entries…`; Task 6: `ignores palette order…`]
4. **Non-ASCII schematic names and descriptions** (accents, CJK, emoji). Expect them to survive the round trip exactly. [Task 5: `preserves non-ASCII text`]
5. **Tile entities with coordinates outside their region** (from hand edits or other tools). Expect them kept and written back, not silently dropped. [Task 4: `keeps out-of-bounds tile entities as strays…`; Task 5: `preserves tile entities, strays…`]

---

## File Structure

```
package.json, tsconfig.json, vitest.config.ts, vite.config.ts, .gitignore, index.html, README.md
src/
  core/
    litematic/
      bits.ts          bitsForPalette, longCount, packBits, unpackBits, BlockArray
      errors.ts        LitematicError + LitematicErrorCode
      read.ts          readLitematic, decodeLitematic, normalizeBox, MIN_DATA_VERSION
      write.ts         compactRegion, recomputeMetadata, prepareForWrite, encodeLitematic
      save.ts          saveLitematic, diffSchematics, RoundTripError
      serialize.ts     serializeSchematic, deserializeSchematic (worker transport)
    model/
      blockState.ts    BlockState, AIR, isAir, blockStateKey, parseBlockStateKey
      region.ts        Vec3, Region, volumeOf, blockIndex, createBlockArray, blockAt
      schematic.ts     Metadata, Schematic
      index.ts         re-exports
    nbt/
      index.ts         readNbt, writeNbt, NbtReadError, longArrayToWords, wordsToLongArray
  workers/
    parseProtocol.ts   handleParseRequest (pure, testable), ParseResponse
    parse.worker.ts    worker glue
    parseClient.ts     parseLitematicInWorker, ParseFailure
  main.ts              temporary dev harness (open → summary → save), replaced in Plan 4
tests/
  helpers/litematicNbt.ts   builds .litematic NBT trees independently of our writer
  core/litematic/{bits,read,write,save,serialize,fixtures}.test.ts
  core/model/{blockState,region}.test.ts
  core/nbt/nbt.test.ts
  workers/parseProtocol.test.ts
  fixtures/.gitkeep         real .litematic files go here
```

---

### Task 1: Project scaffold + Litematica bit packing

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`
- Create: `src/core/litematic/bits.ts`
- Test: `tests/core/litematic/bits.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type BlockArray = Uint16Array | Uint32Array`
  - `bitsForPalette(paletteSize: number): number`
  - `longCount(volume: number, bits: number): number`
  - `packBits(values: BlockArray, bits: number): Uint32Array`: the result holds `2 * longCount` words, low half of each long first.
  - `unpackBits(words: Uint32Array, volume: number, bits: number, out: BlockArray): void`: throws `RangeError` when `words` is shorter than needed.

Domain note: Litematica (`LitematicaBitArray`) writes entry `i` at bit offset `i*bits` of a stream of 64-bit longs, LSB-first, and lets an entry continue into the next long's low bits. Splitting each long into `[low32, high32]` turns that into one plain little-endian bitstream of 32-bit words. The test transcribes Litematica's Java `getAt` over BigInt as an independent oracle.

- [ ] **Step 1: Create the project files**

`package.json`:

```json
{
  "name": "schematicsditor",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  }
}
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable", "WebWorker"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "types": ["node", "vite/client"]
  },
  "include": ["src", "tests"]
}
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
```

`.gitignore`:

```
node_modules/
dist/
*.tsbuildinfo
```

- [ ] **Step 2: Install dependencies**

Run:
```bash
npm install deepslate@^0.27.2
npm install -D typescript@^7.0.2 vite@^8.3.1 vitest@^5.0.3 @types/node@^26.6.3
```
Expected: installs without errors. `npx tsc -v` prints `Version 7.x`.

- [ ] **Step 3: Write the failing test**

`tests/core/litematic/bits.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { bitsForPalette, longCount, packBits, unpackBits } from '../../../src/core/litematic/bits'

// Direct transcription of Litematica's LitematicaBitArray.getAt over signed
// 64-bit longs. Used as an independent oracle for the 32-bit word version.
function litematicaGetAt(longs: bigint[], bits: number, index: number): number {
  const mask = (1n << BigInt(bits)) - 1n
  const startOffset = index * bits
  const startArrIndex = startOffset >> 6
  const endArrIndex = ((index + 1) * bits - 1) >> 6
  const startBitOffset = BigInt(startOffset & 0x3f)
  const u = (x: bigint) => BigInt.asUintN(64, x)
  if (startArrIndex === endArrIndex) {
    return Number((u(longs[startArrIndex]!) >> startBitOffset) & mask)
  }
  const endOffset = 64n - startBitOffset
  return Number(((u(longs[startArrIndex]!) >> startBitOffset) | (u(longs[endArrIndex]!) << endOffset)) & mask)
}

function wordsToLongs(words: Uint32Array): bigint[] {
  const longs: bigint[] = []
  for (let k = 0; k < words.length; k += 2) {
    longs.push(BigInt.asIntN(64, (BigInt(words[k + 1]!) << 32n) | BigInt(words[k]!)))
  }
  return longs
}

describe('bitsForPalette', () => {
  it.each([
    [1, 2], [2, 2], [3, 2], [4, 2], [5, 3], [8, 3], [9, 4], [16, 4], [17, 5],
    [256, 8], [257, 9], [65536, 16], [65537, 17],
  ])('palette of %i needs %i bits', (size, bits) => {
    expect(bitsForPalette(size)).toBe(bits)
  })
})

describe('longCount', () => {
  it('rounds partial longs up', () => {
    expect(longCount(32, 2)).toBe(1)
    expect(longCount(33, 2)).toBe(2)
    expect(longCount(13, 5)).toBe(2)
  })
})

describe('packBits', () => {
  it('packs 2-bit values LSB first into the low word', () => {
    const words = packBits(Uint16Array.from([1, 2, 3, 0]), 2)
    expect(words.length).toBe(2)
    expect(words[0]).toBe(0b00_11_10_01)
    expect(words[1]).toBe(0)
  })

  it('matches Litematica getAt for values spanning two longs', () => {
    // 5 bits: entry 12 occupies bits 60..64, crossing into long 1.
    const values = Uint16Array.from({ length: 30 }, (_, i) => (i * 7 + 3) % 32)
    const longs = wordsToLongs(packBits(values, 5))
    for (let i = 0; i < values.length; i++) {
      expect(litematicaGetAt(longs, 5, i)).toBe(values[i])
    }
  })

  it('matches Litematica getAt for 17-bit values', () => {
    const values = Uint32Array.from({ length: 200 }, (_, i) => (i * 104729) % 131072)
    const longs = wordsToLongs(packBits(values, 17))
    for (let i = 0; i < values.length; i++) {
      expect(litematicaGetAt(longs, 17, i)).toBe(values[i])
    }
  })
})

describe('unpackBits', () => {
  it.each([2, 3, 5, 7, 12, 16, 17, 24])('round-trips %i-bit values', (bits) => {
    const max = 2 ** bits
    const values = Uint32Array.from({ length: 1000 }, (_, i) => (i * 2654435761) % max)
    const out = new Uint32Array(values.length)
    unpackBits(packBits(values, bits), values.length, bits, out)
    expect(out).toEqual(values)
  })

  it('ignores trailing longs beyond the needed count', () => {
    const words = new Uint32Array(8)
    words.set(packBits(Uint16Array.from([3, 1]), 2))
    const out = new Uint16Array(2)
    unpackBits(words, 2, 2, out)
    expect(Array.from(out)).toEqual([3, 1])
  })

  it('rejects packed data shorter than the volume needs', () => {
    expect(() => unpackBits(new Uint32Array(2), 33, 2, new Uint16Array(33))).toThrow(RangeError)
  })
})
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run tests/core/litematic/bits.test.ts`
Expected: FAIL. The suite cannot resolve `../../../src/core/litematic/bits`.

- [ ] **Step 5: Write the implementation**

`src/core/litematic/bits.ts`:

```ts
// Litematica packs palette indices LSB-first into a stream of 64-bit longs,
// letting a value span two longs. We hold that stream as 32-bit words:
// words[2k] is the low half of long k, words[2k + 1] the high half. Seen
// this way the stream is one continuous little-endian bitstream.

export type BlockArray = Uint16Array | Uint32Array

/** Litematica: max(2, bits needed to store paletteSize - 1). */
export function bitsForPalette(paletteSize: number): number {
  const needed = paletteSize <= 1 ? 0 : 32 - Math.clz32(paletteSize - 1)
  return Math.max(2, needed)
}

/** Number of 64-bit longs Litematica writes for `volume` entries. */
export function longCount(volume: number, bits: number): number {
  return Math.ceil((volume * bits) / 64)
}

function maskFor(bits: number): number {
  return bits >= 32 ? 0xffffffff : (1 << bits) - 1
}

export function unpackBits(words: Uint32Array, volume: number, bits: number, out: BlockArray): void {
  if (words.length < longCount(volume, bits) * 2) {
    throw new RangeError(`packed data too short: ${words.length / 2} longs for ${volume} entries at ${bits} bits`)
  }
  const mask = maskFor(bits)
  for (let i = 0; i < volume; i++) {
    const bit = i * bits
    const w = Math.floor(bit / 32)
    const off = bit % 32
    let v = words[w]! >>> off
    if (off + bits > 32) v |= words[w + 1]! << (32 - off)
    out[i] = (v & mask) >>> 0
  }
}

export function packBits(values: BlockArray, bits: number): Uint32Array {
  const words = new Uint32Array(longCount(values.length, bits) * 2)
  const mask = maskFor(bits)
  for (let i = 0; i < values.length; i++) {
    const v = (values[i]! & mask) >>> 0
    const bit = i * bits
    const w = Math.floor(bit / 32)
    const off = bit % 32
    words[w] = (words[w]! | (v << off)) >>> 0
    if (off + bits > 32) words[w + 1] = (words[w + 1]! | (v >>> (32 - off))) >>> 0
  }
  return words
}
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `npx vitest run tests/core/litematic/bits.test.ts && npx tsc --noEmit`
Expected: 27 tests pass, and tsc prints nothing.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore src/core/litematic/bits.ts tests/core/litematic/bits.test.ts
git commit -m "feat(core): scaffold project and Litematica bit packing"
```

---

### Task 2: Block state and region model

**Files:**
- Create: `src/core/model/blockState.ts`, `src/core/model/region.ts`, `src/core/model/schematic.ts`, `src/core/model/index.ts`
- Test: `tests/core/model/blockState.test.ts`, `tests/core/model/region.test.ts`

**Interfaces:**
- Consumes: `BlockArray` from `src/core/litematic/bits.ts`.
- Produces (all re-exported from `src/core/model/index.ts`):
  - `interface BlockState { name: string; properties: Readonly<Record<string, string>> }`
  - `AIR: BlockState` (`minecraft:air`), `isAir(state): boolean`
  - `blockStateKey(state): string`: `name[k=v,…]` with keys sorted, or the bare name.
  - `parseBlockStateKey(key): BlockState`: throws `SyntaxError` on malformed input.
  - `interface Vec3 { x; y; z }`
  - `interface Region { name; position: Vec3; size: Vec3; palette: BlockState[]; blocks: BlockArray; tileEntities: Map<number, NbtCompound>; strayTileEntities: NbtCompound[]; extra: NbtCompound }`
  - `volumeOf(size)`, `blockIndex(size, x, y, z)`, `createBlockArray(volume, paletteSize)`, `blockAt(region, x, y, z): BlockState`
  - `interface Metadata { name; author; description; timeCreated; timeModified; regionCount; totalBlocks; totalVolume; enclosingSize: Vec3; previewImage?: Int32Array; extra: NbtCompound }`
  - `interface Schematic { version; subVersion?; dataVersion; metadata: Metadata; regions: Region[]; extra: NbtCompound }`

- [ ] **Step 1: Write the failing tests**

`tests/core/model/blockState.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { AIR, blockStateKey, isAir, parseBlockStateKey } from '../../../src/core/model/blockState'

describe('blockStateKey', () => {
  it('is the bare name when there are no properties', () => {
    expect(blockStateKey({ name: 'minecraft:stone', properties: {} })).toBe('minecraft:stone')
  })

  it('sorts properties by key', () => {
    const state = { name: 'minecraft:oak_stairs', properties: { half: 'top', facing: 'north' } }
    expect(blockStateKey(state)).toBe('minecraft:oak_stairs[facing=north,half=top]')
  })
})

describe('parseBlockStateKey', () => {
  it('parses a bare name', () => {
    expect(parseBlockStateKey('minecraft:stone')).toEqual({ name: 'minecraft:stone', properties: {} })
  })

  it('parses properties', () => {
    expect(parseBlockStateKey('minecraft:oak_stairs[facing=north,half=top]')).toEqual({
      name: 'minecraft:oak_stairs',
      properties: { facing: 'north', half: 'top' },
    })
  })

  it('round-trips with blockStateKey', () => {
    const key = 'minecraft:chest[facing=east,type=left,waterlogged=false]'
    expect(blockStateKey(parseBlockStateKey(key))).toBe(key)
  })

  it('rejects a missing closing bracket', () => {
    expect(() => parseBlockStateKey('minecraft:oak_stairs[facing=north')).toThrow(SyntaxError)
  })

  it('rejects a property without a value separator', () => {
    expect(() => parseBlockStateKey('minecraft:oak_stairs[facing]')).toThrow(SyntaxError)
  })
})

describe('isAir', () => {
  it.each(['minecraft:air', 'minecraft:cave_air', 'minecraft:void_air'])('treats %s as air', (name) => {
    expect(isAir({ name, properties: {} })).toBe(true)
  })

  it('does not treat stone as air', () => {
    expect(isAir({ name: 'minecraft:stone', properties: {} })).toBe(false)
  })

  it('exports AIR as minecraft:air', () => {
    expect(blockStateKey(AIR)).toBe('minecraft:air')
  })
})
```

`tests/core/model/region.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { NbtCompound } from 'deepslate/nbt'
import { AIR } from '../../../src/core/model/blockState'
import { blockAt, blockIndex, createBlockArray, volumeOf, type Region } from '../../../src/core/model/region'

describe('blockIndex', () => {
  it('orders x fastest, then z, then y', () => {
    const size = { x: 3, y: 4, z: 5 }
    expect(blockIndex(size, 0, 0, 0)).toBe(0)
    expect(blockIndex(size, 1, 0, 0)).toBe(1)
    expect(blockIndex(size, 0, 0, 1)).toBe(3)
    expect(blockIndex(size, 0, 1, 0)).toBe(15)
    expect(blockIndex(size, 2, 3, 4)).toBe(volumeOf(size) - 1)
  })
})

describe('createBlockArray', () => {
  it('uses Uint16Array up to 65536 palette entries', () => {
    expect(createBlockArray(10, 65536)).toBeInstanceOf(Uint16Array)
  })

  it('uses Uint32Array above 65536 palette entries', () => {
    expect(createBlockArray(10, 65537)).toBeInstanceOf(Uint32Array)
  })
})

describe('blockAt', () => {
  it('looks up the palette entry at a coordinate', () => {
    const stone = { name: 'minecraft:stone', properties: {} }
    const region: Region = {
      name: 'r', position: { x: 0, y: 0, z: 0 }, size: { x: 2, y: 1, z: 1 },
      palette: [AIR, stone], blocks: Uint16Array.from([0, 1]),
      tileEntities: new Map(), strayTileEntities: [], extra: new NbtCompound(),
    }
    expect(blockAt(region, 1, 0, 0)).toBe(stone)
    expect(blockAt(region, 0, 0, 0)).toBe(AIR)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/core/model`
Expected: FAIL. `src/core/model/blockState` and `src/core/model/region` cannot be resolved.

- [ ] **Step 3: Write the implementation**

`src/core/model/blockState.ts`:

```ts
export interface BlockState {
  name: string
  properties: Readonly<Record<string, string>>
}

export const AIR: BlockState = { name: 'minecraft:air', properties: {} }

const AIR_NAMES = new Set(['minecraft:air', 'minecraft:cave_air', 'minecraft:void_air'])

export function isAir(state: BlockState): boolean {
  return AIR_NAMES.has(state.name)
}

/** Canonical key: `name[k1=v1,k2=v2]` with keys sorted; bare `name` without properties. */
export function blockStateKey(state: BlockState): string {
  const keys = Object.keys(state.properties).sort()
  if (keys.length === 0) return state.name
  return `${state.name}[${keys.map((k) => `${k}=${state.properties[k]}`).join(',')}]`
}

export function parseBlockStateKey(key: string): BlockState {
  const open = key.indexOf('[')
  if (open === -1) return { name: key, properties: {} }
  if (!key.endsWith(']')) throw new SyntaxError(`invalid block state: ${key}`)
  const properties: Record<string, string> = {}
  const body = key.slice(open + 1, -1)
  if (body.length > 0) {
    for (const pair of body.split(',')) {
      const eq = pair.indexOf('=')
      if (eq <= 0) throw new SyntaxError(`invalid block state: ${key}`)
      properties[pair.slice(0, eq)] = pair.slice(eq + 1)
    }
  }
  return { name: key.slice(0, open), properties }
}
```

`src/core/model/region.ts`:

```ts
import type { NbtCompound } from 'deepslate/nbt'
import type { BlockArray } from '../litematic/bits'
import type { BlockState } from './blockState'

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface Region {
  name: string
  /** Minimum corner, in schematic coordinates. */
  position: Vec3
  /** Always positive on every axis. */
  size: Vec3
  palette: BlockState[]
  /** Palette indices, `index = y*sizeX*sizeZ + z*sizeX + x`. */
  blocks: BlockArray
  /** Block entity tags keyed by block index; tags keep their own x/y/z. */
  tileEntities: Map<number, NbtCompound>
  /** Block entity tags whose x/y/z fall outside the region; written back untouched. */
  strayTileEntities: NbtCompound[]
  /** Every other region tag (Entities, PendingBlockTicks, unknown keys), verbatim. */
  extra: NbtCompound
}

export function volumeOf(size: Vec3): number {
  return size.x * size.y * size.z
}

export function blockIndex(size: Vec3, x: number, y: number, z: number): number {
  return y * size.x * size.z + z * size.x + x
}

export function createBlockArray(volume: number, paletteSize: number): BlockArray {
  return paletteSize > 65536 ? new Uint32Array(volume) : new Uint16Array(volume)
}

export function blockAt(region: Region, x: number, y: number, z: number): BlockState {
  const state = region.palette[region.blocks[blockIndex(region.size, x, y, z)]!]
  if (!state) throw new RangeError(`no palette entry at ${x},${y},${z}`)
  return state
}
```

`src/core/model/schematic.ts`:

```ts
import type { NbtCompound } from 'deepslate/nbt'
import type { Region, Vec3 } from './region'

export interface Metadata {
  name: string
  author: string
  description: string
  /** Milliseconds since the Unix epoch. */
  timeCreated: number
  timeModified: number
  regionCount: number
  totalBlocks: number
  totalVolume: number
  enclosingSize: Vec3
  previewImage?: Int32Array
  /** Unknown Metadata tags, verbatim. */
  extra: NbtCompound
}

export interface Schematic {
  version: number
  subVersion?: number
  dataVersion: number
  metadata: Metadata
  regions: Region[]
  /** Unknown root tags, verbatim. */
  extra: NbtCompound
}
```

`src/core/model/index.ts`:

```ts
export * from './blockState'
export * from './region'
export * from './schematic'
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `npx vitest run tests/core/model && npx tsc --noEmit`
Expected: all pass, and tsc prints nothing.

- [ ] **Step 5: Commit**

```bash
git add src/core/model tests/core/model
git commit -m "feat(core): block state and region model"
```

---

### Task 3: NBT wrapper

**Files:**
- Create: `src/core/nbt/index.ts`
- Test: `tests/core/nbt/nbt.test.ts`

**Interfaces:**
- Consumes: `deepslate/nbt` (`NbtFile`, `NbtCompound`, `NbtLongArray`, `NbtLongPair`).
- Produces:
  - `readNbt(bytes: Uint8Array): NbtCompound`: accepts gzip, zlib or raw. Throws `NbtReadError` on any parse failure.
  - `writeNbt(root: NbtCompound): Uint8Array`: gzip, empty root name.
  - `class NbtReadError extends Error`
  - `longArrayToWords(array: NbtLongArray): Uint32Array` and `wordsToLongArray(words: Uint32Array): NbtLongArray`: the word layout matches `bits.ts`.

Domain note: deepslate represents a long as a signed `[high, low]` pair of 32-bit numbers (`NbtLong.getAsPair()`), or as a `bigint`.

- [ ] **Step 1: Write the failing test**

`tests/core/nbt/nbt.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { NbtCompound, NbtLongArray, NbtString } from 'deepslate/nbt'
import { longArrayToWords, NbtReadError, readNbt, wordsToLongArray, writeNbt } from '../../../src/core/nbt'

describe('writeNbt / readNbt', () => {
  it('writes gzip', () => {
    const bytes = writeNbt(new NbtCompound())
    expect([bytes[0], bytes[1]]).toEqual([0x1f, 0x8b])
  })

  it('round-trips a compound', () => {
    const root = new NbtCompound().set('Name', new NbtString('héllo ✓'))
    expect(readNbt(writeNbt(root)).getString('Name')).toBe('héllo ✓')
  })

  it('wraps parse failures in NbtReadError', () => {
    expect(() => readNbt(new Uint8Array([1, 2, 3]))).toThrow(NbtReadError)
  })
})

describe('longArrayToWords', () => {
  it('splits each long into low then high 32-bit words', () => {
    const words = longArrayToWords(new NbtLongArray([0x0000000100000002n, -1n]))
    expect(Array.from(words)).toEqual([2, 1, 0xffffffff, 0xffffffff])
  })
})

describe('wordsToLongArray', () => {
  it('is the inverse of longArrayToWords', () => {
    const longs = [0n, -1n, 0x7fffffffffffffffn, -0x8000000000000000n, 0x123456789abcdefn]
    const array = wordsToLongArray(longArrayToWords(new NbtLongArray(longs)))
    expect(array.getItems().map((l) => l.toBigInt())).toEqual(longs)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/core/nbt`
Expected: FAIL. `src/core/nbt` cannot be resolved.

- [ ] **Step 3: Write the implementation**

`src/core/nbt/index.ts`:

```ts
import { NbtCompound, NbtFile, NbtLongArray, type NbtLongPair } from 'deepslate/nbt'

export class NbtReadError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'NbtReadError'
  }
}

/** Parse NBT bytes (gzip, zlib or uncompressed) and return the root compound. */
export function readNbt(bytes: Uint8Array): NbtCompound {
  try {
    return NbtFile.read(bytes).root
  } catch (cause) {
    throw new NbtReadError(cause instanceof Error ? cause.message : String(cause), { cause })
  }
}

/** Serialize a root compound as gzip-compressed NBT with an empty root name. */
export function writeNbt(root: NbtCompound): Uint8Array {
  const file = NbtFile.create({ compression: 'gzip' })
  file.root = root
  return file.write()
}

/** Long array → 32-bit words, low half of each long first (see litematic/bits.ts). */
export function longArrayToWords(array: NbtLongArray): Uint32Array {
  const items = array.getItems()
  const words = new Uint32Array(items.length * 2)
  for (let k = 0; k < items.length; k++) {
    const [hi, lo] = items[k]!.getAsPair()
    words[2 * k] = lo >>> 0
    words[2 * k + 1] = hi >>> 0
  }
  return words
}

export function wordsToLongArray(words: Uint32Array): NbtLongArray {
  const pairs: NbtLongPair[] = new Array(words.length / 2)
  for (let k = 0; k < pairs.length; k++) {
    pairs[k] = [words[2 * k + 1]! | 0, words[2 * k]! | 0]
  }
  return new NbtLongArray(pairs)
}
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `npx vitest run tests/core/nbt && npx tsc --noEmit`
Expected: 5 tests pass, and tsc prints nothing.

- [ ] **Step 5: Commit**

```bash
git add src/core/nbt tests/core/nbt
git commit -m "feat(core): gzip NBT wrapper and long-array word conversion"
```

---

### Task 4: Reading `.litematic`

**Files:**
- Create: `src/core/litematic/errors.ts`, `src/core/litematic/read.ts`
- Create: `tests/helpers/litematicNbt.ts`
- Test: `tests/core/litematic/read.test.ts`

**Interfaces:**
- Consumes: `bitsForPalette`, `unpackBits` (Task 1); model (Task 2); `readNbt`, `NbtReadError`, `longArrayToWords` (Task 3).
- Produces:
  - `type LitematicErrorCode = 'not-nbt' | 'no-regions' | 'unsupported-version' | 'corrupt'`
  - `class LitematicError extends Error { readonly code: LitematicErrorCode }`. Its messages are user-facing. `cause` carries the technical detail.
  - `readLitematic(bytes: Uint8Array): Schematic`
  - `decodeLitematic(root: NbtCompound): Schematic`
  - `normalizeBox(position: Vec3, size: Vec3): { position: Vec3; size: Vec3 }`
  - `MIN_DATA_VERSION = 1519`
  - Test helper (tests only): `litematicNbt(spec: LitematicSpec): NbtCompound`, `regionNbt(spec: RegionSpec)`, `tileEntity(id, x, y, z)`, `vec(x, y, z)`

Litematica file layout (all ints unless noted):
```
root
  Version, SubVersion (optional), MinecraftDataVersion
  Metadata { Name, Author, Description: string; RegionCount, TotalBlocks, TotalVolume;
             TimeCreated, TimeModified: long (ms); EnclosingSize {x,y,z}; PreviewImageData: int[] }
  Regions { <regionName>: { Position {x,y,z}; Size {x,y,z} (each axis may be negative);
            BlockStatePalette: list<{ Name: string; Properties?: {k: string} }>;
            BlockStates: long[]; TileEntities: list<compound with x,y,z relative to the min corner>;
            Entities, PendingBlockTicks, PendingFluidTicks: lists } }
```
A negative size axis means the region extends from `Position` toward smaller coordinates. The min corner on that axis is `pos + size + 1`. Block data and tile entity coordinates are already relative to the min corner, so normalization moves only `Position` and `Size`.

The helper builds NBT with deepslate directly, not with our writer, so reader tests stay independent of writer bugs.

- [ ] **Step 1: Write the error type**

`src/core/litematic/errors.ts`:

```ts
export type LitematicErrorCode = 'not-nbt' | 'no-regions' | 'unsupported-version' | 'corrupt'

export class LitematicError extends Error {
  readonly code: LitematicErrorCode

  constructor(code: LitematicErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'LitematicError'
    this.code = code
  }
}
```

- [ ] **Step 2: Write the test helper**

`tests/helpers/litematicNbt.ts`:

```ts
// Builds .litematic NBT trees directly with deepslate, independent of our
// writer, so reader tests don't depend on writer correctness.
import { NbtCompound, NbtInt, NbtIntArray, NbtList, NbtLong, NbtString, type NbtTag } from 'deepslate/nbt'
import { bitsForPalette, packBits } from '../../src/core/litematic/bits'
import { wordsToLongArray } from '../../src/core/nbt'

export interface RegionSpec {
  name?: string
  position?: [number, number, number]
  size: [number, number, number]
  /** Block state keys like `minecraft:oak_stairs[facing=north]`. */
  palette: string[]
  /** Palette indices in Litematica order. Defaults to all zeros. */
  blocks?: number[]
  tileEntities?: NbtCompound[]
  extra?: Record<string, NbtTag>
}

export interface LitematicSpec {
  dataVersion?: number | null
  version?: number
  subVersion?: number | null
  name?: string
  regions: RegionSpec[]
  metadataExtra?: Record<string, NbtTag>
  rootExtra?: Record<string, NbtTag>
  previewImage?: number[]
}

export function vec(x: number, y: number, z: number): NbtCompound {
  return new NbtCompound().set('x', new NbtInt(x)).set('y', new NbtInt(y)).set('z', new NbtInt(z))
}

function paletteEntry(key: string): NbtCompound {
  const open = key.indexOf('[')
  const entry = new NbtCompound().set('Name', new NbtString(open === -1 ? key : key.slice(0, open)))
  if (open !== -1) {
    const props = new NbtCompound()
    for (const pair of key.slice(open + 1, -1).split(',')) {
      const [k, v] = pair.split('=')
      props.set(k!, new NbtString(v!))
    }
    entry.set('Properties', props)
  }
  return entry
}

export function regionNbt(spec: RegionSpec): NbtCompound {
  const [sx, sy, sz] = spec.size
  const volume = Math.abs(sx * sy * sz)
  const blocks = Uint32Array.from(spec.blocks ?? new Array<number>(volume).fill(0))
  const region = new NbtCompound()
    .set('Position', vec(...(spec.position ?? [0, 0, 0])))
    .set('Size', vec(sx, sy, sz))
    .set('BlockStatePalette', new NbtList(spec.palette.map(paletteEntry)))
    .set('BlockStates', wordsToLongArray(packBits(blocks, bitsForPalette(spec.palette.length))))
    .set('TileEntities', new NbtList(spec.tileEntities ?? []))
    .set('Entities', new NbtList([]))
    .set('PendingBlockTicks', new NbtList([]))
    .set('PendingFluidTicks', new NbtList([]))
  for (const [k, v] of Object.entries(spec.extra ?? {})) region.set(k, v)
  return region
}

export function litematicNbt(spec: LitematicSpec): NbtCompound {
  const regions = new NbtCompound()
  spec.regions.forEach((r, i) => regions.set(r.name ?? `region${i}`, regionNbt(r)))
  const metadata = new NbtCompound()
    .set('Name', new NbtString(spec.name ?? 'Test'))
    .set('Author', new NbtString('tester'))
    .set('Description', new NbtString(''))
    .set('RegionCount', new NbtInt(spec.regions.length))
    .set('TimeCreated', new NbtLong(1700000000000n))
    .set('TimeModified', new NbtLong(1700000001000n))
    .set('TotalBlocks', new NbtInt(0))
    .set('TotalVolume', new NbtInt(0))
    .set('EnclosingSize', vec(1, 1, 1))
  if (spec.previewImage) metadata.set('PreviewImageData', new NbtIntArray(spec.previewImage))
  for (const [k, v] of Object.entries(spec.metadataExtra ?? {})) metadata.set(k, v)
  const root = new NbtCompound().set('Version', new NbtInt(spec.version ?? 6))
  if (spec.subVersion !== null) root.set('SubVersion', new NbtInt(spec.subVersion ?? 1))
  if (spec.dataVersion !== null) root.set('MinecraftDataVersion', new NbtInt(spec.dataVersion ?? 3953))
  root.set('Metadata', metadata).set('Regions', regions)
  for (const [k, v] of Object.entries(spec.rootExtra ?? {})) root.set(k, v)
  return root
}

export function tileEntity(id: string, x: number, y: number, z: number): NbtCompound {
  return new NbtCompound()
    .set('id', new NbtString(id))
    .set('x', new NbtInt(x)).set('y', new NbtInt(y)).set('z', new NbtInt(z))
}
```

- [ ] **Step 3: Write the failing test**

`tests/core/litematic/read.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { NbtCompound, NbtList, NbtString } from 'deepslate/nbt'
import { LitematicError } from '../../../src/core/litematic/errors'
import { readLitematic } from '../../../src/core/litematic/read'
import { blockAt, blockStateKey } from '../../../src/core/model'
import { writeNbt } from '../../../src/core/nbt'
import { litematicNbt, tileEntity, type LitematicSpec } from '../../helpers/litematicNbt'

const read = (spec: LitematicSpec) => readLitematic(writeNbt(litematicNbt(spec)))

function expectLitematicError(fn: () => unknown, code: LitematicError['code']) {
  try {
    fn()
  } catch (e) {
    expect(e).toBeInstanceOf(LitematicError)
    expect((e as LitematicError).code).toBe(code)
    return
  }
  throw new Error(`expected LitematicError(${code})`)
}

describe('readLitematic', () => {
  it('reads versions and metadata', () => {
    const s = read({ name: 'Castle', regions: [{ size: [1, 1, 1], palette: ['minecraft:air'] }] })
    expect(s.version).toBe(6)
    expect(s.subVersion).toBe(1)
    expect(s.dataVersion).toBe(3953)
    expect(s.metadata.name).toBe('Castle')
    expect(s.metadata.author).toBe('tester')
    expect(s.metadata.timeCreated).toBe(1700000000000)
  })

  it('omits subVersion when the file has none', () => {
    const s = read({ subVersion: null, regions: [{ size: [1, 1, 1], palette: ['minecraft:air'] }] })
    expect('subVersion' in s).toBe(false)
  })

  it('unpacks blocks through the palette', () => {
    const s = read({
      regions: [{
        size: [2, 2, 1],
        palette: ['minecraft:air', 'minecraft:stone', 'minecraft:oak_stairs[facing=north,half=top]'],
        blocks: [0, 1, 2, 1],
      }],
    })
    const r = s.regions[0]!
    expect(blockStateKey(blockAt(r, 1, 0, 0))).toBe('minecraft:stone')
    expect(blockStateKey(blockAt(r, 0, 1, 0))).toBe('minecraft:oak_stairs[facing=north,half=top]')
  })

  it('uses Uint32Array for palettes above 65536 entries', () => {
    const palette = Array.from({ length: 65537 }, (_, i) => `minecraft:b${i}`)
    const s = read({ regions: [{ size: [2, 1, 1], palette, blocks: [0, 65536] }] })
    expect(s.regions[0]!.blocks).toBeInstanceOf(Uint32Array)
    expect(s.regions[0]!.blocks[1]).toBe(65536)
  })

  it('reads regions in file order with their names', () => {
    const s = read({
      regions: [
        { name: 'b', size: [1, 1, 1], palette: ['minecraft:air'] },
        { name: 'a', size: [1, 1, 1], palette: ['minecraft:air'] },
      ],
    })
    expect(s.regions.map((r) => r.name)).toEqual(['b', 'a'])
  })

  it('normalizes negative sizes to a min corner with positive size', () => {
    const s = read({ regions: [{ position: [5, 0, 10], size: [-3, 2, -4], palette: ['minecraft:air'] }] })
    expect(s.regions[0]!.position).toEqual({ x: 3, y: 0, z: 7 })
    expect(s.regions[0]!.size).toEqual({ x: 3, y: 2, z: 4 })
  })

  it('indexes tile entities by block position', () => {
    const chest = tileEntity('minecraft:chest', 1, 0, 0)
    const s = read({ regions: [{ size: [2, 1, 1], palette: ['minecraft:air', 'minecraft:chest'], blocks: [0, 1], tileEntities: [chest] }] })
    expect(s.regions[0]!.tileEntities.get(1)?.getString('id')).toBe('minecraft:chest')
    expect(s.regions[0]!.strayTileEntities).toEqual([])
  })

  it('keeps out-of-bounds tile entities as strays instead of dropping them', () => {
    const stray = tileEntity('minecraft:chest', 9, 9, 9)
    const s = read({ regions: [{ size: [1, 1, 1], palette: ['minecraft:air'], tileEntities: [stray] }] })
    expect(s.regions[0]!.tileEntities.size).toBe(0)
    expect(s.regions[0]!.strayTileEntities).toHaveLength(1)
  })

  it('preserves unknown root, metadata and region tags plus entities and ticks', () => {
    const s = read({
      rootExtra: { Custom: new NbtString('root') },
      metadataExtra: { Software: new NbtString('meta') },
      regions: [{ size: [1, 1, 1], palette: ['minecraft:air'], extra: { Mod: new NbtString('region') } }],
    })
    expect(s.extra.getString('Custom')).toBe('root')
    expect(s.metadata.extra.getString('Software')).toBe('meta')
    const extra = s.regions[0]!.extra
    expect(extra.getString('Mod')).toBe('region')
    expect([...extra.keys()].sort()).toEqual(['Entities', 'Mod', 'PendingBlockTicks', 'PendingFluidTicks'])
  })

  it('reads the preview image', () => {
    const s = read({ previewImage: [1, -2, 3], regions: [{ size: [1, 1, 1], palette: ['minecraft:air'] }] })
    expect(Array.from(s.metadata.previewImage!)).toEqual([1, -2, 3])
  })

  it('rejects bytes that are not NBT', () => {
    expectLitematicError(() => readLitematic(new TextEncoder().encode('hello')), 'not-nbt')
  })

  it('rejects NBT without Regions', () => {
    expectLitematicError(() => readLitematic(writeNbt(new NbtCompound())), 'no-regions')
  })

  it('rejects pre-1.13 data versions', () => {
    expectLitematicError(() => read({ dataVersion: 1343, regions: [{ size: [1, 1, 1], palette: ['minecraft:air'] }] }), 'unsupported-version')
  })

  it('rejects files without a data version', () => {
    expectLitematicError(() => read({ dataVersion: null, regions: [{ size: [1, 1, 1], palette: ['minecraft:air'] }] }), 'unsupported-version')
  })

  it('rejects truncated block data', () => {
    const root = litematicNbt({ regions: [{ size: [4, 4, 4], palette: ['minecraft:air'] }] })
    root.getCompound('Regions').getCompound('region0').set('BlockStates', new NbtList([]))
    expectLitematicError(() => readLitematic(writeNbt(root)), 'corrupt')
  })

  it('rejects palette indices beyond the palette', () => {
    // 3 entries → 2 bits, so index 3 is representable but invalid.
    expectLitematicError(
      () => read({ regions: [{ size: [2, 1, 1], palette: ['minecraft:air', 'minecraft:stone', 'minecraft:dirt'], blocks: [0, 3] }] }),
      'corrupt',
    )
  })

  it('rejects an empty palette', () => {
    expectLitematicError(() => read({ regions: [{ size: [1, 1, 1], palette: [] }] }), 'corrupt')
  })
})
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run tests/core/litematic/read.test.ts`
Expected: FAIL. `src/core/litematic/read` cannot be resolved.

- [ ] **Step 5: Write the implementation**

`src/core/litematic/read.ts`:

```ts
import { NbtCompound, NbtLongArray } from 'deepslate/nbt'
import type { BlockState, Metadata, Region, Schematic, Vec3 } from '../model'
import { blockIndex, createBlockArray, volumeOf } from '../model'
import { NbtReadError, longArrayToWords, readNbt } from '../nbt'
import { bitsForPalette, unpackBits } from './bits'
import { LitematicError } from './errors'

/** DataVersion of Minecraft 1.13 (the flattening). */
export const MIN_DATA_VERSION = 1519

const ROOT_KEYS = new Set(['Version', 'SubVersion', 'MinecraftDataVersion', 'Metadata', 'Regions'])
const METADATA_KEYS = new Set([
  'Name', 'Author', 'Description', 'TimeCreated', 'TimeModified',
  'RegionCount', 'TotalBlocks', 'TotalVolume', 'EnclosingSize', 'PreviewImageData',
])
const REGION_KEYS = new Set(['Position', 'Size', 'BlockStatePalette', 'BlockStates', 'TileEntities'])

export function readLitematic(bytes: Uint8Array): Schematic {
  let root: NbtCompound
  try {
    root = readNbt(bytes)
  } catch (cause) {
    if (cause instanceof NbtReadError) {
      throw new LitematicError('not-nbt', 'This file is not a valid NBT file.', { cause })
    }
    throw cause
  }
  return decodeLitematic(root)
}

export function decodeLitematic(root: NbtCompound): Schematic {
  if (!root.hasCompound('Regions') || root.getCompound('Regions').size === 0) {
    throw new LitematicError('no-regions', 'This file has no Regions; it is not a Litematica schematic.')
  }
  if (!root.hasNumber('MinecraftDataVersion') || root.getNumber('MinecraftDataVersion') < MIN_DATA_VERSION) {
    throw new LitematicError(
      'unsupported-version',
      'This schematic was made for a Minecraft version before 1.13, which is not supported.',
    )
  }
  const regionsTag = root.getCompound('Regions')
  const regions = [...regionsTag.keys()].map((name) => decodeRegion(name, regionsTag.getCompound(name)))
  return {
    version: root.getNumber('Version'),
    ...(root.hasNumber('SubVersion') ? { subVersion: root.getNumber('SubVersion') } : {}),
    dataVersion: root.getNumber('MinecraftDataVersion'),
    metadata: decodeMetadata(root.getCompound('Metadata')),
    regions,
    extra: pickUnknown(root, ROOT_KEYS),
  }
}

function decodeMetadata(tag: NbtCompound): Metadata {
  return {
    name: tag.getString('Name'),
    author: tag.getString('Author'),
    description: tag.getString('Description'),
    timeCreated: tag.getNumber('TimeCreated'),
    timeModified: tag.getNumber('TimeModified'),
    regionCount: tag.getNumber('RegionCount'),
    totalBlocks: tag.getNumber('TotalBlocks'),
    totalVolume: tag.getNumber('TotalVolume'),
    enclosingSize: decodeVec(tag.getCompound('EnclosingSize')),
    ...(tag.has('PreviewImageData')
      ? { previewImage: Int32Array.from(tag.getIntArray('PreviewImageData').getItems(), (i) => i.getAsNumber()) }
      : {}),
    extra: pickUnknown(tag, METADATA_KEYS),
  }
}

function decodeRegion(name: string, tag: NbtCompound): Region {
  const rawPos = decodeVec(tag.getCompound('Position'))
  const rawSize = decodeVec(tag.getCompound('Size'))
  if (rawSize.x === 0 || rawSize.y === 0 || rawSize.z === 0) {
    throw new LitematicError('corrupt', `Region "${name}" has a zero size.`)
  }
  const { position, size } = normalizeBox(rawPos, rawSize)

  const palette = tag.getList('BlockStatePalette', 10).map(decodeBlockState)
  if (palette.length === 0) {
    throw new LitematicError('corrupt', `Region "${name}" has an empty block palette.`)
  }

  const volume = volumeOf(size)
  const blocks = createBlockArray(volume, palette.length)
  const packed = tag.get('BlockStates')
  try {
    if (!(packed instanceof NbtLongArray)) throw new RangeError('BlockStates is missing')
    unpackBits(longArrayToWords(packed), volume, bitsForPalette(palette.length), blocks)
  } catch (cause) {
    throw new LitematicError('corrupt', `Region "${name}" has truncated block data.`, { cause })
  }
  for (let i = 0; i < volume; i++) {
    if (blocks[i]! >= palette.length) {
      throw new LitematicError('corrupt', `Region "${name}" references a block outside its palette.`)
    }
  }

  const tileEntities = new Map<number, NbtCompound>()
  const strayTileEntities: NbtCompound[] = []
  for (const te of tag.getList('TileEntities', 10).getItems()) {
    const x = te.getNumber('x'), y = te.getNumber('y'), z = te.getNumber('z')
    const inBounds = x >= 0 && y >= 0 && z >= 0 && x < size.x && y < size.y && z < size.z
    const index = blockIndex(size, x, y, z)
    if (inBounds && !tileEntities.has(index)) tileEntities.set(index, te)
    else strayTileEntities.push(te)
  }

  return { name, position, size, palette, blocks, tileEntities, strayTileEntities, extra: pickUnknown(tag, REGION_KEYS) }
}

/** Litematica sizes may be negative; convert to a min corner plus positive size. */
export function normalizeBox(position: Vec3, size: Vec3): { position: Vec3; size: Vec3 } {
  const axis = (p: number, s: number): [number, number] => (s < 0 ? [p + s + 1, -s] : [p, s])
  const [px, sx] = axis(position.x, size.x)
  const [py, sy] = axis(position.y, size.y)
  const [pz, sz] = axis(position.z, size.z)
  return { position: { x: px, y: py, z: pz }, size: { x: sx, y: sy, z: sz } }
}

function decodeBlockState(entry: NbtCompound): BlockState {
  const properties: Record<string, string> = {}
  if (entry.hasCompound('Properties')) {
    entry.getCompound('Properties').forEach((k, v) => {
      properties[k] = v.getAsString()
    })
  }
  return { name: entry.getString('Name'), properties }
}

function decodeVec(tag: NbtCompound): Vec3 {
  return { x: tag.getNumber('x'), y: tag.getNumber('y'), z: tag.getNumber('z') }
}

function pickUnknown(tag: NbtCompound, known: Set<string>): NbtCompound {
  const extra = new NbtCompound()
  tag.forEach((k, v) => {
    if (!known.has(k)) extra.set(k, v)
  })
  return extra
}
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: every test so far passes, and tsc prints nothing.

- [ ] **Step 7: Commit**

```bash
git add src/core/litematic/errors.ts src/core/litematic/read.ts tests/helpers tests/core/litematic/read.test.ts
git commit -m "feat(core): read .litematic into the normalized model"
```

---

### Task 5: Writing `.litematic`

**Files:**
- Create: `src/core/litematic/write.ts`
- Test: `tests/core/litematic/write.test.ts`

**Interfaces:**
- Consumes: `bitsForPalette`, `packBits` (Task 1); model (Task 2); `writeNbt`, `wordsToLongArray` (Task 3); `readLitematic` (Task 4, tests only).
- Produces:
  - `compactRegion(region: Region): Region`: returns a new region with air at palette index 0, used entries only, key-equal entries merged, and blocks remapped. Tile entities and extras are unchanged.
  - `recomputeMetadata(schematic: Schematic, now: number): Metadata`
  - `prepareForWrite(schematic: Schematic, now: number): Schematic`: compacts regions and recomputes metadata. It returns a new object and never mutates its input.
  - `encodeLitematic(schematic: Schematic): Uint8Array`: encodes exactly the model it is given (gzip NBT).

`TotalVolume` is the sum of region volumes. `EnclosingSize` is the size of the box enclosing every region.

- [ ] **Step 1: Write the failing test**

`tests/core/litematic/write.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { NbtString } from 'deepslate/nbt'
import { readLitematic } from '../../../src/core/litematic/read'
import { compactRegion, encodeLitematic, prepareForWrite, recomputeMetadata } from '../../../src/core/litematic/write'
import { blockAt, blockStateKey, parseBlockStateKey, type Region, type Schematic } from '../../../src/core/model'
import { readNbt, writeNbt } from '../../../src/core/nbt'
import { litematicNbt, tileEntity, type LitematicSpec } from '../../helpers/litematicNbt'

const read = (spec: LitematicSpec) => readLitematic(writeNbt(litematicNbt(spec)))
const keys = (r: Region) => r.palette.map(blockStateKey)
const NOW = 1800000000000

describe('compactRegion', () => {
  it('drops unused entries and remaps indices', () => {
    const s = read({ regions: [{ size: [2, 1, 1], palette: ['minecraft:air', 'minecraft:dirt', 'minecraft:stone'], blocks: [2, 2] }] })
    const r = compactRegion(s.regions[0]!)
    expect(keys(r)).toEqual(['minecraft:air', 'minecraft:stone'])
    expect(Array.from(r.blocks)).toEqual([1, 1])
  })

  it('moves air to index 0 when the file had it elsewhere', () => {
    const s = read({ regions: [{ size: [2, 1, 1], palette: ['minecraft:stone', 'minecraft:air'], blocks: [0, 1] }] })
    const r = compactRegion(s.regions[0]!)
    expect(keys(r)).toEqual(['minecraft:air', 'minecraft:stone'])
    expect(Array.from(r.blocks)).toEqual([1, 0])
  })

  it('adds air at index 0 when the region has none', () => {
    const s = read({ regions: [{ size: [1, 1, 1], palette: ['minecraft:stone'], blocks: [0] }] })
    const r = compactRegion(s.regions[0]!)
    expect(keys(r)).toEqual(['minecraft:air', 'minecraft:stone'])
    expect(Array.from(r.blocks)).toEqual([1])
  })

  it('merges palette entries that differ only in property order', () => {
    const region = read({ regions: [{ size: [2, 1, 1], palette: ['minecraft:air'] }] }).regions[0]!
    region.palette = [
      { name: 'minecraft:oak_stairs', properties: { half: 'top', facing: 'north' } },
      { name: 'minecraft:oak_stairs', properties: { facing: 'north', half: 'top' } },
    ]
    region.blocks = Uint16Array.from([0, 1])
    const r = compactRegion(region)
    expect(r.palette).toHaveLength(2)
    expect(Array.from(r.blocks)).toEqual([1, 1])
  })

  it('narrows to Uint16Array when compaction brings the palette under the limit', () => {
    const palette = Array.from({ length: 65537 }, (_, i) => `minecraft:b${i}`)
    const s = read({ regions: [{ size: [2, 1, 1], palette, blocks: [5, 65536] }] })
    expect(compactRegion(s.regions[0]!).blocks).toBeInstanceOf(Uint16Array)
  })
})

describe('recomputeMetadata', () => {
  it('counts non-air blocks, sums volumes and encloses all regions', () => {
    const s = read({
      regions: [
        { position: [0, 0, 0], size: [2, 1, 1], palette: ['minecraft:air', 'minecraft:stone'], blocks: [0, 1] },
        { position: [5, 2, -3], size: [1, 1, 2], palette: ['minecraft:cave_air', 'minecraft:dirt'], blocks: [0, 1] },
      ],
    })
    const m = recomputeMetadata(s, NOW)
    expect(m.totalBlocks).toBe(2)
    expect(m.totalVolume).toBe(4)
    expect(m.regionCount).toBe(2)
    expect(m.enclosingSize).toEqual({ x: 6, y: 3, z: 4 })
    expect(m.timeModified).toBe(NOW)
    expect(m.timeCreated).toBe(s.metadata.timeCreated)
  })
})

describe('encodeLitematic', () => {
  function roundTrip(s: Schematic): Schematic {
    return readLitematic(encodeLitematic(prepareForWrite(s, NOW)))
  }

  it('writes blocks that read back identically', () => {
    const s = read({
      regions: [{
        size: [3, 2, 2],
        palette: ['minecraft:air', 'minecraft:stone', 'minecraft:oak_stairs[facing=north,half=top]'],
        blocks: [0, 1, 2, 1, 1, 0, 2, 2, 0, 1, 2, 0],
      }],
    })
    const back = roundTrip(s).regions[0]!
    const orig = s.regions[0]!
    for (let y = 0; y < 2; y++) for (let z = 0; z < 2; z++) for (let x = 0; x < 3; x++) {
      expect(blockStateKey(blockAt(back, x, y, z))).toBe(blockStateKey(blockAt(orig, x, y, z)))
    }
  })

  it('writes normalized positions and positive sizes', () => {
    const s = read({ regions: [{ position: [5, 0, 10], size: [-3, 2, -4], palette: ['minecraft:air'] }] })
    const region = readNbt(encodeLitematic(prepareForWrite(s, NOW))).getCompound('Regions').getCompound('region0')
    expect(region.getCompound('Position').getNumber('x')).toBe(3)
    expect(region.getCompound('Size').getNumber('z')).toBe(4)
  })

  it('preserves tile entities, strays, unknown tags and the preview image', () => {
    const s = read({
      previewImage: [7, 8],
      rootExtra: { Custom: new NbtString('root') },
      metadataExtra: { Software: new NbtString('meta') },
      regions: [{
        size: [1, 1, 1], palette: ['minecraft:chest'], blocks: [0],
        tileEntities: [tileEntity('minecraft:chest', 0, 0, 0), tileEntity('minecraft:sign', 4, 4, 4)],
        extra: { Mod: new NbtString('region') },
      }],
    })
    const back = roundTrip(s)
    expect(Array.from(back.metadata.previewImage!)).toEqual([7, 8])
    expect(back.extra.getString('Custom')).toBe('root')
    expect(back.metadata.extra.getString('Software')).toBe('meta')
    expect(back.regions[0]!.extra.getString('Mod')).toBe('region')
    expect(back.regions[0]!.tileEntities.get(0)?.getString('id')).toBe('minecraft:chest')
    expect(back.regions[0]!.strayTileEntities[0]?.getString('id')).toBe('minecraft:sign')
  })

  it('preserves non-ASCII text', () => {
    const s = read({ name: 'Château ✓ 城 🏰', regions: [{ size: [1, 1, 1], palette: ['minecraft:air'] }] })
    expect(roundTrip(s).metadata.name).toBe('Château ✓ 城 🏰')
  })

  it('keeps data version, version and sub-version', () => {
    const s = read({ dataVersion: 2586, version: 5, subVersion: null, regions: [{ size: [1, 1, 1], palette: ['minecraft:air'] }] })
    const back = roundTrip(s)
    expect([back.dataVersion, back.version, back.subVersion]).toEqual([2586, 5, undefined])
  })

  it('writes properties for states parsed from keys', () => {
    const s = read({ regions: [{ size: [1, 1, 1], palette: ['minecraft:air'] }] })
    s.regions[0]!.palette = [parseBlockStateKey('minecraft:lever[face=wall,facing=east,powered=true]')]
    expect(keys(roundTrip(s).regions[0]!)).toContain('minecraft:lever[face=wall,facing=east,powered=true]')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/core/litematic/write.test.ts`
Expected: FAIL. `src/core/litematic/write` cannot be resolved.

- [ ] **Step 3: Write the implementation**

`src/core/litematic/write.ts`:

```ts
import { NbtCompound, NbtInt, NbtIntArray, NbtList, NbtLong, NbtString } from 'deepslate/nbt'
import type { BlockState, Metadata, Region, Schematic, Vec3 } from '../model'
import { AIR, blockStateKey, createBlockArray, isAir, volumeOf } from '../model'
import { wordsToLongArray, writeNbt } from '../nbt'
import { bitsForPalette, packBits } from './bits'

/**
 * Drop unused palette entries, merge entries with equal keys, and put
 * minecraft:air at index 0 (Litematica's container default).
 */
export function compactRegion(region: Region): Region {
  const used = new Uint8Array(region.palette.length)
  for (let i = 0; i < region.blocks.length; i++) used[region.blocks[i]!] = 1

  const palette: BlockState[] = [AIR]
  const byKey = new Map<string, number>([[blockStateKey(AIR), 0]])
  const remap = new Uint32Array(region.palette.length)
  region.palette.forEach((state, oldIndex) => {
    if (!used[oldIndex]) return
    const key = blockStateKey(state)
    let newIndex = byKey.get(key)
    if (newIndex === undefined) {
      newIndex = palette.length
      palette.push(state)
      byKey.set(key, newIndex)
    }
    remap[oldIndex] = newIndex
  })

  const blocks = createBlockArray(region.blocks.length, palette.length)
  for (let i = 0; i < blocks.length; i++) blocks[i] = remap[region.blocks[i]!]!
  return { ...region, palette, blocks }
}

export function recomputeMetadata(schematic: Schematic, now: number): Metadata {
  let totalBlocks = 0
  let totalVolume = 0
  const min: Vec3 = { x: Infinity, y: Infinity, z: Infinity }
  const max: Vec3 = { x: -Infinity, y: -Infinity, z: -Infinity }
  for (const region of schematic.regions) {
    const air = region.palette.map(isAir)
    for (let i = 0; i < region.blocks.length; i++) if (!air[region.blocks[i]!]) totalBlocks++
    totalVolume += volumeOf(region.size)
    for (const axis of ['x', 'y', 'z'] as const) {
      min[axis] = Math.min(min[axis], region.position[axis])
      max[axis] = Math.max(max[axis], region.position[axis] + region.size[axis])
    }
  }
  return {
    ...schematic.metadata,
    regionCount: schematic.regions.length,
    totalBlocks,
    totalVolume,
    enclosingSize: { x: max.x - min.x, y: max.y - min.y, z: max.z - min.z },
    timeModified: now,
  }
}

/** The exact model that will be written: compacted regions and fresh metadata. */
export function prepareForWrite(schematic: Schematic, now: number): Schematic {
  const regions = schematic.regions.map(compactRegion)
  const compacted = { ...schematic, regions }
  return { ...compacted, metadata: recomputeMetadata(compacted, now) }
}

/** Encode a model as-is. Call prepareForWrite first; saveLitematic does both. */
export function encodeLitematic(schematic: Schematic): Uint8Array {
  const root = new NbtCompound().set('Version', new NbtInt(schematic.version))
  if (schematic.subVersion !== undefined) root.set('SubVersion', new NbtInt(schematic.subVersion))
  root
    .set('MinecraftDataVersion', new NbtInt(schematic.dataVersion))
    .set('Metadata', encodeMetadata(schematic.metadata))
  const regions = new NbtCompound()
  for (const region of schematic.regions) regions.set(region.name, encodeRegion(region))
  root.set('Regions', regions)
  schematic.extra.forEach((k, v) => root.set(k, v))
  return writeNbt(root)
}

function encodeMetadata(m: Metadata): NbtCompound {
  const tag = new NbtCompound()
    .set('Name', new NbtString(m.name))
    .set('Author', new NbtString(m.author))
    .set('Description', new NbtString(m.description))
    .set('RegionCount', new NbtInt(m.regionCount))
    .set('TimeCreated', new NbtLong(BigInt(m.timeCreated)))
    .set('TimeModified', new NbtLong(BigInt(m.timeModified)))
    .set('TotalBlocks', new NbtInt(m.totalBlocks))
    .set('TotalVolume', new NbtInt(m.totalVolume))
    .set('EnclosingSize', encodeVec(m.enclosingSize))
  if (m.previewImage) tag.set('PreviewImageData', new NbtIntArray(m.previewImage))
  m.extra.forEach((k, v) => tag.set(k, v))
  return tag
}

function encodeRegion(region: Region): NbtCompound {
  const palette = new NbtList(region.palette.map(encodeBlockState))
  const tileEntities = new NbtList([...region.tileEntities.values(), ...region.strayTileEntities])
  const tag = new NbtCompound()
    .set('Position', encodeVec(region.position))
    .set('Size', encodeVec(region.size))
    .set('BlockStatePalette', palette)
    .set('BlockStates', wordsToLongArray(packBits(region.blocks, bitsForPalette(region.palette.length))))
    .set('TileEntities', tileEntities)
  region.extra.forEach((k, v) => tag.set(k, v))
  return tag
}

function encodeBlockState(state: BlockState): NbtCompound {
  const entry = new NbtCompound().set('Name', new NbtString(state.name))
  const keys = Object.keys(state.properties).sort()
  if (keys.length > 0) {
    const props = new NbtCompound()
    for (const k of keys) props.set(k, new NbtString(state.properties[k]!))
    entry.set('Properties', props)
  }
  return entry
}

function encodeVec(v: Vec3): NbtCompound {
  return new NbtCompound().set('x', new NbtInt(v.x)).set('y', new NbtInt(v.y)).set('z', new NbtInt(v.z))
}
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all pass, and tsc prints nothing.

- [ ] **Step 5: Commit**

```bash
git add src/core/litematic/write.ts tests/core/litematic/write.test.ts
git commit -m "feat(core): write .litematic with palette compaction and metadata recompute"
```

---

### Task 6: Round-trip guard (`saveLitematic`)

**Files:**
- Create: `src/core/litematic/save.ts`
- Test: `tests/core/litematic/save.test.ts`

**Interfaces:**
- Consumes: `readLitematic` (Task 4); `prepareForWrite`, `encodeLitematic` (Task 5); `blockStateKey` (Task 2).
- Produces:
  - `saveLitematic(schematic: Schematic, now?: number, encode?: (s: Schematic) => Uint8Array): { bytes: Uint8Array; saved: Schematic }`. `saved` is the compacted model with recomputed metadata, and the UI should adopt it after a save. `encode` exists so tests can inject a lossy encoder. Production callers omit it.
  - `diffSchematics(a: Schematic, b: Schematic): string[]`: returns human-readable differences, empty when equivalent. Blocks are compared by block state key, so palette order doesn't matter.
  - `class RoundTripError extends Error { readonly differences: string[] }`

- [ ] **Step 1: Write the failing test**

`tests/core/litematic/save.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { NbtString } from 'deepslate/nbt'
import { readLitematic } from '../../../src/core/litematic/read'
import { diffSchematics, RoundTripError, saveLitematic } from '../../../src/core/litematic/save'
import { encodeLitematic } from '../../../src/core/litematic/write'
import { writeNbt } from '../../../src/core/nbt'
import { litematicNbt, tileEntity, type LitematicSpec } from '../../helpers/litematicNbt'

const read = (spec: LitematicSpec) => readLitematic(writeNbt(litematicNbt(spec)))
const NOW = 1800000000000
const sample = (): LitematicSpec => ({
  regions: [{
    size: [2, 2, 2],
    palette: ['minecraft:air', 'minecraft:stone', 'minecraft:chest[facing=north]'],
    blocks: [0, 1, 2, 1, 2, 0, 1, 1],
    tileEntities: [tileEntity('minecraft:chest', 0, 1, 0)],
  }],
})

describe('diffSchematics', () => {
  it('finds no differences between a schematic and itself', () => {
    const s = read(sample())
    expect(diffSchematics(s, s)).toEqual([])
  })

  it('ignores palette order when blocks resolve to the same states', () => {
    const a = read(sample())
    const b = read({ regions: [{ ...sample().regions[0]!, palette: ['minecraft:stone', 'minecraft:air', 'minecraft:chest[facing=north]'], blocks: [1, 0, 2, 0, 2, 1, 0, 0] }] })
    expect(diffSchematics(a, b)).toEqual([])
  })

  it('reports changed blocks', () => {
    const a = read(sample())
    const b = read(sample())
    b.regions[0]!.blocks[0] = 1
    expect(diffSchematics(a, b)).toEqual(['region "region0": 1 blocks differ'])
  })

  it('reports metadata and unknown tag changes', () => {
    const a = read(sample())
    const b = read({ ...sample(), name: 'Other', rootExtra: { X: new NbtString('y') } })
    expect(diffSchematics(a, b)).toEqual(['metadata.name: Test ≠ Other', 'root extra tags differ'])
  })

  it('reports a changed tile entity', () => {
    const a = read(sample())
    const b = read(sample())
    b.regions[0]!.tileEntities.get(4)!.set('CustomName', new NbtString('x'))
    expect(diffSchematics(a, b)).toEqual(['region "region0": tile entity at index 4 differs'])
  })
})

describe('saveLitematic', () => {
  it('returns bytes that read back as the saved model', () => {
    const { bytes, saved } = saveLitematic(read(sample()), NOW)
    expect(diffSchematics(saved, readLitematic(bytes))).toEqual([])
    expect(saved.metadata.timeModified).toBe(NOW)
    expect(saved.metadata.totalBlocks).toBe(6)
  })

  it('throws RoundTripError when the encoded bytes do not match', () => {
    const lossy = (s: Parameters<typeof encodeLitematic>[0]) =>
      encodeLitematic({ ...s, metadata: { ...s.metadata, author: 'someone else' } })
    expect(() => saveLitematic(read(sample()), NOW, lossy)).toThrow(RoundTripError)
  })

  it('throws RoundTripError when the encoded bytes cannot be read', () => {
    expect(() => saveLitematic(read(sample()), NOW, () => new Uint8Array([1, 2, 3]))).toThrow(RoundTripError)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/core/litematic/save.test.ts`
Expected: FAIL. `src/core/litematic/save` cannot be resolved.

- [ ] **Step 3: Write the implementation**

`src/core/litematic/save.ts`:

```ts
import type { NbtCompound } from 'deepslate/nbt'
import type { Region, Schematic, Vec3 } from '../model'
import { blockStateKey } from '../model'
import { readLitematic } from './read'
import { encodeLitematic, prepareForWrite } from './write'

export class RoundTripError extends Error {
  readonly differences: string[]

  constructor(differences: string[]) {
    super(`Saved file does not match the schematic: ${differences.slice(0, 3).join('; ')}`)
    this.name = 'RoundTripError'
    this.differences = differences
  }
}

/**
 * Prepare, encode, re-read and compare. Throws RoundTripError instead of
 * returning bytes that would not load back as the same schematic.
 */
export function saveLitematic(
  schematic: Schematic,
  now: number = Date.now(),
  encode: (s: Schematic) => Uint8Array = encodeLitematic,
): { bytes: Uint8Array; saved: Schematic } {
  const saved = prepareForWrite(schematic, now)
  const bytes = encode(saved)
  let reread: Schematic
  try {
    reread = readLitematic(bytes)
  } catch (e) {
    throw new RoundTripError([`re-read failed: ${e instanceof Error ? e.message : String(e)}`])
  }
  const differences = diffSchematics(saved, reread)
  if (differences.length > 0) throw new RoundTripError(differences)
  return { bytes, saved }
}

/** Human-readable differences between two models; empty when equivalent. */
export function diffSchematics(a: Schematic, b: Schematic): string[] {
  const out: string[] = []
  const same = (label: string, x: unknown, y: unknown) => {
    if (x !== y) out.push(`${label}: ${String(x)} ≠ ${String(y)}`)
  }
  same('Version', a.version, b.version)
  same('SubVersion', a.subVersion, b.subVersion)
  same('MinecraftDataVersion', a.dataVersion, b.dataVersion)

  const ma = a.metadata, mb = b.metadata
  for (const k of ['name', 'author', 'description', 'timeCreated', 'timeModified', 'regionCount', 'totalBlocks', 'totalVolume'] as const) {
    same(`metadata.${k}`, ma[k], mb[k])
  }
  sameVec(out, 'metadata.enclosingSize', ma.enclosingSize, mb.enclosingSize)
  if (!sameInts(ma.previewImage, mb.previewImage)) out.push('metadata.previewImage differs')
  sameTag(out, 'metadata extra tags', ma.extra, mb.extra)
  sameTag(out, 'root extra tags', a.extra, b.extra)

  same('region count', a.regions.length, b.regions.length)
  a.regions.forEach((ra, i) => {
    const rb = b.regions[i]
    if (rb) diffRegion(out, ra, rb)
  })
  return out
}

function diffRegion(out: string[], a: Region, b: Region): void {
  const p = `region "${a.name}"`
  if (a.name !== b.name) out.push(`${p}: name ≠ "${b.name}"`)
  sameVec(out, `${p} position`, a.position, b.position)
  sameVec(out, `${p} size`, a.size, b.size)
  if (a.blocks.length !== b.blocks.length) {
    out.push(`${p}: block count ${a.blocks.length} ≠ ${b.blocks.length}`)
  } else {
    // Compare by block state key, via shared integer ids, so palettes may differ in order.
    const ids = new Map<string, number>()
    const idOf = (key: string) => ids.get(key) ?? (ids.set(key, ids.size), ids.size - 1)
    const idsA = Int32Array.from(a.palette, (s) => idOf(blockStateKey(s)))
    const idsB = Int32Array.from(b.palette, (s) => idOf(blockStateKey(s)))
    let mismatches = 0
    for (let i = 0; i < a.blocks.length; i++) if (idsA[a.blocks[i]!] !== idsB[b.blocks[i]!]) mismatches++
    if (mismatches > 0) out.push(`${p}: ${mismatches} blocks differ`)
  }
  if (a.tileEntities.size !== b.tileEntities.size) {
    out.push(`${p}: ${a.tileEntities.size} tile entities ≠ ${b.tileEntities.size}`)
  }
  for (const [index, te] of a.tileEntities) {
    const other = b.tileEntities.get(index)
    if (!other || !te.equals(other)) out.push(`${p}: tile entity at index ${index} differs`)
  }
  if (a.strayTileEntities.length !== b.strayTileEntities.length ||
      a.strayTileEntities.some((te, i) => !te.equals(b.strayTileEntities[i]!))) {
    out.push(`${p}: stray tile entities differ`)
  }
  sameTag(out, `${p} extra tags`, a.extra, b.extra)
}

function sameVec(out: string[], label: string, a: Vec3, b: Vec3): void {
  if (a.x !== b.x || a.y !== b.y || a.z !== b.z) out.push(`${label}: ${a.x},${a.y},${a.z} ≠ ${b.x},${b.y},${b.z}`)
}

function sameInts(a: Int32Array | undefined, b: Int32Array | undefined): boolean {
  if (!a || !b) return a === b
  return a.length === b.length && a.every((v, i) => v === b[i])
}

function sameTag(out: string[], label: string, a: NbtCompound, b: NbtCompound): void {
  if (!a.equals(b)) out.push(`${label} differ`)
}
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all pass, and tsc prints nothing.

- [ ] **Step 5: Commit**

```bash
git add src/core/litematic/save.ts tests/core/litematic/save.test.ts
git commit -m "feat(core): round-trip guard on save"
```

---

### Task 7: Parse worker

**Files:**
- Create: `src/core/litematic/serialize.ts`, `src/workers/parseProtocol.ts`, `src/workers/parse.worker.ts`, `src/workers/parseClient.ts`
- Test: `tests/core/litematic/serialize.test.ts`, `tests/workers/parseProtocol.test.ts`

**Interfaces:**
- Consumes: `readLitematic`, `LitematicError` (Task 4); `diffSchematics` (Task 6, tests only); model (Task 2).
- Produces:
  - `serializeSchematic(s: Schematic): { data: SerializedSchematic; transfer: ArrayBuffer[] }` and `deserializeSchematic(d: SerializedSchematic): Schematic`. NBT tags travel as `NbtCompound.toJson()`. Block arrays are transferred.
  - `type ParseResponse = { ok: true; schematic: SerializedSchematic } | { ok: false; code: LitematicErrorCode | 'internal'; message: string; details: string }`
  - `handleParseRequest(buffer: ArrayBuffer): { response: ParseResponse; transfer: ArrayBuffer[] }`
  - `parseLitematicInWorker(buffer: ArrayBuffer): Promise<Schematic>`: detaches `buffer`. Rejects with `ParseFailure { code; message; details }`. Plan 4 shows `message` as the friendly error and `details` in the collapsible technical section.

Why serialization exists: `postMessage` uses structured clone, which drops class prototypes. A deepslate `NbtCompound` would arrive as a plain object with no methods. Node's global `structuredClone` behaves the same way, so the test exercises the real hazard.

`parse.worker.ts` and `parseClient.ts` are thin browser glue around `handleParseRequest` and `deserializeSchematic`, which are tested here. Task 8's `vite build` and manual check cover the glue.

- [ ] **Step 1: Write the failing tests**

`tests/core/litematic/serialize.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { NbtString } from 'deepslate/nbt'
import { readLitematic } from '../../../src/core/litematic/read'
import { diffSchematics } from '../../../src/core/litematic/save'
import { deserializeSchematic, serializeSchematic } from '../../../src/core/litematic/serialize'
import { writeNbt } from '../../../src/core/nbt'
import { litematicNbt, tileEntity } from '../../helpers/litematicNbt'

const spec = {
  previewImage: [1, 2],
  rootExtra: { Custom: new NbtString('root') },
  regions: [{
    size: [2, 1, 1] as [number, number, number],
    palette: ['minecraft:air', 'minecraft:chest[facing=east]'],
    blocks: [0, 1],
    tileEntities: [tileEntity('minecraft:chest', 1, 0, 0), tileEntity('minecraft:sign', 9, 9, 9)],
    extra: { Mod: new NbtString('region') },
  }],
}

describe('serializeSchematic / deserializeSchematic', () => {
  it('survives structured clone with transfer', () => {
    const original = readLitematic(writeNbt(litematicNbt(spec)))
    const reference = readLitematic(writeNbt(litematicNbt(spec)))
    const { data, transfer } = serializeSchematic(original)
    const cloned = structuredClone(data, { transfer })
    expect(diffSchematics(reference, deserializeSchematic(cloned))).toEqual([])
  })

  it('transfers every region block buffer', () => {
    const s = readLitematic(writeNbt(litematicNbt(spec)))
    const { transfer } = serializeSchematic(s)
    expect(transfer).toEqual([s.regions[0]!.blocks.buffer])
  })
})
```

`tests/workers/parseProtocol.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { deserializeSchematic } from '../../src/core/litematic/serialize'
import { writeNbt } from '../../src/core/nbt'
import { handleParseRequest } from '../../src/workers/parseProtocol'
import { litematicNbt } from '../helpers/litematicNbt'

const toBuffer = (bytes: Uint8Array) => bytes.slice().buffer

describe('handleParseRequest', () => {
  it('returns a serialized schematic and its transferables', () => {
    const bytes = writeNbt(litematicNbt({ regions: [{ size: [2, 1, 1], palette: ['minecraft:air', 'minecraft:stone'], blocks: [1, 0] }] }))
    const { response, transfer } = handleParseRequest(toBuffer(bytes))
    if (!response.ok) throw new Error(response.message)
    expect(transfer).toHaveLength(1)
    expect(Array.from(deserializeSchematic(response.schematic).regions[0]!.blocks)).toEqual([1, 0])
  })

  it('reports the LitematicError code and a friendly message', () => {
    const { response } = handleParseRequest(toBuffer(new TextEncoder().encode('nope')))
    expect(response).toMatchObject({ ok: false, code: 'not-nbt', message: 'This file is not a valid NBT file.' })
  })

  it('includes the underlying cause in the technical details', () => {
    const { response } = handleParseRequest(toBuffer(new TextEncoder().encode('nope')))
    if (response.ok) throw new Error('expected failure')
    expect(response.details).toContain('Caused by:')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/core/litematic/serialize.test.ts tests/workers`
Expected: FAIL. `src/core/litematic/serialize` and `src/workers/parseProtocol` cannot be resolved.

- [ ] **Step 3: Write the implementation**

`src/core/litematic/serialize.ts`:

```ts
// Schematics cross worker boundaries via structured clone, which strips class
// prototypes. NBT tags therefore travel as deepslate JSON; block arrays are
// transferred without copying.
import { NbtCompound } from 'deepslate/nbt'
import type { BlockArray } from './bits'
import type { BlockState, Metadata, Region, Schematic, Vec3 } from '../model'

type TagJson = ReturnType<NbtCompound['toJson']>

export interface SerializedRegion {
  name: string
  position: Vec3
  size: Vec3
  palette: BlockState[]
  blocks: BlockArray
  tileEntities: [number, TagJson][]
  strayTileEntities: TagJson[]
  extra: TagJson
}

export interface SerializedSchematic {
  version: number
  subVersion?: number
  dataVersion: number
  metadata: Omit<Metadata, 'extra'> & { extra: TagJson }
  regions: SerializedRegion[]
  extra: TagJson
}

export function serializeSchematic(s: Schematic): { data: SerializedSchematic; transfer: ArrayBuffer[] } {
  const transfer: ArrayBuffer[] = []
  const regions = s.regions.map((r): SerializedRegion => {
    transfer.push(r.blocks.buffer as ArrayBuffer)
    return {
      name: r.name,
      position: r.position,
      size: r.size,
      palette: r.palette,
      blocks: r.blocks,
      tileEntities: [...r.tileEntities].map(([i, te]) => [i, te.toJson()]),
      strayTileEntities: r.strayTileEntities.map((te) => te.toJson()),
      extra: r.extra.toJson(),
    }
  })
  const data: SerializedSchematic = {
    version: s.version,
    ...(s.subVersion !== undefined ? { subVersion: s.subVersion } : {}),
    dataVersion: s.dataVersion,
    metadata: { ...s.metadata, extra: s.metadata.extra.toJson() },
    regions,
    extra: s.extra.toJson(),
  }
  return { data, transfer }
}

export function deserializeSchematic(d: SerializedSchematic): Schematic {
  const regions = d.regions.map((r): Region => ({
    name: r.name,
    position: r.position,
    size: r.size,
    palette: r.palette,
    blocks: r.blocks,
    tileEntities: new Map(r.tileEntities.map(([i, json]) => [i, NbtCompound.fromJson(json)])),
    strayTileEntities: r.strayTileEntities.map((json) => NbtCompound.fromJson(json)),
    extra: NbtCompound.fromJson(r.extra),
  }))
  return {
    version: d.version,
    ...(d.subVersion !== undefined ? { subVersion: d.subVersion } : {}),
    dataVersion: d.dataVersion,
    metadata: { ...d.metadata, extra: NbtCompound.fromJson(d.metadata.extra) },
    regions,
    extra: NbtCompound.fromJson(d.extra),
  }
}
```

`src/workers/parseProtocol.ts`:

```ts
import { LitematicError, type LitematicErrorCode } from '../core/litematic/errors'
import { readLitematic } from '../core/litematic/read'
import { serializeSchematic, type SerializedSchematic } from '../core/litematic/serialize'

export type ParseResponse =
  | { ok: true; schematic: SerializedSchematic }
  | { ok: false; code: LitematicErrorCode | 'internal'; message: string; details: string }

/** Pure body of the parse worker, kept separate so it is testable in Node. */
export function handleParseRequest(buffer: ArrayBuffer): { response: ParseResponse; transfer: ArrayBuffer[] } {
  try {
    const { data, transfer } = serializeSchematic(readLitematic(new Uint8Array(buffer)))
    return { response: { ok: true, schematic: data }, transfer }
  } catch (e) {
    const code = e instanceof LitematicError ? e.code : 'internal'
    const message = e instanceof Error ? e.message : String(e)
    const cause = e instanceof Error && e.cause instanceof Error ? `\nCaused by: ${e.cause.stack ?? e.cause.message}` : ''
    const details = (e instanceof Error ? e.stack ?? message : message) + cause
    return { response: { ok: false, code, message, details }, transfer: [] }
  }
}
```

`src/workers/parse.worker.ts`:

```ts
/// <reference lib="webworker" />
import { handleParseRequest } from './parseProtocol'

declare const self: DedicatedWorkerGlobalScope

self.onmessage = (event: MessageEvent<ArrayBuffer>) => {
  const { response, transfer } = handleParseRequest(event.data)
  self.postMessage(response, transfer)
}
```

`src/workers/parseClient.ts`:

```ts
import { deserializeSchematic } from '../core/litematic/serialize'
import type { Schematic } from '../core/model'
import type { ParseResponse } from './parseProtocol'

type Failure = Extract<ParseResponse, { ok: false }>

export class ParseFailure extends Error {
  readonly code: Failure['code']
  readonly details: string

  constructor({ code, message, details }: Omit<Failure, 'ok'>) {
    super(message)
    this.name = 'ParseFailure'
    this.code = code
    this.details = details
  }
}

/** Parse a .litematic off the main thread. The buffer is transferred (detached). */
export function parseLitematicInWorker(buffer: ArrayBuffer): Promise<Schematic> {
  const worker = new Worker(new URL('./parse.worker.ts', import.meta.url), { type: 'module' })
  return new Promise<Schematic>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<ParseResponse>) => {
      worker.terminate()
      const r = event.data
      if (r.ok) resolve(deserializeSchematic(r.schematic))
      else reject(new ParseFailure(r))
    }
    worker.onerror = (event) => {
      worker.terminate()
      reject(new ParseFailure({ code: 'internal', message: 'The file reader crashed.', details: event.message }))
    }
    worker.postMessage(buffer, [buffer])
  })
}
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all pass, and tsc prints nothing.

- [ ] **Step 5: Commit**

```bash
git add src/core/litematic/serialize.ts src/workers tests/core/litematic/serialize.test.ts tests/workers
git commit -m "feat(core): parse .litematic in a web worker"
```

---

### Task 8: Real-file fixtures, dev harness, build

**Files:**
- Create: `tests/core/litematic/fixtures.test.ts`, `tests/fixtures/.gitkeep`
- Create: `vite.config.ts`, `index.html`, `src/main.ts`, `README.md`

**Interfaces:**
- Consumes: `readLitematic`, `saveLitematic`, `diffSchematics`, `parseLitematicInWorker`, `ParseFailure`.
- Produces: `npm run build` emits a static site in `dist/` (relative `base` for GitHub Pages) with the parse worker as its own chunk. The dev harness opens a file, prints a summary and saves it, which enables the manual in-game check before any real UI exists.

Real fixtures: the user supplies `.litematic` files from their game. The fixture test runs over every file in `tests/fixtures/` and skips cleanly when there are none. It is a regression harness over code that already exists, so it passes the moment a valid file lands. It is intentionally not a red-first test. If a real file fails it, that failure is the red for a new fix, handled with superpowers:systematic-debugging.

`src/main.ts` is throwaway harness code that Plan 4 replaces, so it gets no unit tests (a TDD exception to confirm with the human partner before executing).

- [ ] **Step 1: Add the fixtures test and the fixtures directory**

`tests/core/litematic/fixtures.test.ts`:

```ts
// Real .litematic files exported from the game. Drop them into
// tests/fixtures/ — every file there must survive read → save → read.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readLitematic } from '../../../src/core/litematic/read'
import { diffSchematics, saveLitematic } from '../../../src/core/litematic/save'
import { blockStateKey } from '../../../src/core/model'

const dir = join(import.meta.dirname, '../../fixtures')
const files = readdirSync(dir).filter((f) => f.endsWith('.litematic'))

describe.skipIf(files.length === 0)('real fixtures', () => {
  it.each(files)('%s round-trips through save', (file) => {
    const original = readLitematic(readFileSync(join(dir, file)))
    const { bytes, saved } = saveLitematic(original, original.metadata.timeModified)
    expect(diffSchematics(saved, readLitematic(bytes))).toEqual([])
  })

  it.each(files)('%s keeps every block state after save', (file) => {
    const original = readLitematic(readFileSync(join(dir, file)))
    const { saved } = saveLitematic(original, original.metadata.timeModified)
    original.regions.forEach((r, i) => {
      const s = saved.regions[i]!
      for (let b = 0; b < r.blocks.length; b++) {
        if (blockStateKey(r.palette[r.blocks[b]!]!) !== blockStateKey(s.palette[s.blocks[b]!]!)) {
          throw new Error(`${file}: region ${r.name} block ${b} changed`)
        }
      }
    })
  })
})
```

Run: `touch tests/fixtures/.gitkeep && npx vitest run tests/core/litematic/fixtures.test.ts`
Expected: the suite is reported as skipped (no fixtures yet). If the user has provided fixtures, copy them into `tests/fixtures/` first. Every file must pass. A failure is a real bug: stop and debug it before continuing.

- [ ] **Step 2: Add the Vite config and dev harness**

`vite.config.ts`:

```ts
import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  worker: { format: 'es' },
})
```

`index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Schematic Editor</title>
  </head>
  <body>
    <input id="file" type="file" accept=".litematic" />
    <button id="save" disabled>Save</button>
    <pre id="out"></pre>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`src/main.ts`:

```ts
// Temporary dev harness for Plan 1: open → summary → save. Replaced by the React UI.
import { saveLitematic } from './core/litematic/save'
import type { Schematic } from './core/model'
import { parseLitematicInWorker, ParseFailure } from './workers/parseClient'

const input = document.querySelector<HTMLInputElement>('#file')!
const saveButton = document.querySelector<HTMLButtonElement>('#save')!
const out = document.querySelector<HTMLPreElement>('#out')!
let current: Schematic | undefined

input.addEventListener('change', async () => {
  const file = input.files?.[0]
  if (!file) return
  out.textContent = 'Reading…'
  try {
    current = await parseLitematicInWorker(await file.arrayBuffer())
    saveButton.disabled = false
    out.textContent = JSON.stringify({
      name: current.metadata.name,
      author: current.metadata.author,
      dataVersion: current.dataVersion,
      regions: current.regions.map((r) => ({ name: r.name, position: r.position, size: r.size, palette: r.palette.length })),
    }, null, 2)
  } catch (e) {
    out.textContent = e instanceof ParseFailure ? `${e.message}\n\n${e.details}` : String(e)
  }
})

saveButton.addEventListener('click', () => {
  if (!current) return
  try {
    const { bytes } = saveLitematic(current)
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/octet-stream' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: `${current.metadata.name || 'schematic'}.litematic` })
    a.click()
    URL.revokeObjectURL(url)
  } catch (e) {
    out.textContent = String(e)
  }
})
```

- [ ] **Step 3: Verify typecheck, the full suite, and the build**

Run: `npx tsc --noEmit && npx vitest run && npx vite build`
Expected: tsc prints nothing. All tests pass, with the fixtures suite skipped or passing. The build output lists `dist/index.html`, a `dist/assets/parse.worker-*.js` chunk and a `dist/assets/index-*.js` chunk.

- [ ] **Step 4: Smoke-test the harness in a browser**

Run: `npm run dev`, open the printed URL, and pick a `.litematic` file (a fixture, or any file from `.minecraft/schematics/`).
Expected: a JSON summary with name, author, data version, and regions with sizes. Picking a non-schematic file (e.g. a `.png`) shows "This file is not a valid NBT file." plus technical details. **Save** downloads `<name>.litematic`.

- [ ] **Step 5: Write the README**

`README.md`:

````markdown
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
````

- [ ] **Step 6: Commit**

```bash
git add vite.config.ts index.html src/main.ts README.md tests/core/litematic/fixtures.test.ts tests/fixtures/.gitkeep
git commit -m "feat: real-file round-trip fixtures, dev harness and static build"
```

- [ ] **Step 7: Manual in-game check (human partner)**

Follow the README's "Manual in-game check" with at least one real schematic, and record the result in the task report. This is the spec's first success criterion ("An edited file loads correctly in Litematica"). The file is saved, not yet edited, because editing arrives in Plan 2.
