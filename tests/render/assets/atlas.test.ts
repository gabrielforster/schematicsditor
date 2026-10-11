import { describe, expect, it } from 'vitest'
import { prepareAtlas, TEX_CUTOUT, TEX_OPAQUE, TEX_TRANSLUCENT } from '../../../src/render/assets/atlas'
import { testAtlas } from '../../helpers/assets'

describe('prepareAtlas', () => {
  const atlas = testAtlas()
  const prepared = prepareAtlas(atlas, atlas.rects)

  it('classifies textures by their alpha channel', () => {
    expect(prepared.textures['block/stone']!.alpha).toBe(TEX_OPAQUE)
    expect(prepared.textures['block/glass']!.alpha).toBe(TEX_CUTOUT)
    expect(prepared.textures['block/red_stained_glass']!.alpha).toBe(TEX_TRANSLUCENT)
  })

  it('averages color over visible pixels only', () => {
    expect(prepared.textures['block/stone']!.color).toBe(0x808080)
    expect(prepared.textures['block/glass']!.color).toBe(0xc8dcdc)
  })

  it('appends a white strip and normalizes UVs to the new height', () => {
    expect(prepared.image.height).toBe(32)
    expect(prepared.textures['block/oak_planks']!.uv).toEqual([16 / 128, 0, 32 / 128, 0.5])
    expect(prepared.white).toEqual([0, 0.5, 16 / 128, 1])
    const last = prepared.image.data.length - 4
    expect(Array.from(prepared.image.data.slice(last))).toEqual([255, 255, 255, 255])
    expect(Array.from(prepared.image.data.slice(0, 4))).toEqual([128, 128, 128, 255]) // original pixels kept
  })

  it('uses only the first frame of an animated strip', () => {
    const tall = { width: 16, height: 64, data: new Uint8Array(16 * 64 * 4).fill(255) }
    const p = prepareAtlas(tall, { 'block/water_still': [0, 0, 16, 64] })
    expect(p.textures['block/water_still']!.uv).toEqual([0, 0, 1, 16 / 80])
  })
})
