import { describe, expect, it } from 'vitest'
import { allChunks, chunkCounts, chunkInnerSize, chunkKey } from '../../../src/render/chunks/coords'
import { extractChunk } from '../../../src/render/chunks/extract'
import { paddedIndex } from '../../../src/render/mesh/types'
import { makeRegion } from '../../helpers/model'

/** 18×18×18 region: stone at y=0, oak stairs at (16,0,0), dirt at y=17, air elsewhere. */
function bigRegion() {
  const size = 18
  const blocks = new Array<number>(size ** 3).fill(0)
  const at = (x: number, y: number, z: number) => y * size * size + z * size + x
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    blocks[at(x, 0, z)] = 1
    blocks[at(x, 17, z)] = 3
  }
  blocks[at(16, 0, 0)] = 2
  return makeRegion({
    size: [size, size, size],
    palette: ['minecraft:air', 'minecraft:stone', 'minecraft:oak_stairs[facing=north,half=bottom]', 'minecraft:dirt'],
    blocks,
  })
}

describe('chunk coordinates', () => {
  it('counts partial chunks at the far edges', () => {
    expect(chunkCounts({ x: 17, y: 16, z: 1 })).toEqual({ x: 2, y: 1, z: 1 })
    expect(chunkInnerSize({ x: 17, y: 16, z: 1 }, { cx: 1, cy: 0, cz: 0 })).toEqual({ x: 1, y: 16, z: 1 })
    expect(allChunks({ x: 17, y: 16, z: 1 })).toEqual([{ cx: 0, cy: 0, cz: 0 }, { cx: 1, cy: 0, cz: 0 }])
  })

  it('keys chunks by region, position and pass', () => {
    expect(chunkKey(2, { cx: 1, cy: 0, cz: 3 }, 'ghost')).toBe('2/1,0,3/ghost')
  })
})

describe('extractChunk', () => {
  it('copies the chunk with a border from neighbouring chunks', () => {
    const slice = extractChunk(bigRegion(), { cx: 0, cy: 0, cz: 0 })!
    expect(slice.size).toEqual({ x: 16, y: 16, z: 16 })
    expect(slice.states).toEqual(['minecraft:air', 'minecraft:stone', 'minecraft:oak_stairs[facing=north,half=bottom]'])
    expect(slice.cells[paddedIndex(slice.size, 0, 0, 0)]).toBe(1)
    expect(slice.cells[paddedIndex(slice.size, 16, 0, 0)]).toBe(2) // border cell from chunk cx=1
    expect(slice.cells[paddedIndex(slice.size, -1, 0, 0)]).toBe(0) // outside the region
    expect(slice.cells[paddedIndex(slice.size, 0, -1, 0)]).toBe(0)
    expect(slice.faded).toBeNull()
  })

  it('maps every air variant to local id 0', () => {
    const r = makeRegion({ size: [2, 1, 1], palette: ['minecraft:cave_air', 'minecraft:stone'], blocks: [0, 1] })
    const slice = extractChunk(r, { cx: 0, cy: 0, cz: 0 })!
    expect(slice.states).toEqual(['minecraft:air', 'minecraft:stone'])
    expect(slice.cells[paddedIndex(slice.size, 0, 0, 0)]).toBe(0)
  })

  it('returns null for a chunk with only air inside, even if the border has blocks', () => {
    const blocks = new Array<number>(17).fill(0)
    blocks[15] = 1 // last block of chunk cx=0, in the border of chunk cx=1
    const r = makeRegion({ size: [17, 1, 1], palette: ['minecraft:air', 'minecraft:stone'], blocks })
    expect(extractChunk(r, { cx: 1, cy: 0, cz: 0 })).toBeNull()
    expect(extractChunk(r, { cx: 0, cy: 0, cz: 0 })).not.toBeNull()
  })

  it('reads blocks outside the Y range as air, so cut faces render', () => {
    const slice = extractChunk(bigRegion(), { cx: 0, cy: 0, cz: 0 }, { yRange: { min: 0, max: 0 } })!
    expect(slice.cells[paddedIndex(slice.size, 0, 0, 0)]).toBe(1)
    expect(slice.cells[paddedIndex(slice.size, 0, 1, 0)]).toBe(0)
  })

  it('returns null when the Y range misses the chunk', () => {
    expect(extractChunk(bigRegion(), { cx: 0, cy: 1, cz: 0 }, { yRange: { min: 0, max: 5 } })).toBeNull()
    expect(extractChunk(bigRegion(), { cx: 0, cy: 0, cz: 0 }, { yRange: { min: 16, max: 17 } })).toBeNull()
  })

  it('marks states outside the highlight set as faded', () => {
    const slice = extractChunk(bigRegion(), { cx: 0, cy: 0, cz: 0 }, { highlight: new Set(['minecraft:oak_stairs']) })!
    expect(Array.from(slice.faded!)).toEqual([0, 1, 0])
  })

  it('reads 32-bit block arrays with palette indices above 65,535', () => {
    const r = makeRegion({ size: [2, 1, 1], palette: ['minecraft:air'], blocks: [0, 0] })
    r.palette = Array.from({ length: 70_000 }, () => ({ name: 'minecraft:stone', properties: {} }))
    r.palette[0] = { name: 'minecraft:air', properties: {} }
    r.palette[69_999] = { name: 'minecraft:gold_block', properties: {} }
    r.blocks = Uint32Array.from([69_999, 0])
    const slice = extractChunk(r, { cx: 0, cy: 0, cz: 0 })!
    expect(slice.states).toEqual(['minecraft:air', 'minecraft:gold_block'])
    expect(slice.cells[paddedIndex(slice.size, 0, 0, 0)]).toBe(1)
  })

  it('reads the live palette at call time', () => {
    const r = makeRegion({ size: [1, 1, 1], palette: ['minecraft:stone'], blocks: [0] })
    r.palette[0] = { name: 'minecraft:dirt', properties: {} }
    expect(extractChunk(r, { cx: 0, cy: 0, cz: 0 })!.states).toEqual(['minecraft:air', 'minecraft:dirt'])
  })
})
