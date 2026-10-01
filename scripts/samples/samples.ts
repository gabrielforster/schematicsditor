// The synthetic schematics this repo ships: the empty state's sample house
// (also the end-to-end fixture) and a round-trip fixture for wide palettes.
// Deterministic: no clocks, no randomness. `npm run generate:samples`
// writes them; tests/scripts/samples.test.ts checks the committed copies.
import { NbtByte, NbtCompound, NbtDouble, NbtFloat, NbtInt, NbtIntArray, NbtList, NbtString } from 'deepslate/nbt'
import { saveLitematic } from '../../src/core/litematic/save'
import type { Schematic } from '../../src/core/model'
import { bundledRegistry, type BlockRegistry } from '../../src/core/registry'
import { RegionBuilder } from './regionBuilder'

/** 2026-01-01T00:00:00Z: TimeCreated and TimeModified of every sample. */
export const SAMPLE_TIME = 1767225600000

/** Litematica's schematic format version for 1.20.5+ files, and its sub-version. */
const LITEMATIC_VERSION = 7
const LITEMATIC_SUB_VERSION = 1

function schematic(name: string, description: string, dataVersion: number, regions: Schematic['regions'], version = LITEMATIC_VERSION): Schematic {
  return {
    version,
    subVersion: LITEMATIC_SUB_VERSION,
    dataVersion,
    metadata: {
      name,
      author: 'schematicsditor',
      description,
      timeCreated: SAMPLE_TIME,
      timeModified: SAMPLE_TIME,
      // Recomputed on save.
      regionCount: 0, totalBlocks: 0, totalVolume: 0, enclosingSize: { x: 0, y: 0, z: 0 },
      extra: new NbtCompound(),
    },
    regions,
    extra: new NbtCompound(),
  }
}

const item = (slot: number, id: string, count: number) =>
  new NbtCompound().set('Slot', new NbtByte(slot)).set('id', new NbtString(id)).set('count', new NbtInt(count))

/**
 * A 7×6×7 house with a cobblestone floor, log corners, plank walls, glass
 * windows, a door, a stair-and-slab roof, a chest with items and a wall
 * torch, next to a 4×2×7 garden stored with a negative size (the way
 * Litematica saves a box selected from its far corner) that holds grass,
 * flowers, a fence, a water source and an armor stand.
 */
