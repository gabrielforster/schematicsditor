import { describe, expect, it } from 'vitest'
import { DirtyChunks, dirtyChunksForIndices } from '../../../src/core/edit/events'
import { blockIndex } from '../../../src/core/model'

const size = { x: 40, y: 20, z: 33 } // 3 × 2 × 3 chunks

describe('DirtyChunks', () => {
  it('marks only the containing chunk for an interior block', () => {
    const d = new DirtyChunks(size)
    d.mark(20, 5, 20)
    expect(d.list()).toEqual([{ cx: 1, cy: 0, cz: 1 }])
  })

  it('marks face neighbours for blocks on a chunk boundary', () => {
    const d = new DirtyChunks(size)
    d.mark(16, 15, 31)
    expect(d.list()).toEqual([
      { cx: 0, cy: 0, cz: 1 },
      { cx: 1, cy: 0, cz: 1 },
      { cx: 1, cy: 0, cz: 2 },
      { cx: 1, cy: 1, cz: 1 },
    ])
  })

  it('does not mark chunks outside the region', () => {
    const d = new DirtyChunks({ x: 16, y: 16, z: 16 })
    d.mark(0, 0, 0)
    d.mark(15, 15, 15)
    expect(d.list()).toEqual([{ cx: 0, cy: 0, cz: 0 }])
  })

  it('marks by block index the same as by coordinates', () => {
    const a = new DirtyChunks(size)
    const b = new DirtyChunks(size)
    a.mark(17, 3, 30)
    b.markIndex(blockIndex(size, 17, 3, 30))
    expect(b.list()).toEqual(a.list())
  })
})

describe('dirtyChunksForIndices', () => {
  it('collects every chunk once', () => {
    const indices = [blockIndex(size, 20, 5, 20), blockIndex(size, 21, 5, 20), blockIndex(size, 36, 5, 5)]
    expect(dirtyChunksForIndices(size, indices)).toEqual([{ cx: 2, cy: 0, cz: 0 }, { cx: 1, cy: 0, cz: 1 }])
  })
})
