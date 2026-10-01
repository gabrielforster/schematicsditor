// Imports edit modules directly, not '../edit', because edit/editor imports this file.
import { previewReplace, type ReplacePreview, type ReplaceRule } from '../edit/replace'
import { paletteCounts, resolveScopes, type Scope } from '../edit/scopes'
import type { Schematic } from '../model'
import type { BlockRegistry } from '../registry'
import type { Family } from './families'

export interface UnmappedShape {
  shape: string
  /** The source family's block for this shape. */
  block: string
  /** Blocks of it in scope; they stay unchanged. */
  count: number
}

export interface FamilySwapPreview extends ReplacePreview {
  /** Source shapes present in scope that the target family lacks. */
  unmapped: UnmappedShape[]
}

/** One replace rule per shape key both families share (spec §9.2), in source order. */
export function familySwapRules(source: Family, target: Family): ReplaceRule[] {
  const rules: ReplaceRule[] = []
  for (const [shape, from] of Object.entries(source.blocks)) {
    const to = target.blocks[shape]
    if (to !== undefined) rules.push({ from: [{ kind: 'block', name: from }], to: { name: to } })
  }
  return rules
}

export function previewFamilySwap(
  schematic: Schematic, source: Family, target: Family, scopes: readonly Scope[], registry: BlockRegistry,
): FamilySwapPreview {
  const unmappedShapes = Object.entries(source.blocks).filter(([shape]) => target.blocks[shape] === undefined)
  const unmappedBlocks = new Set(unmappedShapes.map(([, block]) => block))
  const counts = new Map<string, number>()
  if (unmappedBlocks.size > 0) {
    for (const regionScope of resolveScopes(schematic, scopes)) {
      const region = schematic.regions[regionScope.regionId]!
      const slotCounts = paletteCounts(region, regionScope)
      region.palette.forEach((state, slot) => {
        if (!unmappedBlocks.has(state.name)) return
        const n = slotCounts[slot]!
        if (n > 0) counts.set(state.name, (counts.get(state.name) ?? 0) + n)
      })
    }
  }
  const unmapped: UnmappedShape[] = []
  for (const [shape, block] of unmappedShapes) {
    const count = counts.get(block) ?? 0
    if (count > 0) unmapped.push({ shape, block, count })
  }
  return { ...previewReplace(schematic, familySwapRules(source, target), scopes, registry), unmapped }
}
