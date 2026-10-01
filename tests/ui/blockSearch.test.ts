import { describe, expect, it } from 'vitest'
import { bundledRegistry } from '../../src/core/registry'
import { paletteNames, pickerNames, searchBlocks } from '../../src/ui/logic/blockSearch'
import { makeSchematic } from '../helpers/model'

const names = ['minecraft:oak_stairs', 'minecraft:stone', 'minecraft:stone_stairs', 'minecraft:cobblestone', 'minecraft:redstone_wire', 'somemod:stone_thing']

describe('searchBlocks', () => {
  it('ranks exact, then prefix, then word start, then substring matches', () => {
    expect(searchBlocks(names, 'stone')).toEqual([
      'minecraft:stone', 'minecraft:stone_stairs', 'somemod:stone_thing', 'minecraft:cobblestone', 'minecraft:redstone_wire',
    ])
    expect(searchBlocks(names, 'stairs')).toEqual(['minecraft:oak_stairs', 'minecraft:stone_stairs'])
  })

  it('accepts a namespace, upper case, spaces for underscores, and typed properties', () => {
    expect(searchBlocks(names, 'minecraft:oak')).toEqual(['minecraft:oak_stairs'])
    expect(searchBlocks(names, 'Oak Stairs[facing=north]')).toEqual(['minecraft:oak_stairs'])
  })

  it('returns nothing for a blank query and honours the limit', () => {
    expect(searchBlocks(names, '  ')).toEqual([])
    expect(searchBlocks(names, 'st', 2)).toHaveLength(2)
  })

  it('finds air for delete-by-replace', () => {
    expect(searchBlocks(bundledRegistry().names(), 'air')[0]).toBe('minecraft:air')
  })
})

describe('pickerNames', () => {
  it('adds unknown names from the schematic to the registry names', () => {
    const s = makeSchematic([{ size: [2, 1, 1], palette: ['minecraft:stone', 'somemod:widget'], blocks: [0, 1] }])
    expect(paletteNames(s)).toEqual(['minecraft:stone', 'somemod:widget'])
    expect(pickerNames(['minecraft:dirt', 'minecraft:stone'], s)).toEqual(['minecraft:dirt', 'minecraft:stone', 'somemod:widget'])
    expect(pickerNames(['minecraft:dirt'], null)).toEqual(['minecraft:dirt'])
  })
})
