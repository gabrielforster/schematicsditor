import { describe, expect, it } from 'vitest'
import { DIRECTIONS, faceShade, isFaceHidden, MeshBuilder } from '../../../src/render/mesh/faces'
import { FULL_CUBE, OPAQUE } from '../../../src/render/mesh/types'

describe('MeshBuilder', () => {
  it('returns null when nothing was added', () => {
    expect(new MeshBuilder(true).finish()).toBeNull()
  })

  it('keeps every buffer in step while growing past its initial capacity', () => {
    const b = new MeshBuilder(true)
    const up = DIRECTIONS[0]!.corners
    const uv = [0.1, 0.2, 0.3, 0.2, 0.3, 0.4, 0.1, 0.4]
    for (let i = 0; i < 1000; i++) b.quad(up, 0, i, 0, 0, 1, 0.5, 0, 200, uv)
    const m = b.finish()!
    expect(b.quadCount).toBe(1000)
    expect(m.positions.length).toBe(4000 * 3)
    expect(m.colors.length).toBe(4000 * 4)
    expect(m.uvs!.length).toBe(4000 * 2)
    expect(m.indices.length).toBe(6000)
    const last = 3999
    expect(Array.from(m.colors.slice(last * 4, last * 4 + 4))).toEqual([255, 128, 0, 200])
    expect(m.positions[last * 3]).toBe(999)
    expect(Array.from(m.uvs!.slice(last * 2, last * 2 + 2))).toEqual([Math.fround(0.1), Math.fround(0.4)])
    expect(Array.from(m.indices.slice(-6))).toEqual([3996, 3997, 3998, 3996, 3998, 3999])
  })
})

describe('faceShade', () => {
  it('matches Minecraft directional shading', () => {
    expect([faceShade(0, 1, 0), faceShade(0, -1, 0), faceShade(0, 0, 1), faceShade(1, 0, 0)]).toEqual([1, 0.5, 0.8, 0.6])
  })
})

describe('isFaceHidden', () => {
  it('hides faces behind opaque cubes only', () => {
    expect(isFaceHidden(0, 1, false, OPAQUE | FULL_CUBE, 2, false)).toBe(true)
    expect(isFaceHidden(OPAQUE | FULL_CUBE, 1, false, FULL_CUBE, 2, false)).toBe(false)
  })

  it('hides faces between identical full cubes, not identical partial blocks', () => {
    expect(isFaceHidden(FULL_CUBE, 3, false, FULL_CUBE, 3, false)).toBe(true)
    expect(isFaceHidden(0, 3, false, 0, 3, false)).toBe(false)
  })

  it('never lets a faded neighbour hide a highlighted block', () => {
    expect(isFaceHidden(0, 1, false, OPAQUE | FULL_CUBE, 2, true)).toBe(false)
    expect(isFaceHidden(0, 1, true, OPAQUE | FULL_CUBE, 2, true)).toBe(true)
  })
})
