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

describe('parseBlockStateKey (strict input)', () => {
  it.each([
    ['a closing bracket without an opening one', 'minecraft:stone]'],
    ['an empty name', '[facing=north]'],
    ['an empty string', ''],
    ['a second opening bracket', 'minecraft:oak_stairs[facing=[north]'],
    ['text after the closing bracket', 'minecraft:oak_stairs[facing=north]x'],
    ['an empty value', 'minecraft:oak_stairs[facing=]'],
    ['an empty key', 'minecraft:oak_stairs[=north]'],
    ['a duplicate key', 'minecraft:oak_stairs[facing=north,facing=south]'],
    ['a trailing comma', 'minecraft:oak_stairs[facing=north,]'],
    ['whitespace', 'minecraft:oak_stairs[facing= north]'],
    ['uppercase letters', 'minecraft:Stone'],
    ['two colons', 'minecraft:stone:extra'],
  ])('rejects %s', (_label, input) => {
    expect(() => parseBlockStateKey(input)).toThrow(SyntaxError)
  })

  it('accepts a bare name without a namespace', () => {
    expect(parseBlockStateKey('stone')).toEqual({ name: 'stone', properties: {} })
  })

  it('accepts empty brackets as no properties', () => {
    expect(parseBlockStateKey('minecraft:stone[]')).toEqual({ name: 'minecraft:stone', properties: {} })
  })

  it('accepts modded namespaces and paths with slashes and dots', () => {
    expect(parseBlockStateKey('my-mod.x:deco/lamp_1[lit=true]')).toEqual({
      name: 'my-mod.x:deco/lamp_1',
      properties: { lit: 'true' },
    })
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
