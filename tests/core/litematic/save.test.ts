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

  it('reports a fileBox mismatch', () => {
    const a = read(sample())
    const b = read(sample())
    b.regions[0]!.fileBox = { position: { x: 1, y: 2, z: 3 }, size: { x: 2, y: 2, z: 2 } }
    expect(diffSchematics(a, b)).toEqual(['region "region0": fileBox differs'])
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
