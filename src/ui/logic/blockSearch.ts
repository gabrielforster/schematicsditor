import type { Schematic } from '../../core/model'

/** How well a namespaced name matches a normalized query; lower is better, -1 is no match. */
function rank(name: string, q: string): number {
  const path = name.slice(name.indexOf(':') + 1)
  if (name === q || path === q) return 0
  if (path.startsWith(q) || name.startsWith(q)) return 1
  if (`_${path}`.includes(`_${q}`)) return 2 // starts at a word: `stairs` in `oak_stairs`
  return name.includes(q) ? 3 : -1
}

/**
 * Block names for the picker (spec §9.1 searchable picker), best match
 * first, then alphabetically. Case-insensitive; spaces match underscores;
 * anything from `[` on (typed properties) is ignored.
 */
export function searchBlocks(names: readonly string[], query: string, limit = 50): string[] {
  const q = query.split('[')[0]!.trim().toLowerCase().replace(/\s+/g, '_')
  if (q === '') return []
  const hits: { name: string; rank: number }[] = []
  for (const name of names) {
    const r = rank(name, q)
    if (r >= 0) hits.push({ name, rank: r })
  }
  hits.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
  return hits.slice(0, limit).map((h) => h.name)
}

/** Every block name in the schematic's palettes, sorted; includes blocks the registry does not know. */
export function paletteNames(schematic: Schematic): string[] {
  const names = new Set<string>()
  for (const region of schematic.regions) for (const state of region.palette) names.add(state.name)
  return [...names].sort()
}

/** Registry names plus the schematic's own (possibly unknown) names, sorted and unique. */
export function pickerNames(registryNames: readonly string[], schematic: Schematic | null): string[] {
  if (!schematic) return [...registryNames]
  return [...new Set([...registryNames, ...paletteNames(schematic)])].sort()
}
