// Block state → the items a player needs to place it (spec §10). Most
// blocks are their own item; this file lists every exception by hand,
// checked against the bundled item list by tests/core/materials/items.test.ts.
import type { BlockState } from '../model'
import { isAir } from '../model'

export interface ItemCount {
  /** Namespaced item id. */
  item: string
  count: number
}

/** Blocks with no item at all: they go in the material list's "itemless" section. */
export const ITEMLESS_BLOCKS: ReadonlySet<string> = new Set([
  'minecraft:bubble_column',
  'minecraft:end_gateway',
  'minecraft:end_portal',
  'minecraft:fire',
  'minecraft:frosted_ice',
  'minecraft:moving_piston',
  'minecraft:nether_portal',
  'minecraft:piston_head',
  'minecraft:soul_fire',
])

/** Blocks placed with a differently named item. */
export const ITEM_FOR_BLOCK: Readonly<Record<string, string>> = {
  'minecraft:attached_melon_stem': 'minecraft:melon_seeds',
  'minecraft:attached_pumpkin_stem': 'minecraft:pumpkin_seeds',
  'minecraft:bamboo_sapling': 'minecraft:bamboo',
  'minecraft:beetroots': 'minecraft:beetroot_seeds',
  'minecraft:big_dripleaf_stem': 'minecraft:big_dripleaf',
  'minecraft:carrots': 'minecraft:carrot',
  'minecraft:cave_vines': 'minecraft:glow_berries',
  'minecraft:cave_vines_plant': 'minecraft:glow_berries',
  'minecraft:cocoa': 'minecraft:cocoa_beans',
  'minecraft:kelp_plant': 'minecraft:kelp',
  'minecraft:lava_cauldron': 'minecraft:cauldron',
  'minecraft:melon_stem': 'minecraft:melon_seeds',
  'minecraft:pitcher_crop': 'minecraft:pitcher_pod',
  'minecraft:potatoes': 'minecraft:potato',
  'minecraft:powder_snow': 'minecraft:powder_snow_bucket',
  'minecraft:powder_snow_cauldron': 'minecraft:cauldron',
  'minecraft:pumpkin_stem': 'minecraft:pumpkin_seeds',
  'minecraft:redstone_wire': 'minecraft:redstone',
  'minecraft:sweet_berry_bush': 'minecraft:sweet_berries',
  'minecraft:tall_seagrass': 'minecraft:seagrass',
  'minecraft:torchflower_crop': 'minecraft:torchflower_seeds',
  'minecraft:tripwire': 'minecraft:string',
  'minecraft:twisting_vines_plant': 'minecraft:twisting_vines',
  'minecraft:water_cauldron': 'minecraft:cauldron',
  'minecraft:weeping_vines_plant': 'minecraft:weeping_vines',
  'minecraft:wheat': 'minecraft:wheat_seeds',
}

/** Potted plants whose plant item is not the block name minus `potted_`. */
export const POTTED_PLANT_ITEM: Readonly<Record<string, string>> = {
  'minecraft:potted_azalea_bush': 'minecraft:azalea',
  'minecraft:potted_flowering_azalea_bush': 'minecraft:flowering_azalea',
}

/** Fluids: the source block is placed with a bucket; flowing fluid has no item. */
const FLUID_BUCKETS: Readonly<Record<string, string>> = {
  'minecraft:water': 'minecraft:water_bucket',
  'minecraft:lava': 'minecraft:lava_bucket',
}

/** Properties whose value is the number of items in the block (4 candles, 3 sea pickles, ...). */
const COUNT_PROPERTIES = ['candles', 'pickles', 'eggs', 'layers', 'flower_amount', 'segment_amount'] as const

/** Items that stack to 16. */
export const STACK_16_ITEMS: ReadonlySet<string> = new Set([
  'minecraft:armor_stand',
  'minecraft:blue_egg',
  'minecraft:brown_egg',
  'minecraft:bucket',
  'minecraft:egg',
  'minecraft:ender_pearl',
  'minecraft:honey_bottle',
  'minecraft:snowball',
])
const STACK_16_PATTERN = /^minecraft:[a-z_]+_(sign|banner)$/

/** Items that do not stack. */
export const STACK_1_ITEMS: ReadonlySet<string> = new Set([
  'minecraft:cake',
  'minecraft:lava_bucket',
  'minecraft:powder_snow_bucket',
  'minecraft:water_bucket',
])
const STACK_1_PATTERN = /^minecraft:([a-z_]+_bed|([a-z_]+_)?shulker_box)$/

export function stackSize(item: string): 1 | 16 | 64 {
  if (STACK_1_ITEMS.has(item) || STACK_1_PATTERN.test(item)) return 1
  if (STACK_16_ITEMS.has(item) || STACK_16_PATTERN.test(item)) return 16
  return 64
}

function baseItems(name: string): ItemCount[] {
  const mapped = ITEM_FOR_BLOCK[name]
  if (mapped) return [{ item: mapped, count: 1 }]
  if (name.startsWith('minecraft:potted_')) {
    const plant = POTTED_PLANT_ITEM[name] ?? `minecraft:${name.slice('minecraft:potted_'.length)}`
    return [{ item: 'minecraft:flower_pot', count: 1 }, { item: plant, count: 1 }]
  }
  if (name.endsWith('candle_cake')) {
    return [{ item: 'minecraft:cake', count: 1 }, { item: name.slice(0, -'_cake'.length), count: 1 }]
  }
  // wall_torch → torch, oak_wall_sign → oak_sign, zombie_wall_head → zombie_head, ...
  if (name.startsWith('minecraft:wall_')) return [{ item: `minecraft:${name.slice('minecraft:wall_'.length)}`, count: 1 }]
  if (name.includes('_wall_')) return [{ item: name.replace('_wall_', '_'), count: 1 }]
  return [{ item: name, count: 1 }]
}

/**
 * Items needed for one block in this state. `[]` means the block adds
 * nothing (air, the upper half of a door or tall plant, the head of a bed:
 * the other half is counted). `null` means the block has no item at all.
 * Blocks outside the `minecraft` namespace are assumed to be their own item.
 */
export function itemsForState(state: BlockState): ItemCount[] | null {
  const { name, properties } = state
  if (isAir(state)) return []
  if (!name.startsWith('minecraft:')) return [{ item: name, count: 1 }]
  if (ITEMLESS_BLOCKS.has(name)) return null
  const bucket = FLUID_BUCKETS[name]
  if (bucket) return (properties.level ?? '0') === '0' ? [{ item: bucket, count: 1 }] : null
  if (properties.half === 'upper' || properties.part === 'head') return []

  const items = baseItems(name)
  let multiplier = properties.type === 'double' ? 2 : 1
  for (const prop of COUNT_PROPERTIES) {
    const value = properties[prop]
    if (value !== undefined) multiplier = Math.max(1, Number.parseInt(value, 10) || 1)
  }
  items[items.length - 1]!.count *= multiplier
  return items
}
