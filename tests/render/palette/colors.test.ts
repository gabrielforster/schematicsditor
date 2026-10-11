import { describe, expect, it } from 'vitest'
import { FULL_CUBE, MAGENTA, OPAQUE, TRANSLUCENT, UNKNOWN } from '../../../src/render/mesh/types'
import { coloredAppearance, hashColor, PALETTE_VERSION } from '../../../src/render/palette/colors'
import { BUNDLED_VERSION } from '../../../src/core/registry'

describe('hashColor', () => {
  it('is stable and differs between names', () => {
    expect(hashColor('minecraft:light')).toBe(hashColor('minecraft:light'))
    expect(hashColor('light')).not.toBe(hashColor('barrier'))
  })

  it('stays inside 0xRRGGBB', () => {
    for (const n of ['a', 'light', 'structure_void', 'x'.repeat(100)]) {
      expect(hashColor(n)).toBeGreaterThanOrEqual(0)
      expect(hashColor(n)).toBeLessThanOrEqual(0xffffff)
    }
  })
})

describe('coloredAppearance', () => {
  it('matches the bundled block registry version', () => {
    expect(PALETTE_VERSION).toEqual(BUNDLED_VERSION)
  })

  it('treats stone as an opaque gray cube, with or without namespace and properties', () => {
    const a = coloredAppearance('minecraft:stone')
    expect(a.flags).toBe(OPAQUE | FULL_CUBE)
    const [r, g, b] = [(a.color >> 16) & 255, (a.color >> 8) & 255, a.color & 255]
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(10)
    expect(coloredAppearance('stone')).toEqual(a)
  })

  it('makes glass and water translucent', () => {
    expect(coloredAppearance('minecraft:glass').flags & TRANSLUCENT).toBeTruthy()
    expect(coloredAppearance('minecraft:water[level=0]').flags & TRANSLUCENT).toBeTruthy()
  })

  it('gives blocks without a texture color a hash color', () => {
    expect(coloredAppearance('minecraft:light[level=15,waterlogged=false]').color).toBe(hashColor('light'))
  })

  it('draws unknown names and other namespaces as magenta cubes', () => {
    for (const key of ['minecraft:not_a_block', 'create:cogwheel', 'minecraft:constructor', 'minecraft:toString']) {
      expect(coloredAppearance(key)).toEqual({ flags: UNKNOWN | OPAQUE | FULL_CUBE, color: MAGENTA })
    }
  })
})
