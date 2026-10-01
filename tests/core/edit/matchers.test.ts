import { describe, expect, it } from 'vitest'
import { EditError } from '../../../src/core/edit/errors'
import { matchesAny, matchesState, parseMatcher, type Matcher } from '../../../src/core/edit/matchers'
import { parseBlockStateKey } from '../../../src/core/model'
import { bundledRegistry } from '../../../src/core/registry'

const registry = bundledRegistry()
const state = parseBlockStateKey
const topNorth = state('minecraft:oak_stairs[facing=north,half=top,shape=straight,waterlogged=false]')
const bottomNorth = state('minecraft:oak_stairs[facing=north,half=bottom,shape=straight,waterlogged=false]')

describe('matchesState', () => {
  it('matches any state of a block', () => {
    const m: Matcher = { kind: 'block', name: 'minecraft:oak_stairs' }
    expect(matchesState(m, topNorth)).toBe(true)
    expect(matchesState(m, bottomNorth)).toBe(true)
    expect(matchesState(m, state('minecraft:spruce_stairs'))).toBe(false)
  })

  it('matches a partial property set', () => {
    const m: Matcher = { kind: 'partial', name: 'minecraft:oak_stairs', properties: { half: 'top' } }
    expect(matchesState(m, topNorth)).toBe(true)
    expect(matchesState(m, bottomNorth)).toBe(false)
  })

  it('matches an exact state regardless of property order', () => {
    const m: Matcher = { kind: 'exact', state: topNorth }
    const reordered = { name: 'minecraft:oak_stairs', properties: { waterlogged: 'false', shape: 'straight', half: 'top', facing: 'north' } }
    expect(matchesState(m, reordered)).toBe(true)
    expect(matchesState(m, bottomNorth)).toBe(false)
  })

  it('does not treat an exact state as a subset match', () => {
    const m: Matcher = { kind: 'exact', state: state('minecraft:oak_stairs[half=top]') }
    expect(matchesState(m, topNorth)).toBe(false)
  })

  it('matches when any matcher in a list does', () => {
    const ms: Matcher[] = [{ kind: 'block', name: 'minecraft:stone' }, { kind: 'block', name: 'minecraft:oak_stairs' }]
    expect(matchesAny(ms, topNorth)).toBe(true)
    expect(matchesAny([], topNorth)).toBe(false)
  })
})

describe('parseMatcher', () => {
  it('parses a bare name as any state, adding the namespace', () => {
    expect(parseMatcher('oak_stairs', registry)).toEqual({ kind: 'block', name: 'minecraft:oak_stairs' })
  })

  it('parses a subset of properties as a partial match', () => {
    expect(parseMatcher('oak_stairs[half=top]', registry)).toEqual({
      kind: 'partial', name: 'minecraft:oak_stairs', properties: { half: 'top' },
    })
  })

  it('parses a full property set as an exact match', () => {
    expect(parseMatcher('minecraft:oak_stairs[facing=north,half=top,shape=straight,waterlogged=false]', registry))
      .toEqual({ kind: 'exact', state: topNorth })
  })

  it('trims surrounding whitespace', () => {
    expect(parseMatcher('  stone ', registry)).toEqual({ kind: 'block', name: 'minecraft:stone' })
  })

  it('accepts unknown blocks, so unknown file contents stay replaceable', () => {
    expect(parseMatcher('othermod:lamp[lit=true]', registry)).toEqual({
      kind: 'partial', name: 'othermod:lamp', properties: { lit: 'true' },
    })
  })

  it('rejects malformed input', () => {
    expect(() => parseMatcher('oak_stairs]', registry)).toThrow(SyntaxError)
  })

  it('rejects properties a known block does not have', () => {
    expect(() => parseMatcher('stone[facing=north]', registry)).toThrow(EditError)
  })

  it('rejects values a known block does not allow', () => {
    expect(() => parseMatcher('oak_stairs[half=middle]', registry)).toThrow(EditError)
  })
})