export function buildSampleHouse(registry: BlockRegistry = bundledRegistry()): Schematic {
  const house = new RegionBuilder('House', { x: 0, y: 0, z: 0 }, { x: 7, y: 6, z: 7 }, registry)
  house.fill(0, 0, 0, 6, 0, 6, 'cobblestone')
  for (let y = 1; y <= 3; y++) {
    house.fill(0, y, 0, 6, y, 0, 'oak_planks').fill(0, y, 6, 6, y, 6, 'oak_planks')
    house.fill(0, y, 0, 0, y, 6, 'oak_planks').fill(6, y, 0, 6, y, 6, 'oak_planks')
    for (const [x, z] of [[0, 0], [6, 0], [0, 6], [6, 6]] as const) house.set(x, y, z, 'oak_log[axis=y]')
  }
  house.set(3, 1, 0, 'oak_door[facing=south,half=lower,hinge=left]')
  house.set(3, 2, 0, 'oak_door[facing=south,half=upper,hinge=left]')
  for (const [x, z] of [[1, 0], [5, 0], [0, 3], [6, 3], [3, 6]] as const) house.set(x, 2, z, 'glass')
  house.set(1, 1, 5, 'chest[facing=south]')
  house.tileEntity(1, 1, 5, new NbtCompound()
    .set('id', new NbtString('minecraft:chest'))
    .set('Items', new NbtList([item(0, 'minecraft:torch', 16), item(1, 'minecraft:bread', 8), item(13, 'minecraft:oak_sapling', 3)])))
  house.set(5, 2, 5, 'wall_torch[facing=north]')
  house.fill(1, 4, 1, 5, 4, 5, 'oak_planks')
  house.fill(0, 4, 0, 6, 4, 0, 'oak_stairs[facing=south]')
  house.fill(0, 4, 6, 6, 4, 6, 'oak_stairs[facing=north]')
  house.fill(0, 4, 1, 0, 4, 5, 'oak_stairs[facing=east]')
  house.fill(6, 4, 1, 6, 4, 5, 'oak_stairs[facing=west]')
  house.fill(1, 5, 1, 5, 5, 5, 'oak_slab[type=bottom]')

  // Normalized box x 7..10, y 0..1, z 0..6; stored as Position (10,0,6), Size (-4,2,-7).
  const garden = new RegionBuilder('Garden', { x: 7, y: 0, z: 0 }, { x: 4, y: 2, z: 7 }, registry)
  garden.fill(0, 0, 0, 3, 0, 6, 'grass_block')
  garden.set(1, 0, 3, 'water[level=0]')
  garden.fill(3, 1, 0, 3, 1, 6, 'oak_fence')
  garden.set(1, 1, 1, 'poppy').set(2, 1, 1, 'dandelion').set(0, 1, 5, 'oxeye_daisy')
  // Entity Pos is relative to the raw file Position (10,0,6), not the min corner:
  // local block (2,1,5) is world (9,1,5), so its centre is (9.5-10, 1, 5.5-6).
  garden.entity(new NbtCompound()
    .set('id', new NbtString('minecraft:armor_stand'))
    .set('Pos', new NbtList([new NbtDouble(-0.5), new NbtDouble(1), new NbtDouble(-0.5)]))
    .set('Motion', new NbtList([new NbtDouble(0), new NbtDouble(0), new NbtDouble(0)]))
    .set('Rotation', new NbtList([new NbtFloat(180), new NbtFloat(0)]))
    .set('UUID', new NbtIntArray([0x5c4e3d2b, 0x1a2b3c4d, -0x5e6f7081, 0x01020304]))
    .set('ShowArms', new NbtByte(1)))

  return schematic(
    'Sample house',
    'A small synthetic schematic bundled with the editor: two regions, one stored with a negative size.',
    registry.version?.dataVersion ?? 5023,
    [house.build(), garden.build({ position: { x: 10, y: 0, z: 6 }, size: { x: -4, y: 2, z: -7 } })],
  )
}

/**
 * Round-trip fixture: one 17×3×13 region whose palette has 300 block states
 * plus a mod block (9 bits per entry, so entries span two longs), and
 * unknown tags at the root, metadata and region level. Older data and
 * format versions (Minecraft 1.21, Litematica format 6). Not meant for the
 * in-game check: some states may not exist in 1.21.
 */
export function buildWidePalette(registry: BlockRegistry = bundledRegistry()): Schematic {
  const size = { x: 17, y: 3, z: 13 }
  const region = new RegionBuilder('Wide palette', { x: 0, y: 0, z: 0 }, size, registry)
  const names = registry.names().filter((n) => !n.endsWith('air')).slice(0, 300)
  let i = 0
  for (let y = 0; y < size.y; y++) {
    for (let z = 0; z < size.z; z++) {
      for (let x = 0; x < size.x; x++, i++) {
        // Leave a little air so TotalBlocks differs from TotalVolume.
        if (i % 37 === 0) continue
        region.set(x, y, z, i % 101 === 0 ? 'examplemod:mystery_block' : names[i % names.length]!)
      }
    }
  }
  const built = region.build()
  built.extra.set('schematicsditor:RegionNote', new NbtString('unknown region tag'))
  const s = schematic('Wide palette', 'Round-trip fixture: 301 palette entries, unknown tags.', 3953, [built], 6)
  s.metadata.extra.set('schematicsditor:MetadataNote', new NbtString('unknown metadata tag'))
  s.extra.set('schematicsditor:RootNote', new NbtCompound().set('answer', new NbtInt(42)))
  return s
}

/** Encode a sample through the core writer and its round-trip guard, at SAMPLE_TIME. */
export function encodeSample(s: Schematic): Uint8Array {
  return saveLitematic(s, SAMPLE_TIME).bytes
}

/** Every committed sample file (repo-relative path) and the builder that makes it. */
export const SAMPLE_FILES: readonly { path: string; build: () => Schematic }[] = [
  { path: 'src/assets/sample.litematic', build: buildSampleHouse },
  { path: 'tests/fixtures/sample-house.litematic', build: buildSampleHouse },
  { path: 'tests/fixtures/wide-palette.litematic', build: buildWidePalette },
]
