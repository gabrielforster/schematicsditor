import { describe, expect, it } from 'vitest'
import { BlockDataError, BlockRegistry, normalizeBlockName } from '../../../src/core/registry/registry'

const DATA = {
  stone: [{}, {}],
  oak_stairs: [
    { facing: ['north', 'south', 'west', 'east'], half: ['top', 'bottom'] },
    { facing: 'north', half: 'bottom' },
  ],
}

describe('normalizeBlockName', () => {
  it('adds the minecraft namespace to bare names', () => {
    expect(normalizeBlockName('stone')).toBe('minecraft:stone')
  })

  it('keeps an existing namespace', () => {
    expect(normalizeBlockName('mymod:lamp')).toBe('mymod:lamp')
  })
})

describe('BlockRegistry', () => {
  it('looks blocks up with or without the namespace', () => {
    const r = new BlockRegistry(DATA)
    expect(r.get('oak_stairs')?.name).toBe('minecraft:oak_stairs')
    expect(r.get('minecraft:oak_stairs')?.properties.half).toEqual(['top', 'bottom'])
    expect(r.has('minecraft:stone')).toBe(true)
    expect(r.has('minecraft:dirt')).toBe(false)
    expect(r.get('dirt')).toBeUndefined()
  })

  it('lists namespaced names sorted', () => {
    expect(new BlockRegistry(DATA).names()).toEqual(['minecraft:oak_stairs', 'minecraft:stone'])
  })

  it('builds default states', () => {
    expect(new BlockRegistry(DATA).defaultState('oak_stairs')).toEqual({
      name: 'minecraft:oak_stairs',
      properties: { facing: 'north', half: 'bottom' },
    })
  })

  it('throws for the default state of an unknown block', () => {
    expect(() => new BlockRegistry(DATA).defaultState('dirt')).toThrow(BlockDataError)
  })

  it('keeps the version it was given', () => {
    expect(new BlockRegistry(DATA, { id: '1.21.4', dataVersion: 4189 }).version).toEqual({ id: '1.21.4', dataVersion: 4189 })
  })

  it.each([
    ['a non-object', []],
    ['an entry that is not a pair', { stone: [{}] }],
    ['a property without values', { lever: [{ powered: [] }, { powered: 'false' }] }],
    ['a default outside the values', { lever: [{ powered: ['true', 'false'] }, { powered: 'maybe' }] }],
    ['a missing default', { lever: [{ powered: ['true', 'false'] }, {}] }],
    ['a default for an unknown property', { stone: [{}, { lit: 'true' }] }],
  ])('rejects %s', (_label, data) => {
    expect(() => new BlockRegistry(data)).toThrow(BlockDataError)
  })
})
