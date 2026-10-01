import { describe, expect, it } from 'vitest'
import { forEachIndexInScope, indexInScope, paletteCounts, resolveScopes } from '../../../src/core/edit/scopes'
import { makeSchematic } from '../../helpers/model'

// Region 0: 4×4×4 at the origin. Region 1: 2×2×2 at (10, 2, 0).
const schematic = makeSchematic([
  { size: [4, 4, 4], palette: ['minecraft:air'] },
  { position: [10, 2, 0], size: [2, 2, 2], palette: ['minecraft:air'] },
])

describe('resolveScopes', () => {
  it('covers every region whole with no scopes', () => {
    expect(resolveScopes(schematic, [])).toEqual([
      { regionId: 0, min: { x: 0, y: 0, z: 0 }, max: { x: 3, y: 3, z: 3 }, whole: true },
      { regionId: 1, min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 }, whole: true },
    ])
  })

  it('treats the whole scope as no restriction', () => {
    expect(resolveScopes(schematic, [{ kind: 'whole' }])).toEqual(resolveScopes(schematic, []))
  })

  it('keeps only the selected regions', () => {
    expect(resolveScopes(schematic, [{ kind: 'regions', regionIds: [1] }]).map((s) => s.regionId)).toEqual([1])
  })

  it('clips a Y range in schematic coordinates', () => {
    const [r0, r1] = resolveScopes(schematic, [{ kind: 'yRange', minY: 3, maxY: 3 }])
    expect(r0).toEqual({ regionId: 0, min: { x: 0, y: 3, z: 0 }, max: { x: 3, y: 3, z: 3 }, whole: false })
    expect(r1).toEqual({ regionId: 1, min: { x: 0, y: 1, z: 0 }, max: { x: 1, y: 1, z: 1 }, whole: false })
  })

  it('clips a box and accepts corners in any order', () => {
    const box = { min: { x: 2, y: 1, z: 9 }, max: { x: 1, y: 2, z: 3 } }
    expect(resolveScopes(schematic, [{ kind: 'box', box }])).toEqual([
      { regionId: 0, min: { x: 1, y: 1, z: 3 }, max: { x: 2, y: 2, z: 3 }, whole: false },
    ])
  })

  it('intersects every scope in the list', () => {
    const scopes = [
      { kind: 'yRange', minY: 0, maxY: 2 },
      { kind: 'box', box: { min: { x: 1, y: 1, z: 1 }, max: { x: 11, y: 3, z: 1 } } },
      { kind: 'regions', regionIds: [0, 1] },
    ] as const
    expect(resolveScopes(schematic, scopes)).toEqual([
      { regionId: 0, min: { x: 1, y: 1, z: 1 }, max: { x: 3, y: 2, z: 1 }, whole: false },
      { regionId: 1, min: { x: 0, y: 0, z: 1 }, max: { x: 1, y: 0, z: 1 }, whole: false },
    ])
  })

  it('leaves out regions the intersection misses', () => {
    expect(resolveScopes(schematic, [{ kind: 'yRange', minY: 2, maxY: 3 }, { kind: 'yRange', minY: 0, maxY: 1 }])).toEqual([])
  })

  it('marks a scope that happens to cover the whole region as whole', () => {
    expect(resolveScopes(schematic, [{ kind: 'yRange', minY: -5, maxY: 50 }]).every((s) => s.whole)).toBe(true)
  })

  it('ignores region ids that do not exist', () => {
    expect(resolveScopes(schematic, [{ kind: 'regions', regionIds: [7] }])).toEqual([])
  })
})

describe('forEachIndexInScope / indexInScope', () => {
  it('visits exactly the indices inside the scope, in index order', () => {
    const size = { x: 3, y: 2, z: 2 }
    const scope = { regionId: 0, min: { x: 1, y: 1, z: 0 }, max: { x: 2, y: 1, z: 1 }, whole: false }
    const seen: number[] = []
    forEachIndexInScope(size, scope, (i) => seen.push(i))
    expect(seen).toEqual([7, 8, 10, 11])
    const inside = Array.from({ length: 12 }, (_, i) => i).filter((i) => indexInScope(size, scope, i))
    expect(inside).toEqual(seen)
  })
})

describe('paletteCounts', () => {
  it('counts blocks per palette slot inside the scope', () => {
    const s = makeSchematic([{ size: [3, 1, 1], palette: ['minecraft:air', 'minecraft:stone'], blocks: [1, 0, 1] }])
    const region = s.regions[0]!
    const [whole] = resolveScopes(s, [])
    const [part] = resolveScopes(s, [{ kind: 'box', box: { min: { x: 1, y: 0, z: 0 }, max: { x: 2, y: 0, z: 0 } } }])
    expect(Array.from(paletteCounts(region, whole!))).toEqual([1, 2])
    expect(Array.from(paletteCounts(region, part!))).toEqual([1, 1])
  })
})
