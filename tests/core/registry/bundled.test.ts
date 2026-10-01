import { describe, expect, it } from 'vitest'
import { BUNDLED_VERSION, bundledRegistry } from '../../../src/core/registry/bundled'

describe('bundled registry', () => {
  it('records the Minecraft version it was generated from', () => {
    expect(BUNDLED_VERSION.id).toMatch(/\S/)
    expect(BUNDLED_VERSION.dataVersion).toBeGreaterThanOrEqual(3953) // 1.21 or newer
  })

  it('parses every bundled block', () => {
    expect(bundledRegistry().size).toBeGreaterThan(1000)
  })

  it('knows the air variants, stone and stairs defaults', () => {
    const r = bundledRegistry()
    for (const name of ['minecraft:air', 'minecraft:cave_air', 'minecraft:void_air', 'minecraft:stone']) {
      expect(r.has(name)).toBe(true)
    }
    expect(r.defaultState('oak_stairs').properties).toEqual({
      facing: 'north', half: 'bottom', shape: 'straight', waterlogged: 'false',
    })
  })

  it('returns the same instance on every call', () => {
    expect(bundledRegistry()).toBe(bundledRegistry())
  })
})
