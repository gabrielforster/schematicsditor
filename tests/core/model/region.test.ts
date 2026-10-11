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
