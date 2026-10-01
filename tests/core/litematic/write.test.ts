import { describe, expect, it } from 'vitest'
import { NbtCompound, NbtDouble, NbtList, NbtString } from 'deepslate/nbt'
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

describe('recomputeMetadata with no regions', () => {
  it('reports an empty enclosing box instead of Infinity or NaN', () => {
    const s = read({ regions: [{ size: [1, 1, 1], palette: ['minecraft:stone'] }] })
    const m = recomputeMetadata({ ...s, regions: [] }, NOW)
    expect(m.enclosingSize).toEqual({ x: 0, y: 0, z: 0 })
    expect(m.totalVolume).toBe(0)
    expect(m.totalBlocks).toBe(0)
    expect(m.regionCount).toBe(0)
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

  it("writes the file's original negative-size corner back unchanged", () => {
    const s = read({ regions: [{ position: [5, 0, 10], size: [-3, 2, -4], palette: ['minecraft:air'] }] })
    const region = readNbt(encodeLitematic(prepareForWrite(s, NOW))).getCompound('Regions').getCompound('region0')
    const pos = region.getCompound('Position')
    const size = region.getCompound('Size')
    expect([pos.getNumber('x'), pos.getNumber('y'), pos.getNumber('z')]).toEqual([5, 0, 10])
    expect([size.getNumber('x'), size.getNumber('y'), size.getNumber('z')]).toEqual([-3, 2, -4])
  })

  it('keeps entity positions valid for a negative-size region', () => {
    const entity = new NbtCompound()
      .set('id', new NbtString('minecraft:armor_stand'))
      .set('Pos', new NbtList([new NbtDouble(5.5), new NbtDouble(1.0), new NbtDouble(10.5)]))
    const s = read({
      regions: [{
        position: [5, 0, 10],
        size: [-3, 2, -4],
        palette: ['minecraft:air'],
        extra: { Entities: new NbtList([entity]) },
      }],
    })
    const before = s.regions[0]!
    const beforePos = before.fileBox!.position
    const beforeEntityPos = before.extra.getList('Entities', 10).getItems()[0]!.getList('Pos', 6)
    const beforeAbsolute = beforeEntityPos.getItems().map((n, i) => n.getAsNumber() + [beforePos.x, beforePos.y, beforePos.z][i]!)

    const back = roundTrip(s).regions[0]!
    const afterPos = back.fileBox!.position
    const afterEntityPos = back.extra.getList('Entities', 10).getItems()[0]!.getList('Pos', 6)
    const afterAbsolute = afterEntityPos.getItems().map((n, i) => n.getAsNumber() + [afterPos.x, afterPos.y, afterPos.z][i]!)

    expect(afterAbsolute).toEqual(beforeAbsolute)
  })

  it('writes the normalized form when the region has no fileBox', () => {
    const s = read({ regions: [{ position: [3, 0, 7], size: [3, 2, 4], palette: ['minecraft:air'] }] })
    const region = { ...s.regions[0]!, fileBox: undefined }
    const encoded = readNbt(encodeLitematic(prepareForWrite({ ...s, regions: [region] }, NOW)))
      .getCompound('Regions').getCompound('region0')
    const pos = encoded.getCompound('Position')
    const size = encoded.getCompound('Size')
    expect([pos.getNumber('x'), pos.getNumber('y'), pos.getNumber('z')]).toEqual([3, 0, 7])
    expect([size.getNumber('x'), size.getNumber('y'), size.getNumber('z')]).toEqual([3, 2, 4])
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
