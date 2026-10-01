import { describe, expect, it } from 'vitest'
import { chunksForChange } from '../../../src/render/chunks/invalidate'
import { makeRegion } from '../../helpers/model'

describe('chunksForChange', () => {
  // 40 × 1 × 1: chunks cx = 0, 1, 2. Slot 1 at x = 5 (chunk 0), slot 2 at x = 16 (chunk 1, on its lower face).
  const blocks = new Array<number>(40).fill(0)
  blocks[5] = 1
  blocks[16] = 2
  const region = makeRegion({ size: [40, 1, 1], palette: ['minecraft:air', 'minecraft:stone', 'minecraft:dirt'], blocks })

  it('passes dirty chunk lists through', () => {
    expect(chunksForChange(region, { regionId: 0, dirtyChunks: [{ cx: 2, cy: 0, cz: 0 }] })).toEqual([{ cx: 2, cy: 0, cz: 0 }])
  })

  it('finds the chunks holding changed palette slots, plus their face neighbours', () => {
    expect(chunksForChange(region, { regionId: 0, paletteChange: { slots: [1] } })).toEqual([
      { cx: 0, cy: 0, cz: 0 }, { cx: 1, cy: 0, cz: 0 },
    ])
  })

  it('marks a chunk with a change in its interior and every in-bounds face neighbour', () => {
    // 48 × 48 × 48: 3 × 3 × 3 chunks. Slot 1 only in the interior of the centre chunk (1, 1, 1).
    const n = 48
    const cube = new Array<number>(n * n * n).fill(0)
    cube[24 * n * n + 24 * n + 24] = 1
    const big = makeRegion({ size: [n, n, n], palette: ['minecraft:air', 'minecraft:stone'], blocks: cube })
    expect(chunksForChange(big, { regionId: 0, paletteChange: { slots: [1] } })).toEqual([
      { cx: 1, cy: 0, cz: 1 },
      { cx: 1, cy: 1, cz: 0 },
      { cx: 0, cy: 1, cz: 1 }, { cx: 1, cy: 1, cz: 1 }, { cx: 2, cy: 1, cz: 1 },
      { cx: 1, cy: 1, cz: 2 },
      { cx: 1, cy: 2, cz: 1 },
    ])
    // A corner chunk: only its in-bounds neighbours.
    cube.fill(0)
    cube[2 * n * n + 2 * n + 2] = 1
    const corner = makeRegion({ size: [n, n, n], palette: ['minecraft:air', 'minecraft:stone'], blocks: cube })
    expect(chunksForChange(corner, { regionId: 0, paletteChange: { slots: [1] } })).toEqual([
      { cx: 0, cy: 0, cz: 0 }, { cx: 1, cy: 0, cz: 0 }, { cx: 0, cy: 0, cz: 1 }, { cx: 0, cy: 1, cz: 0 },
    ])
  })

  it('includes neighbours whose border holds a changed slot', () => {
    expect(chunksForChange(region, { regionId: 0, paletteChange: { slots: [2] } })).toEqual([
      { cx: 0, cy: 0, cz: 0 }, { cx: 1, cy: 0, cz: 0 }, { cx: 2, cy: 0, cz: 0 },
    ])
  })

  it('ignores slots past the end of the palette', () => {
    expect(chunksForChange(region, { regionId: 0, paletteChange: { slots: [9] } })).toEqual([])
  })
})
