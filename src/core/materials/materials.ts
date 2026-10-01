import { paletteCounts, resolveScopes, type Scope } from '../edit/scopes'
import type { Schematic } from '../model'
import type { BlockRegistry } from '../registry'
import { itemsForState, stackSize } from './items'

export interface MaterialRow {
  /** Namespaced item id; for unknown blocks, the block name. */
  item: string
  count: number
  stackSize: 1 | 16 | 64
  /** Stacks (inventory slots) needed: ceil(count / stackSize). */
  stacks: number
  /** Shulker boxes needed at 27 stacks each: ceil(stacks / 27). */
  shulkerBoxes: number
  /** Block names counted into this row, sorted, for highlighting them in the 3D view. */
  blocks: string[]
  /** The block is not in the registry for this Minecraft version. */
  unknown: boolean
}

export interface ItemlessRow {
  block: string
  count: number
}

export interface MaterialList {
  /** Sorted by count, largest first, then by item. */
  rows: MaterialRow[]
  /** Blocks without an item (fire, portals, flowing fluid, ...), sorted the same way. */
  itemless: ItemlessRow[]
}

export const SHULKER_SLOTS = 27

export function stacksFor(count: number, size: number): number {
  return Math.ceil(count / size)
}

export function shulkerBoxesFor(count: number, size: number): number {
  return Math.ceil(stacksFor(count, size) / SHULKER_SLOTS)
}

/** Items needed for the blocks in scope, grouped by item (spec §10). */
export function computeMaterials(schematic: Schematic, scopes: readonly Scope[], registry: BlockRegistry): MaterialList {
  const rows = new Map<string, { count: number; blocks: Set<string>; unknown: boolean }>()
  const itemless = new Map<string, number>()
  const add = (item: string, count: number, block: string, unknown: boolean) => {
    let row = rows.get(item)
    if (!row) rows.set(item, (row = { count: 0, blocks: new Set(), unknown }))
    row.count += count
    row.blocks.add(block)
  }

  for (const scope of resolveScopes(schematic, scopes)) {
    const region = schematic.regions[scope.regionId]!
    const counts = paletteCounts(region, scope)
    region.palette.forEach((state, slot) => {
      const n = counts[slot]!
      if (n === 0) return
      if (!registry.has(state.name)) {
        add(state.name, n, state.name, true)
        return
      }
      const items = itemsForState(state)
      if (items === null) {
        itemless.set(state.name, (itemless.get(state.name) ?? 0) + n)
        return
      }
      for (const { item, count } of items) add(item, count * n, state.name, false)
    })
  }

  const byCount = <T extends { count: number }>(key: (r: T) => string) => (a: T, b: T) =>
    b.count - a.count || key(a).localeCompare(key(b))
  return {
    rows: [...rows].map(([item, r]): MaterialRow => {
      const size = stackSize(item)
      return {
        item, count: r.count, stackSize: size,
        stacks: stacksFor(r.count, size), shulkerBoxes: shulkerBoxesFor(r.count, size),
        blocks: [...r.blocks].sort(), unknown: r.unknown,
      }
    }).sort(byCount((r) => r.item)),
    itemless: [...itemless].map(([block, count]) => ({ block, count })).sort(byCount((r) => r.block)),
  }
}

export type MaterialSortKey = 'item' | 'count' | 'stacks' | 'shulkerBoxes'

/** A sorted copy; ties fall back to item name. */
export function sortMaterials(rows: readonly MaterialRow[], key: MaterialSortKey, direction: 'asc' | 'desc'): MaterialRow[] {
  const sign = direction === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const primary = key === 'item' ? a.item.localeCompare(b.item) : a[key] - b[key]
    return sign * primary || a.item.localeCompare(b.item)
  })
}

/** Rows whose item or block names contain the query (case-insensitive; spaces match underscores). */
export function filterMaterials(rows: readonly MaterialRow[], query: string): MaterialRow[] {
  const q = query.trim().toLowerCase().replace(/\s+/g, '_')
  if (q === '') return [...rows]
  return rows.filter((r) => r.item.toLowerCase().includes(q) || r.blocks.some((b) => b.toLowerCase().includes(q)))
}
