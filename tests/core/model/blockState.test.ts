import { describe, expect, it } from 'vitest'
import { AIR, blockStateKey, isAir, parseBlockStateKey } from '../../../src/core/model/blockState'

describe('blockStateKey', () => {
  it('is the bare name when there are no properties', () => {
    expect(blockStateKey({ name: 'minecraft:stone', properties: {} })).toBe('minecraft:stone')
  })

  it('sorts properties by key', () => {
    const state = { name: 'minecraft:oak_stairs', properties: { half: 'top', facing: 'north' } }
    expect(blockStateKey(state)).toBe('minecraft:oak_stairs[facing=north,half=top]')
  })
})

describe('parseBlockStateKey', () => {
  it('parses a bare name', () => {
    expect(parseBlockStateKey('minecraft:stone')).toEqual({ name: 'minecraft:stone', properties: {} })
  })

  it('parses properties', () => {
    expect(parseBlockStateKey('minecraft:oak_stairs[facing=north,half=top]')).toEqual({
      name: 'minecraft:oak_stairs',
      properties: { facing: 'north', half: 'top' },
    })
  })

  it('round-trips with blockStateKey', () => {
    const key = 'minecraft:chest[facing=east,type=left,waterlogged=false]'
    expect(blockStateKey(parseBlockStateKey(key))).toBe(key)
  })

  it('rejects a missing closing bracket', () => {
    expect(() => parseBlockStateKey('minecraft:oak_stairs[facing=north')).toThrow(SyntaxError)
  })

  it('rejects a property without a value separator', () => {
    expect(() => parseBlockStateKey('minecraft:oak_stairs[facing]')).toThrow(SyntaxError)
  })
})

describe('isAir', () => {
  it.each(['minecraft:air', 'minecraft:cave_air', 'minecraft:void_air'])('treats %s as air', (name) => {
    expect(isAir({ name, properties: {} })).toBe(true)
  })

  it('does not treat stone as air', () => {
    expect(isAir({ name: 'minecraft:stone', properties: {} })).toBe(false)
  })

  it('exports AIR as minecraft:air', () => {
    expect(blockStateKey(AIR)).toBe('minecraft:air')
  })
})
