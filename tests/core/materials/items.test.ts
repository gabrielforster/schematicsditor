import { describe, expect, it } from 'vitest'
import itemData from '../../../src/core/registry/items.json'
import { ITEMLESS_BLOCKS, ITEM_FOR_BLOCK, POTTED_PLANT_ITEM, STACK_16_ITEMS, STACK_1_ITEMS, itemsForState, stackSize } from '../../../src/core/materials/items'
import { parseBlockStateKey } from '../../../src/core/model'
import { bundledRegistry } from '../../../src/core/registry'

const registry = bundledRegistry()
const ITEMS = new Set(itemData.items.map((i) => `minecraft:${i}`))
const items = (key: string) => itemsForState(parseBlockStateKey(key))

describe('itemsForState', () => {
  it('maps a plain block to its own item', () => {
    expect(items('minecraft:stone')).toEqual([{ item: 'minecraft:stone', count: 1 }])
  })

  it.each([
    ['minecraft:wall_torch[facing=north]', 'minecraft:torch'],
    ['minecraft:soul_wall_torch[facing=north]', 'minecraft:soul_torch'],
    ['minecraft:redstone_wall_torch[facing=north,lit=true]', 'minecraft:redstone_torch'],
    ['minecraft:redstone_wire[east=none,north=side,power=0,south=none,west=none]', 'minecraft:redstone'],
    ['minecraft:oak_wall_sign[facing=north,waterlogged=false]', 'minecraft:oak_sign'],
    ['minecraft:bamboo_wall_hanging_sign[facing=north,waterlogged=false]', 'minecraft:bamboo_hanging_sign'],
    ['minecraft:red_wall_banner[facing=north]', 'minecraft:red_banner'],
    ['minecraft:zombie_wall_head[facing=north,powered=false]', 'minecraft:zombie_head'],
    ['minecraft:tube_coral_wall_fan[facing=north,waterlogged=true]', 'minecraft:tube_coral_fan'],
    ['minecraft:wheat[age=7]', 'minecraft:wheat_seeds'],
    ['minecraft:cave_vines_plant[berries=true]', 'minecraft:glow_berries'],
    ['minecraft:tripwire[attached=false,disarmed=false,east=false,north=false,powered=false,south=false,west=false]', 'minecraft:string'],
    ['minecraft:water_cauldron[level=3]', 'minecraft:cauldron'],
  ])('maps %s to %s', (key, item) => {
    expect(items(key)).toEqual([{ item, count: 1 }])
  })

  it('counts a double slab as two slabs', () => {
    expect(items('minecraft:oak_slab[type=double,waterlogged=false]')).toEqual([{ item: 'minecraft:oak_slab', count: 2 }])
  })

  it('counts doors, tall plants and beds once', () => {
    expect(items('minecraft:oak_door[facing=north,half=upper,hinge=left,open=false,powered=false]')).toEqual([])
    expect(items('minecraft:oak_door[facing=north,half=lower,hinge=left,open=false,powered=false]')).toEqual([{ item: 'minecraft:oak_door', count: 1 }])
    expect(items('minecraft:sunflower[half=upper]')).toEqual([])
    expect(items('minecraft:red_bed[facing=north,occupied=false,part=head]')).toEqual([])
    expect(items('minecraft:red_bed[facing=north,occupied=false,part=foot]')).toEqual([{ item: 'minecraft:red_bed', count: 1 }])
  })

  it('does not treat the top half of stairs as an upper half', () => {
    expect(items('minecraft:oak_stairs[facing=north,half=top,shape=straight,waterlogged=false]')).toEqual([{ item: 'minecraft:oak_stairs', count: 1 }])
  })

  it('counts multi-item blocks by their count property', () => {
    expect(items('minecraft:candle[candles=3,lit=false,waterlogged=false]')).toEqual([{ item: 'minecraft:candle', count: 3 }])
    expect(items('minecraft:sea_pickle[pickles=4,waterlogged=true]')).toEqual([{ item: 'minecraft:sea_pickle', count: 4 }])
    expect(items('minecraft:snow[layers=5]')).toEqual([{ item: 'minecraft:snow', count: 5 }])
    expect(items('minecraft:pink_petals[facing=north,flower_amount=2]')).toEqual([{ item: 'minecraft:pink_petals', count: 2 }])
  })

  it('counts multiface blocks by the number of faces set to true, minimum 1', () => {
    expect(items('minecraft:glow_lichen[down=false,east=true,north=true,south=false,up=false,waterlogged=false,west=false]'))
      .toEqual([{ item: 'minecraft:glow_lichen', count: 2 }])
    expect(items('minecraft:sculk_vein[down=false,east=false,north=false,south=false,up=false,waterlogged=false,west=false]'))
      .toEqual([{ item: 'minecraft:sculk_vein', count: 1 }])
    expect(items('minecraft:resin_clump[down=true,east=true,north=true,south=true,up=true,waterlogged=false,west=true]'))
      .toEqual([{ item: 'minecraft:resin_clump', count: 6 }])
    expect(items('minecraft:vine[east=true,north=false,south=true,up=false,west=false]'))
      .toEqual([{ item: 'minecraft:vine', count: 2 }])
  })

  it('splits potted plants and candle cakes into their items', () => {
    expect(items('minecraft:potted_poppy')).toEqual([{ item: 'minecraft:flower_pot', count: 1 }, { item: 'minecraft:poppy', count: 1 }])
    expect(items('minecraft:potted_azalea_bush')).toEqual([{ item: 'minecraft:flower_pot', count: 1 }, { item: 'minecraft:azalea', count: 1 }])
    expect(items('minecraft:red_candle_cake[lit=false]')).toEqual([{ item: 'minecraft:cake', count: 1 }, { item: 'minecraft:red_candle', count: 1 }])
  })

  it('shows fluid sources as buckets and flowing fluid as itemless', () => {
    expect(items('minecraft:water[level=0]')).toEqual([{ item: 'minecraft:water_bucket', count: 1 }])
    expect(items('minecraft:lava[level=0]')).toEqual([{ item: 'minecraft:lava_bucket', count: 1 }])
    expect(items('minecraft:water[level=3]')).toBeNull()
  })

  it('reports itemless blocks as null and air as nothing', () => {
    expect(items('minecraft:fire[age=0,east=false,north=false,south=false,up=false,west=false]')).toBeNull()
    expect(items('minecraft:piston_head[facing=north,short=false,type=normal]')).toBeNull()
    expect(items('minecraft:cave_air')).toEqual([])
  })

  it('treats blocks from other namespaces as their own item', () => {
    expect(items('othermod:lamp[lit=true]')).toEqual([{ item: 'othermod:lamp', count: 1 }])
  })
})

