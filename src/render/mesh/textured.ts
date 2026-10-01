import type { TexturedResources } from '../assets/resources'
import { DIRECTIONS, faceShade, isFaceHidden, MeshBuilder } from './faces'
import { AIR_APPEARANCE, INVISIBLE, UNKNOWN, paddedIndex, type ChunkMeshes, type ChunkSlice } from './types'

/**
 * Textured mesher (spec §8.4): deepslate block models with blockstate
 * rotations, per-face culling, translucent faces in their own mesh, and
 * magenta cubes for blocks the assets do not know.
 */
export function meshTextured(slice: ChunkSlice, resources: TexturedResources): ChunkMeshes {
  const { size, cells, states, faded } = slice
  const appearance = states.map((key, i) => (i === 0 ? AIR_APPEARANCE : resources.appearance(key)))
  const opaque = new MeshBuilder(true)
  const transparent = new MeshBuilder(true)
  const fadedOut = new MeshBuilder(true)
  const offsets = DIRECTIONS.map((d) => paddedIndex(size, d.dx, d.dy, d.dz) - paddedIndex(size, 0, 0, 0))
  const white = resources.whiteUv
  const whiteQuad = [white[0], white[3], white[2], white[3], white[2], white[1], white[0], white[1]]
  for (let y = 0; y < size.y; y++) {
    for (let z = 0; z < size.z; z++) {
      for (let x = 0; x < size.x; x++) {
        const i = paddedIndex(size, x, y, z)
        const id = cells[i]!
        if (id === 0) continue
        const a = appearance[id]!
        if (a.flags & INVISIBLE) continue
        const isFaded = faded !== null && faded[id] === 1
        let mask = 0
        for (let f = 0; f < 6; f++) {
          const n = cells[i + offsets[f]!]!
          if (isFaceHidden(a.flags, id, isFaded, appearance[n]!.flags, n, faded !== null && faded[n] === 1)) {
            mask |= DIRECTIONS[f]!.bit
          }
        }
        if (a.flags & UNKNOWN) {
          const out = isFaded ? fadedOut : opaque
          for (const d of DIRECTIONS) {
            if (mask & d.bit) continue
            const s = faceShade(d.dx, d.dy, d.dz)
            out.quad(d.corners, 0, x, y, z, s, 0, s, 255, whiteQuad)
          }
          continue
        }
        const quads = resources.bake(states[id]!, mask)
        if (!quads) continue
        for (let q = 0; q < quads.count; q++) {
          const out = isFaded ? fadedOut : quads.translucent[q] ? transparent : opaque
          out.quad(quads.positions, q * 12, x, y, z,
            quads.colors[q * 3]!, quads.colors[q * 3 + 1]!, quads.colors[q * 3 + 2]!, 255,
            quads.uvs, q * 8)
        }
      }
    }
  }
  return { opaque: opaque.finish(), transparent: transparent.finish(), faded: fadedOut.finish() }
}
