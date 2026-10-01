import { describe, expect, it } from 'vitest'
import { TexturedResources } from '../../../src/render/assets/resources'
import { FULL_CUBE, OPAQUE, TRANSLUCENT } from '../../../src/render/mesh/types'
import { buildPalette } from '../../../src/render/palette/build'
import { testAssets } from '../../helpers/assets'

const blocks = {
  air: [{}, {}],
  stone: [{}, {}],
  glass: [{}, {}],
  red_stained_glass: [{}, {}],
  oak_stairs: [{ facing: ['north', 'east'], half: ['bottom'], shape: ['straight'] }, { facing: 'east', half: 'bottom', shape: 'straight' }],
  torch: [{}, {}],
  barrier: [{}, {}],
  mystery_block: [{}, {}],
} as const

describe('buildPalette', () => {
  const palette = buildPalette(new TexturedResources(testAssets()), blocks)

  it('lists every non-air block, sorted', () => {
    expect(Object.keys(palette)).toEqual(['barrier', 'glass', 'mystery_block', 'oak_stairs', 'red_stained_glass', 'stone', 'torch'])
  })

  it('keeps opaque cubes opaque, with their average texture color', () => {
    expect(palette.stone).toEqual([0x808080, OPAQUE | FULL_CUBE])
  })

  it('uses the default state for blocks with properties', () => {
    expect(palette.oak_stairs).toEqual([0xa08250, 0])
  })

  it('makes see-through blocks translucent', () => {
    expect(palette.glass![1]).toBe(FULL_CUBE | TRANSLUCENT)
    expect(palette.red_stained_glass![1]).toBe(FULL_CUBE | TRANSLUCENT)
    expect(palette.torch![1]).toBe(TRANSLUCENT)
  })

  it('gives blocks without geometry or data a hash color', () => {
    expect(palette.barrier).toEqual([null, TRANSLUCENT])
    expect(palette.mystery_block).toEqual([null, 0])
  })
})
