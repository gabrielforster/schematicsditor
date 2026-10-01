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

  it('finds the chunks holding changed palette slots', () => {
    expect(chunksForChange(region, { regionId: 0, paletteChange: { slots: [1] } })).toEqual([{ cx: 0, cy: 0, cz: 0 }])
  })

  it('includes neighbours whose border holds a changed slot', () => {
    expect(chunksForChange(region, { regionId: 0, paletteChange: { slots: [2] } })).toEqual([
      { cx: 0, cy: 0, cz: 0 }, { cx: 1, cy: 0, cz: 0 },
    ])
  })

  it('ignores slots past the end of the palette', () => {
    expect(chunksForChange(region, { regionId: 0, paletteChange: { slots: [9] } })).toEqual([])
  })
})
