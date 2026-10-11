import { describe, expect, it } from 'vitest'
import { NO_COLOR, TexturedResources } from '../../../src/render/assets/resources'
import { meshTextured } from '../../../src/render/mesh/textured'
import type { MeshData } from '../../../src/render/mesh/types'
import { testAssets } from '../../helpers/assets'
import { makeSlice } from '../../helpers/slice'

const resources = new TexturedResources(testAssets())
const faces = (m: MeshData | null) => (m ? m.indices.length / 6 : 0)
const STAIR_EAST = 'minecraft:oak_stairs[facing=east,half=bottom,shape=straight]'
const STAIR_NORTH = 'minecraft:oak_stairs[facing=north,half=bottom,shape=straight]'
const one = (key: string) => meshTextured(makeSlice([1, 1, 1], () => key), resources)

describe('meshTextured', () => {
  it('draws a single block as 6 textured faces', () => {
    const m = one('minecraft:stone')
    expect(faces(m.opaque)).toBe(6)
    const stone = resources.bake('minecraft:stone', 0)!
    expect(Array.from(m.opaque!.uvs!)).toEqual(Array.from(stone.uvs))
  })

  it('culls the inner faces of a 2×2×2 cube', () => {
    expect(faces(meshTextured(makeSlice([2, 2, 2], () => 'minecraft:stone'), resources).opaque)).toBe(24)
  })

  it('culls faces between identical cutout blocks, which stay in the opaque mesh', () => {
    const m = meshTextured(makeSlice([2, 1, 1], () => 'minecraft:glass'), resources)
    expect(faces(m.opaque)).toBe(10)
    expect(m.transparent).toBeNull()
  })

  it('puts translucent faces in the transparent mesh and culls them pairwise', () => {
    const m = meshTextured(makeSlice([2, 1, 1], () => 'minecraft:red_stained_glass'), resources)
    expect(faces(m.transparent)).toBe(10)
    expect(m.opaque).toBeNull()
  })

  it('draws a lone stair with all 11 faces', () => {
    expect(faces(one(STAIR_EAST).opaque)).toBe(11)
  })

  it('culls a stair face against stone but never stone against a stair', () => {
    const m = meshTextured(makeSlice([1, 2, 1], (_x, y) => (y === 0 ? 'minecraft:stone' : STAIR_EAST)), resources)
    expect(faces(m.opaque)).toBe(6 + 10) // stone keeps its top face; the stair loses its bottom
  })

  it('applies blockstate rotations', () => {
    const east = one(STAIR_EAST).opaque!.positions
    const north = one(STAIR_NORTH).opaque!.positions
    const centroid = (p: Float32Array, axis: number) => p.filter((_, i) => i % 3 === axis).reduce((a, b) => a + b, 0) / (p.length / 3)
    expect(centroid(east, 0)).toBeGreaterThan(0.5) // step towards +x
    expect(centroid(north, 2)).toBeLessThan(0.5) // step towards -z
    expect(Math.min(...north)).toBeGreaterThanOrEqual(-1e-6)
    expect(Math.max(...north)).toBeLessThanOrEqual(1 + 1e-6)
  })

  it('draws unknown blocks as magenta cubes on the white tile', () => {
    const m = one('minecraft:mystery_block')
    expect(faces(m.opaque)).toBe(6)
    expect(Array.from(m.opaque!.colors.slice(0, 4))).toEqual([255, 0, 255, 255])
    const white = resources.whiteUv
    expect(m.opaque!.uvs![0]).toBeCloseTo(white[0])
    expect(m.opaque!.uvs![1]).toBeCloseTo(white[3])
  })

  it('draws a state no variant matches as a magenta cube, not nothing', () => {
    const m = one('minecraft:oak_stairs[facing=up,half=bottom,shape=straight]')
    expect(faces(m.opaque)).toBe(6)
    expect(Array.from(m.opaque!.colors.slice(0, 3))).toEqual([255, 0, 255])
  })

  it('draws faces whose texture is missing from the atlas on the white tile', () => {
    const m = one('minecraft:untextured')
    expect(faces(m.opaque)).toBe(6)
    expect(m.opaque!.uvs![0]).toBeCloseTo(resources.whiteUv[0])
    expect(resources.analyze('minecraft:untextured').color).toBe(NO_COLOR)
  })

  it('draws water in the transparent mesh and culls water against water', () => {
    expect(faces(one('minecraft:water[level=0]').transparent)).toBe(6)
    expect(faces(meshTextured(makeSlice([2, 1, 1], () => 'minecraft:water[level=0]'), resources).transparent)).toBe(10)
  })

  it('draws nothing for invisible blocks', () => {
    const m = one('minecraft:barrier')
    expect([m.opaque, m.transparent, m.faded]).toEqual([null, null, null])
  })

  it('moves blocks outside the highlight set to the faded mesh', () => {
    const slice = makeSlice([2, 1, 1], (x) => (x === 0 ? 'minecraft:stone' : STAIR_EAST), { faded: (k) => k === 'minecraft:stone' })
    const m = meshTextured(slice, resources)
    expect(faces(m.faded)).toBe(6)
    expect(faces(m.opaque)).toBe(11)
  })
})
