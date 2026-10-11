import { describe, expect, it } from 'vitest'
import { COLORED_TRANSLUCENT_ALPHA, meshColored } from '../../../src/render/mesh/colored'
import { DIRECTIONS } from '../../../src/render/mesh/faces'
import type { ChunkSlice, MeshData, SlotAppearance } from '../../../src/render/mesh/types'
import { FULL_CUBE, INVISIBLE, OPAQUE, TRANSLUCENT, UNKNOWN } from '../../../src/render/mesh/types'
import { makeSlice } from '../../helpers/slice'

const LOOK: Record<string, SlotAppearance> = {
  'minecraft:air': { flags: INVISIBLE, color: 0 },
  'minecraft:stone': { flags: OPAQUE | FULL_CUBE, color: 0x808080 },
  'minecraft:dirt': { flags: OPAQUE | FULL_CUBE, color: 0x8b5a2b },
  'minecraft:glass': { flags: FULL_CUBE | TRANSLUCENT, color: 0xc0e0e0 },
  'minecraft:torch': { flags: 0, color: 0xffd000 },
  'minecraft:light': { flags: INVISIBLE, color: 0 },
  'mod:thing': { flags: UNKNOWN | OPAQUE | FULL_CUBE, color: 0 },
}
const mesh = (slice: ChunkSlice) => meshColored(slice, slice.states.map((k) => LOOK[k]!))
const faces = (m: MeshData | null) => (m ? m.indices.length / 6 : 0)

describe('meshColored', () => {
  it('draws a single block as 6 faces', () => {
    const m = mesh(makeSlice([1, 1, 1], () => 'minecraft:stone'))
    expect(faces(m.opaque)).toBe(6)
    expect(m.transparent).toBeNull()
    expect(m.faded).toBeNull()
  })

  it('culls the inner faces of a 2×2×2 cube', () => {
    expect(faces(mesh(makeSlice([2, 2, 2], () => 'minecraft:stone')).opaque)).toBe(24)
  })

  it('culls faces between different opaque full cubes', () => {
    expect(faces(mesh(makeSlice([2, 1, 1], (x) => (x === 0 ? 'minecraft:stone' : 'minecraft:dirt'))).opaque)).toBe(10)
  })

  it('culls faces between identical transparent blocks', () => {
    const m = mesh(makeSlice([2, 1, 1], () => 'minecraft:glass'))
    expect(faces(m.transparent)).toBe(10)
    expect(m.opaque).toBeNull()
  })

  it('keeps the stone face behind glass, hides the glass face behind stone', () => {
    const m = mesh(makeSlice([2, 1, 1], (x) => (x === 0 ? 'minecraft:glass' : 'minecraft:stone')))
    expect(faces(m.opaque)).toBe(6)
    expect(faces(m.transparent)).toBe(5)
  })

  it('does not let a non-full block hide its neighbour', () => {
    const m = mesh(makeSlice([2, 1, 1], (x) => (x === 0 ? 'minecraft:torch' : 'minecraft:stone')))
    expect(faces(m.opaque)).toBe(6 + 5)
  })

  it('culls against the border, which belongs to the next chunk', () => {
    const slice = makeSlice([1, 1, 1], () => 'minecraft:stone', { border: true })
    expect(mesh(slice).opaque).toBeNull()
  })

  it('draws unknown blocks as magenta cubes', () => {
    const m = mesh(makeSlice([1, 1, 1], () => 'mod:thing'))
    expect(faces(m.opaque)).toBe(6)
    const up = 0 // first face emitted is "up", shade 1.0
    expect(Array.from(m.opaque!.colors.slice(up, up + 4))).toEqual([255, 0, 255, 255])
  })

  it('skips invisible blocks and lets their neighbours show', () => {
    const m = mesh(makeSlice([2, 1, 1], (x) => (x === 0 ? 'minecraft:light' : 'minecraft:stone')))
    expect(faces(m.opaque)).toBe(6)
  })

  it('gives translucent blocks partial alpha', () => {
    const m = mesh(makeSlice([1, 1, 1], () => 'minecraft:glass'))
    expect(m.transparent!.colors[3]).toBe(COLORED_TRANSLUCENT_ALPHA)
  })

  it('shades faces by direction', () => {
    const m = mesh(makeSlice([1, 1, 1], () => 'minecraft:stone'))
    const red = (face: number) => m.opaque!.colors[face * 16]!
    expect([red(0), red(1), red(2), red(4)]).toEqual([128, 64, 102, 77]) // up, down, south, east
  })

  it('emits chunk-local positions with outward-facing winding', () => {
    const m = mesh(makeSlice([3, 1, 1], (x) => (x === 2 ? 'minecraft:stone' : null)))
    const p = m.opaque!.positions
    expect(Math.min(...p.filter((_, i) => i % 3 === 0))).toBe(2)
    expect(Math.max(...p.filter((_, i) => i % 3 === 0))).toBe(3)
    for (let f = 0; f < 6; f++) {
      const v = (k: number) => [p[f * 12 + k * 3]!, p[f * 12 + k * 3 + 1]!, p[f * 12 + k * 3 + 2]!]
      const [a, b, c] = [v(0), v(1), v(2)]
      const e1 = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!]
      const e2 = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!]
      const n = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!]
      const d = DIRECTIONS[f]!
      expect(n.map((c) => c + 0)).toEqual([d.dx, d.dy, d.dz]) // + 0 turns -0 into 0
    }
  })

  describe('with a highlight set', () => {
    it('moves blocks outside the set to the faded mesh', () => {
      const m = mesh(makeSlice([2, 1, 1], (x) => (x === 0 ? 'minecraft:stone' : 'minecraft:dirt'), { faded: (k) => k !== 'minecraft:dirt' }))
      expect(faces(m.opaque)).toBe(6) // dirt: its face against faded stone stays visible
      expect(faces(m.faded)).toBe(5) // stone: its face against dirt is hidden as usual
    })

    it('culls faces between two faded blocks', () => {
      const m = mesh(makeSlice([2, 2, 2], () => 'minecraft:stone', { faded: () => true }))
      expect(faces(m.faded)).toBe(24)
      expect(m.opaque).toBeNull()
    })
  })
})