describe('item mapping against the bundled data', () => {
  it('maps the default state of every bundled block to real items, or marks it itemless', () => {
    const bad: string[] = []
    for (const name of registry.names()) {
      const result = itemsForState(registry.defaultState(name))
      if (result === null) continue
      for (const { item } of result) if (!ITEMS.has(item)) bad.push(`${name} → ${item}`)
    }
    expect(bad).toEqual([])
  })

  it('lists only real blocks and items in the curated tables', () => {
    for (const block of [...ITEMLESS_BLOCKS, ...Object.keys(ITEM_FOR_BLOCK), ...Object.keys(POTTED_PLANT_ITEM)]) expect(registry.has(block), block).toBe(true)
    for (const item of [...Object.values(ITEM_FOR_BLOCK), ...Object.values(POTTED_PLANT_ITEM), ...STACK_16_ITEMS, ...STACK_1_ITEMS]) expect(ITEMS.has(item), item).toBe(true)
  })

  it('marks as itemless only blocks that really have no item', () => {
    for (const block of ITEMLESS_BLOCKS) expect(ITEMS.has(block), block).toBe(false)
  })
})

describe('stackSize', () => {
  it.each([
    ['minecraft:stone', 64],
    ['minecraft:oak_sign', 16],
    ['minecraft:bamboo_hanging_sign', 16],
    ['minecraft:white_banner', 16],
    ['minecraft:ender_pearl', 16],
    ['minecraft:snowball', 16],
    ['minecraft:bucket', 16],
    ['minecraft:water_bucket', 1],
    ['minecraft:red_bed', 1],
    ['minecraft:shulker_box', 1],
    ['minecraft:lime_shulker_box', 1],
    ['minecraft:cake', 1],
    ['othermod:lamp', 64],
  ])('%s stacks to %i', (item, size) => {
    expect(stackSize(item)).toBe(size)
  })
})
