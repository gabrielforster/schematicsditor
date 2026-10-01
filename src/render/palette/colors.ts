import { splitStateKey, type TexturedResources } from '../assets/resources'
import { FULL_CUBE, MAGENTA, OPAQUE, UNKNOWN, type SlotAppearance } from '../mesh/types'
import { paletteEntry, type PaletteEntry } from './build'
import bundled from './colors.json'

/** The Minecraft version the bundled colored palette was generated from. */
export const PALETTE_VERSION: { id: string; dataVersion: number } = bundled.version

const BLOCKS = bundled.blocks as unknown as Record<string, PaletteEntry>
const UNKNOWN_APPEARANCE: SlotAppearance = { flags: UNKNOWN | OPAQUE | FULL_CUBE, color: MAGENTA }

/** A stable color derived from the block name (FNV-1a hash → hue), for blocks without a texture color. */
export function hashColor(name: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return hslToRgb((h >>> 0) % 360, 0.45, 0.55)
}

function hslToRgb(h: number, s: number, l: number): number {
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))))
  }
  return (f(0) << 16) | (f(8) << 8) | f(4)
}

/**
 * Colored-mode appearance of a block state (spec §8.3): the bundled
 * average color and flags of its block, a hash color when the block has no
 * texture color, and a magenta cube when the block is not in the bundle.
 */
export function coloredAppearance(stateKey: string): SlotAppearance {
  const { name } = splitStateKey(stateKey)
  const colon = name.indexOf(':')
  if (colon !== -1 && name.slice(0, colon) !== 'minecraft') return UNKNOWN_APPEARANCE
  const path = colon === -1 ? name : name.slice(colon + 1)
  const entry = Object.hasOwn(BLOCKS, path) ? BLOCKS[path] : undefined
  if (!entry) return UNKNOWN_APPEARANCE
  return { flags: entry[1], color: entry[0] ?? hashColor(path) }
}

/**
 * Colored-mode appearance using the file's own version assets when they are
 * loaded, so blocks renamed since (pre-1.20.3 `minecraft:grass`) keep their
 * color; falls back to the bundled palette.
 */
export function coloredAppearanceWith(resources: TexturedResources | null, stateKey: string): SlotAppearance {
  if (resources) {
    const a = resources.analyze(stateKey)
    if (!(a.flags & UNKNOWN)) {
      const [color, flags] = paletteEntry(a)
      return { flags, color: color ?? hashColor(splitStateKey(stateKey).name.replace(/^minecraft:/, '')) }
    }
  }
  return coloredAppearance(stateKey)
}
