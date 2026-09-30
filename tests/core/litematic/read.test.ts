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

  it('keeps the raw Position/Size from the file as fileBox', () => {
    const s = read({ regions: [{ position: [5, 0, 10], size: [-3, 2, -4], palette: ['minecraft:air'] }] })
    expect(s.regions[0]!.fileBox).toEqual({
      position: { x: 5, y: 0, z: 10 },
      size: { x: -3, y: 2, z: -4 },
    })
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

  it('rejects files without a Version', () => {
    expectLitematicError(() => read({ version: null, regions: [{ size: [1, 1, 1], palette: ['minecraft:air'] }] }), 'corrupt')
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
