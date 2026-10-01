import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bitsForPalette } from '../../src/core/litematic/bits'
import { readLitematic } from '../../src/core/litematic/read'
import { blockStateKey, isAir } from '../../src/core/model'
import { readNbt } from '../../src/core/nbt'
import { bundledRegistry } from '../../src/core/registry'
import { buildSampleHouse, buildWidePalette, encodeSample, SAMPLE_FILES, SAMPLE_TIME } from '../../scripts/samples/samples'

const root = join(import.meta.dirname, '../..')
const registry = bundledRegistry()
const house = () => readLitematic(encodeSample(buildSampleHouse()))

describe('sample house', () => {
  it('has a positive House region and a Garden stored with a negative size', () => {
    const s = house()
    expect(s.regions.map((r) => r.name)).toEqual(['House', 'Garden'])
    const garden = s.regions[1]!
    expect(garden.fileBox).toEqual({ position: { x: 10, y: 0, z: 6 }, size: { x: -4, y: 2, z: -7 } })
    expect(garden.position).toEqual({ x: 7, y: 0, z: 0 })
    expect(garden.size).toEqual({ x: 4, y: 2, z: 7 })
  })

  it('records metadata for the bundled Minecraft version', () => {
    const s = house()
    expect(s.dataVersion).toBe(registry.version!.dataVersion)
    expect(s.metadata).toMatchObject({
      name: 'Sample house', author: 'schematicsditor', regionCount: 2,
      timeCreated: SAMPLE_TIME, timeModified: SAMPLE_TIME,
      totalVolume: 7 * 6 * 7 + 4 * 2 * 7, enclosingSize: { x: 11, y: 6, z: 7 },
    })
  })

  it('has stairs, glass, a door, a wall torch and water', () => {
    const names = new Set(house().regions.flatMap((r) => r.palette.map((p) => p.name)))
    for (const n of ['oak_stairs', 'glass', 'oak_door', 'wall_torch', 'water', 'chest']) {
      expect(names).toContain(`minecraft:${n}`)
    }
  })

  it('keeps the chest contents as block entity data', () => {
    const houseRegion = house().regions[0]!
    const [chest] = [...houseRegion.tileEntities.values()]
    expect(chest!.getString('id')).toBe('minecraft:chest')
    expect(chest!.getList('Items', 10).map((i) => [i.getString('id'), i.getNumber('count')]))
      .toEqual([['minecraft:torch', 16], ['minecraft:bread', 8], ['minecraft:oak_sapling', 3]])
  })

  it('places the armor stand relative to the raw garden Position, on a grass block', () => {
    const garden = house().regions[1]!
    const [stand] = garden.extra.getList('Entities', 10).getItems()
    const pos = stand!.getList('Pos', 6).map((d) => d.getAsNumber())
    expect(pos).toEqual([-0.5, 1, -0.5])
    // Raw Position (10,0,6) + Pos → world (9.5,1,5.5); min corner (7,0,0) → local (2,1,5), above grass.
    const local = { x: 10 + pos[0]! - 7, y: pos[1]!, z: 6 + pos[2]! - 0 }
    const below = garden.palette[garden.blocks[(local.y - 1) * 4 * 7 + Math.floor(local.z) * 4 + Math.floor(local.x)]!]!
    expect(below.name).toBe('minecraft:grass_block')
  })
})

describe('every sample', () => {
  it.each([['house', buildSampleHouse], ['wide palette', buildWidePalette]] as const)(
    '%s uses complete, valid states for every vanilla block', (_, build) => {
      for (const region of readLitematic(encodeSample(build())).regions) {
        for (const state of region.palette) {
          if (!state.name.startsWith('minecraft:') || isAir(state)) continue
          const def = registry.get(state.name)
          expect(def, state.name).toBeDefined()
          expect(Object.keys(state.properties).sort(), blockStateKey(state)).toEqual(Object.keys(def!.properties).sort())
          for (const [k, v] of Object.entries(state.properties)) expect(def!.properties[k]).toContain(v)
        }
      }
    })
})

describe('wide palette fixture', () => {
  it('needs 9 bits per entry and keeps a mod block and unknown tags', () => {
    const s = readLitematic(encodeSample(buildWidePalette()))
    const region = s.regions[0]!
    expect(bitsForPalette(region.palette.length)).toBe(9)
    expect(region.palette.map((p) => p.name)).toContain('examplemod:mystery_block')
    expect(region.extra.getString('schematicsditor:RegionNote')).toBe('unknown region tag')
    expect(s.metadata.extra.getString('schematicsditor:MetadataNote')).toBe('unknown metadata tag')
    expect(s.extra.getCompound('schematicsditor:RootNote').getNumber('answer')).toBe(42)
    expect(s.dataVersion).toBe(3953)
    expect(s.version).toBe(6)
  })
})

describe('committed sample files', () => {
  it.each(SAMPLE_FILES.map((f) => [f.path, f] as const))('%s matches its builder (run `npm run generate:samples`)', (_, file) => {
    const committed = readNbt(readFileSync(join(root, file.path)))
    expect(committed.equals(readNbt(encodeSample(file.build())))).toBe(true)
  })
})
