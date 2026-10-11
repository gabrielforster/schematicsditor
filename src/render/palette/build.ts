import { NO_COLOR, type StateAnalysis, type TexturedResources } from '../assets/resources'
import { FULL_CUBE, INVISIBLE, OPAQUE, TRANSLUCENT, UNKNOWN } from '../mesh/types'

/** One bundled palette entry: [0xRRGGBB or null for a hash color, colored-mode flags]. */
export type PaletteEntry = [number | null, number]

/**
 * Colored-mode facts for a block, from its default state's textured
 * analysis. Colored mode cannot alpha-test, so anything with see-through
 * pixels that is not an opaque cube becomes translucent; blocks without
 * geometry (barrier, light) become translucent hash-colored cubes, because
 * colored mode draws every non-air block (spec §8.4).
 */
export function paletteEntry(a: StateAnalysis): PaletteEntry {
  if (a.flags & UNKNOWN) return [null, 0]
  if (a.flags & INVISIBLE) return [null, TRANSLUCENT]
  let flags = a.flags & (OPAQUE | FULL_CUBE)
  if (!(flags & OPAQUE) && (a.seeThrough || a.flags & TRANSLUCENT)) flags |= TRANSLUCENT
  return [a.color === NO_COLOR ? null : a.color, flags]
}

/** mcmeta `blocks/data.json`: name (no namespace) → [property values, default properties]. */
export type BlocksData = Record<string, readonly [unknown, Record<string, string>]>

const AIR = new Set(['air', 'cave_air', 'void_air'])

/** Palette entries for every non-air block, keyed by name without namespace, sorted by name. */
export function buildPalette(resources: TexturedResources, blocks: BlocksData): Record<string, PaletteEntry> {
  const out: Record<string, PaletteEntry> = {}
  for (const name of Object.keys(blocks).sort()) {
    if (AIR.has(name)) continue
    const defaults = blocks[name]![1]
    const props = Object.keys(defaults).sort().map((k) => `${k}=${defaults[k]}`).join(',')
    out[name] = paletteEntry(resources.analyze(`minecraft:${name}${props ? `[${props}]` : ''}`))
  }
  return out
}
