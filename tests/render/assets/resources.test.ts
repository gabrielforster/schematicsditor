import { describe, expect, it } from 'vitest'
import { splitStateKey, TexturedResources } from '../../../src/render/assets/resources'
import { FULL_CUBE, INVISIBLE, OPAQUE, TRANSLUCENT, UNKNOWN } from '../../../src/render/mesh/types'
import { testAssets } from '../../helpers/assets'

const resources = new TexturedResources(testAssets())
const STAIR_EAST = 'minecraft:oak_stairs[facing=east,half=bottom,shape=straight]'

describe('splitStateKey', () => {
  it('splits names and properties without validating', () => {
    expect(splitStateKey('minecraft:stone')).toEqual({ name: 'minecraft:stone', properties: {} })
    expect(splitStateKey('Weird:Name[a=1,b=two]')).toEqual({ name: 'Weird:Name', properties: { a: '1', b: 'two' } })
    expect(splitStateKey('x[broken')).toEqual({ name: 'x', properties: {} })
  })
})

describe('TexturedResources.appearance', () => {
  it.each([
    ['minecraft:stone', OPAQUE | FULL_CUBE],
    ['minecraft:glass', FULL_CUBE],
    ['minecraft:red_stained_glass', FULL_CUBE | TRANSLUCENT],
    [STAIR_EAST, 0],
    ['minecraft:torch', 0],
    ['minecraft:water[level=0]', FULL_CUBE | TRANSLUCENT],
    ['minecraft:barrier', INVISIBLE],
    ['minecraft:mystery_block', UNKNOWN | OPAQUE | FULL_CUBE],
    ['othermod:stone', UNKNOWN | OPAQUE | FULL_CUBE],
    ['minecraft:broken_block', UNKNOWN | OPAQUE | FULL_CUBE],
    ['minecraft:oak_stairs[facing=up,half=bottom,shape=straight]', UNKNOWN | OPAQUE | FULL_CUBE],
  ])('%s', (key, flags) => {
    expect(resources.appearance(key).flags).toBe(flags)
  })

  it('averages texture colors', () => {
    expect(resources.appearance('minecraft:stone').color).toBe(0x808080)
  })

  it('caches baked quads per state and cull mask', () => {
    expect(resources.bake('minecraft:stone', 1)).toBe(resources.bake('minecraft:stone', 1))
    expect(resources.bake('minecraft:stone', 1)!.count).toBe(5)
  })
})
