import { DIRECTIONS, faceShade, isFaceHidden, MeshBuilder } from './faces'
import { INVISIBLE, MAGENTA, TRANSLUCENT, UNKNOWN, paddedIndex, type ChunkMeshes, type ChunkSlice, type SlotAppearance } from './types'

/** Alpha of translucent blocks in colored mode. */
export const COLORED_TRANSLUCENT_ALPHA = 160

/**
 * Colored mesher (spec §8.4): one shaded cube per visible non-air block,
 * with culled faces. `appearance[id]` describes local id `id` of the slice.
 */
export function meshColored(slice: ChunkSlice, appearance: readonly SlotAppearance[]): ChunkMeshes {
  const { size, cells, faded } = slice
  const opaque = new MeshBuilder(false)
  const transparent = new MeshBuilder(false)
  const fadedOut = new MeshBuilder(false)
  const offsets = DIRECTIONS.map((d) => paddedIndex(size, d.dx, d.dy, d.dz) - paddedIndex(size, 0, 0, 0))
  for (let y = 0; y < size.y; y++) {
    for (let z = 0; z < size.z; z++) {
      for (let x = 0; x < size.x; x++) {
        const i = paddedIndex(size, x, y, z)
        const id = cells[i]!
        if (id === 0) continue
        const a = appearance[id]!
        if (a.flags & INVISIBLE) continue
        const isFaded = faded !== null && faded[id] === 1
        const color = a.flags & UNKNOWN ? MAGENTA : a.color
        const out = isFaded ? fadedOut : a.flags & TRANSLUCENT ? transparent : opaque
        const alpha = a.flags & TRANSLUCENT ? COLORED_TRANSLUCENT_ALPHA : 255
        for (let f = 0; f < 6; f++) {
          const n = cells[i + offsets[f]!]!
          const na = appearance[n]!
          if (isFaceHidden(a.flags, id, isFaded, na.flags, n, faded !== null && faded[n] === 1)) continue
          const d = DIRECTIONS[f]!
          const s = faceShade(d.dx, d.dy, d.dz)
          out.quad(d.corners, 0, x, y, z,
            ((color >> 16) & 255) / 255 * s, ((color >> 8) & 255) / 255 * s, (color & 255) / 255 * s, alpha)
        }
      }
    }
  }
  return { opaque: opaque.finish(), transparent: transparent.finish(), faded: fadedOut.finish() }
}
