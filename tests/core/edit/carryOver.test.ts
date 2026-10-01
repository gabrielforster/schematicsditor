import { describe, expect, it } from 'vitest'
import { carryOver, validateTarget } from '../../../src/core/edit/carryOver'
import { EditError } from '../../../src/core/edit/errors'
import { parseBlockStateKey } from '../../../src/core/model'
import { bundledRegistry } from '../../../src/core/registry'

const registry = bundledRegistry()
const state = parseBlockStateKey

function expectEditError(fn: () => unknown, code: EditError['code']): void {
  try {
    fn()
  } catch (e) {
    expect(e).toBeInstanceOf(EditError)
    expect((e as EditError).code).toBe(code)
    return
  }
  throw new Error('expected an EditError')
}

describe('carryOver', () => {
  it('copies every shared property', () => {
    const source = state('minecraft:oak_stairs[facing=east,half=top,shape=inner_left,waterlogged=true]')
    expect(carryOver(source, { name: 'minecraft:spruce_stairs' }, registry)).toEqual(
      state('minecraft:spruce_stairs[facing=east,half=top,shape=inner_left,waterlogged=true]'),
    )
  })

  it('fills properties the source lacks with the target defaults and drops the rest', () => {
    const source = state('minecraft:oak_stairs[facing=east,half=top,shape=straight,waterlogged=true]')
    expect(carryOver(source, { name: 'minecraft:oak_slab' }, registry)).toEqual(
      state('minecraft:oak_slab[type=bottom,waterlogged=true]'),
    )
  })

  it('does not copy a shared property whose value is invalid for the target', () => {
    const source = state('minecraft:chest[facing=north,type=left,waterlogged=false]')
    expect(carryOver(source, { name: 'minecraft:oak_slab' }, registry).properties.type).toBe('bottom')
  })

  it('lets explicitly chosen target properties win', () => {
    const source = state('minecraft:oak_stairs[facing=east,half=top,shape=straight,waterlogged=false]')
    const result = carryOver(source, { name: 'spruce_stairs', properties: { facing: 'west' } }, registry)
    expect(result.properties).toEqual({ facing: 'west', half: 'top', shape: 'straight', waterlogged: 'false' })
  })

  it('normalizes the target name', () => {
    expect(carryOver(state('minecraft:stone'), { name: 'dirt' }, registry)).toEqual(state('minecraft:dirt'))
  })

  it('replaces with air', () => {
    expect(carryOver(state('minecraft:oak_stairs[facing=east]'), { name: 'minecraft:air' }, registry)).toEqual(
      { name: 'minecraft:air', properties: {} },
    )
  })

  it('carries properties from blocks the registry does not know', () => {
    const source = state('othermod:fancy_stairs[facing=south,half=top]')
    expect(carryOver(source, { name: 'minecraft:oak_stairs' }, registry).properties).toMatchObject({ facing: 'south', half: 'top' })
  })
})

describe('validateTarget', () => {
  it('rejects unknown blocks', () => {
    expectEditError(() => validateTarget({ name: 'minecraft:not_a_block' }, registry), 'unknown-block')
  })

  it('rejects properties the target does not have', () => {
    expectEditError(() => validateTarget({ name: 'minecraft:stone', properties: { facing: 'north' } }, registry), 'unknown-property')
  })

  it('rejects values the property does not allow', () => {
    expectEditError(() => validateTarget({ name: 'minecraft:oak_stairs', properties: { facing: 'up' } }, registry), 'invalid-value')
  })
})
