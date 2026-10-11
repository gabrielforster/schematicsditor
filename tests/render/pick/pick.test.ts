import { describe, expect, it } from 'vitest'
import { raycastGrid } from '../../../src/render/pick/dda'
import { pickBlock } from '../../../src/render/pick/pick'
import { makeSchematic } from '../../helpers/model'

const size = { x: 4, y: 4, z: 4 }
const only = (cx: number, cy: number, cz: number) => (x: number, y: number, z: number) => x === cx && y === cy && z === cz

describe('raycastGrid', () => {
  it('hits the first solid cell along an axis and reports the entry face', () => {
    const hit = raycastGrid({ origin: { x: -5, y: 1.5, z: 2.5 }, dir: { x: 1, y: 0, z: 0 } }, size, 100, only(2, 1, 2))
    expect(hit).toEqual({ x: 2, y: 1, z: 2, normal: { x: -1, y: 0, z: 0 }, t: 7 })
  })

  it('reports the face of the grid box for a hit in the first cell', () => {
    const hit = raycastGrid({ origin: { x: 0.5, y: 10, z: 0.5 }, dir: { x: 0, y: -1, z: 0 } }, size, 100, () => true)
    expect(hit).toMatchObject({ x: 0, y: 3, z: 0, normal: { x: 0, y: 1, z: 0 }, t: 6 })
  })

  it('walks diagonals cell by cell', () => {
    const visited: string[] = []
    raycastGrid({ origin: { x: 0.5, y: 0.5, z: 0.5 }, dir: { x: 1, y: 1, z: 0.0001 } }, size, 100, (x, y, z) => {
      visited.push(`${x},${y},${z}`)
      return false
    })
    expect(visited[0]).toBe('0,0,0')
    expect(visited.at(-1)).toBe('3,3,0')
    expect(visited.length).toBeGreaterThanOrEqual(7)
  })

  it('starts inside the grid', () => {
    const hit = raycastGrid({ origin: { x: 1.5, y: 1.5, z: 1.5 }, dir: { x: 0, y: 0, z: 1 } }, size, 100, only(1, 1, 3))
    expect(hit).toMatchObject({ x: 1, y: 1, z: 3, normal: { x: 0, y: 0, z: -1 } })
  })

  it('misses rays that pass beside the grid or point away', () => {
    expect(raycastGrid({ origin: { x: -1, y: 5, z: 0 }, dir: { x: 1, y: 0, z: 0 } }, size, 100, () => true)).toBeNull()
    expect(raycastGrid({ origin: { x: -1, y: 1, z: 1 }, dir: { x: -1, y: 0, z: 0 } }, size, 100, () => true)).toBeNull()
  })

  it('stops at maxT', () => {
    expect(raycastGrid({ origin: { x: -5, y: 1, z: 1 }, dir: { x: 1, y: 0, z: 0 } }, size, 3, () => true)).toBeNull()
  })
})

describe('pickBlock', () => {
  // Region 0: 3×3×1 at the origin with stone at y=0 and dirt at y=2. Region 1: one gold block at (10, 0, 0).
  const s = makeSchematic([
    { size: [3, 3, 1], palette: ['minecraft:air', 'minecraft:stone', 'minecraft:dirt'], blocks: [1, 1, 1, 0, 0, 0, 2, 2, 2] },
    { position: [10, 0, 0], size: [1, 1, 1], palette: ['minecraft:gold_block'], blocks: [0] },
  ])
  const down = { origin: { x: 1.5, y: 10, z: 0.5 }, dir: { x: 0, y: -1, z: 0 } }

  it('returns the nearest non-air block with its state and coordinates', () => {
    expect(pickBlock(s, down)).toEqual({
      regionId: 0, regionName: 'region0', local: { x: 1, y: 2, z: 0 }, world: { x: 1, y: 2, z: 0 },
      normal: { x: 0, y: 1, z: 0 }, state: 'minecraft:dirt', distance: 7,
    })
  })

  it('ignores blocks outside the visible layers', () => {
    expect(pickBlock(s, down, { layers: { minY: 0, maxY: 1 } })!.state).toBe('minecraft:stone')
    expect(pickBlock(s, down, { layers: { minY: 1, maxY: 1 } })).toBeNull()
  })

  it('handles regions at negative positions', () => {
    const neg = makeSchematic([{ position: [-20, -64, -3], size: [2, 1, 1], palette: ['minecraft:air', 'minecraft:stone'], blocks: [0, 1] }])
    const hit = pickBlock(neg, { origin: { x: -30, y: -63.5, z: -2.5 }, dir: { x: 1, y: 0, z: 0 } })!
    expect(hit).toMatchObject({ world: { x: -19, y: -64, z: -3 }, local: { x: 1, y: 0, z: 0 }, normal: { x: -1, y: 0, z: 0 } })
  })

  it('uses world coordinates across regions and skips hidden regions', () => {
    const east = { origin: { x: -5, y: 0.5, z: 0.5 }, dir: { x: 1, y: 0, z: 0 } }
    expect(pickBlock(s, east)!.world).toEqual({ x: 0, y: 0, z: 0 })
    const hit = pickBlock(s, east, { hidden: new Set([0]) })!
    expect(hit).toMatchObject({ regionId: 1, world: { x: 10, y: 0, z: 0 }, local: { x: 0, y: 0, z: 0 }, state: 'minecraft:gold_block' })
  })
})
