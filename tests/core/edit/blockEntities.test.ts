import { describe, expect, it } from 'vitest'
import { blockEntityId, blockEntityKind, keepsBlockEntity } from '../../../src/core/edit/blockEntities'

describe('keepsBlockEntity', () => {
  it.each([
    ['minecraft:chest', 'minecraft:trapped_chest'],
    ['minecraft:oak_sign', 'minecraft:spruce_wall_sign'],
    ['minecraft:oak_hanging_sign', 'minecraft:bamboo_wall_hanging_sign'],
    ['minecraft:white_banner', 'minecraft:red_wall_banner'],
    ['minecraft:white_bed', 'minecraft:black_bed'],
    ['minecraft:shulker_box', 'minecraft:lime_shulker_box'],
    ['minecraft:oak_shelf', 'minecraft:cherry_shelf'],
    ['minecraft:copper_chest', 'minecraft:waxed_oxidized_copper_chest'],
    ['minecraft:zombie_head', 'minecraft:skeleton_wall_skull'],
    ['minecraft:furnace', 'minecraft:furnace'],
    ['othermod:crate', 'othermod:crate'],
    ['minecraft:command_block', 'minecraft:repeating_command_block'],
    ['minecraft:bee_nest', 'minecraft:beehive'],
    ['minecraft:campfire', 'minecraft:soul_campfire'],
    ['minecraft:suspicious_sand', 'minecraft:suspicious_gravel'],
  ])('keeps data from %s to %s', (from, to) => {
    expect(keepsBlockEntity(from, to)).toBe(true)
  })

  it.each([
    ['minecraft:chest', 'minecraft:barrel'],
    ['minecraft:oak_sign', 'minecraft:oak_hanging_sign'],
    ['minecraft:furnace', 'minecraft:blast_furnace'],
    ['minecraft:chest', 'minecraft:copper_chest'],
    ['minecraft:chest', 'minecraft:air'],
    ['minecraft:player_head', 'minecraft:piston_head'],
  ])('drops data from %s to %s', (from, to) => {
    expect(keepsBlockEntity(from, to)).toBe(false)
  })

  it('treats piston heads as their own kind, not a skull', () => {
    expect(blockEntityKind('minecraft:piston_head')).toBe('minecraft:piston_head')
  })
})

describe('blockEntityId', () => {
  it.each([
    ['minecraft:chest', 'minecraft:chest'],
    ['minecraft:trapped_chest', 'minecraft:trapped_chest'],
  ])('%s has block entity id %s', (name, id) => {
    expect(blockEntityId(name)).toBe(id)
  })

  it('is undefined for blocks without a known fixed id (no rewrite needed)', () => {
    expect(blockEntityId('minecraft:oak_sign')).toBeUndefined()
    expect(blockEntityId('minecraft:furnace')).toBeUndefined()
  })
})
