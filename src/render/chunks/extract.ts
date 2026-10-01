import type { ChunkCoord } from '../../core/edit/events'
import { blockStateKey, isAir, type Region } from '../../core/model'
import type { ChunkSlice } from '../mesh/types'
import { chunkInnerSize, chunkOrigin } from './coords'

/** Inclusive Y range, in region-local coordinates. */
export interface LocalYRange {
  min: number
  max: number
}

export interface ExtractOptions {
  /** Only blocks with min <= y <= max are copied; the rest read as air. Null shows every layer. */
  yRange?: LocalYRange | null
  /** Block names (`minecraft:stone`) to highlight; every other block is faded. Null disables highlighting. */
  highlight?: ReadonlySet<string> | null
}

/**
 * Copies one chunk plus its 1-block border out of the live region (spec §6).
 * Reads `region.palette` and `region.blocks` at call time, as Plan 2's
 * mutation contract requires. Returns null when no visible non-air block
 * lies inside the chunk, so callers can skip the worker.
 */
export function extractChunk(region: Region, coord: ChunkCoord, options: ExtractOptions = {}): ChunkSlice | null {
  const { palette, blocks, size: rs } = region
  const size = chunkInnerSize(rs, coord)
  const o = chunkOrigin(coord)
  const yMin = Math.max(0, options.yRange?.min ?? 0)
  const yMax = Math.min(rs.y - 1, options.yRange?.max ?? rs.y - 1)
  if (yMax < o.y || yMin > o.y + size.y - 1) return null

  const px = size.x + 2
  const pz = size.z + 2
  const cells = new Uint16Array(px * (size.y + 2) * pz)
  const states = ['minecraft:air']
  const local = new Map<number, number>()
  const layer = rs.x * rs.z
  let solidInside = false
  for (let y = -1; y <= size.y; y++) {
    const wy = o.y + y
    if (wy < yMin || wy > yMax) continue
    const inY = y >= 0 && y < size.y
    for (let z = -1; z <= size.z; z++) {
      const wz = o.z + z
      if (wz < 0 || wz >= rs.z) continue
      const inYZ = inY && z >= 0 && z < size.z
      const row = wy * layer + wz * rs.x
      const out = (y + 1) * px * pz + (z + 1) * px + 1
      for (let x = -1; x <= size.x; x++) {
        const wx = o.x + x
        if (wx < 0 || wx >= rs.x) continue
        const slot = blocks[row + wx]!
        let id = local.get(slot)
        if (id === undefined) {
          const state = palette[slot]
          id = state === undefined || isAir(state) ? 0 : states.push(blockStateKey(state)) - 1
          local.set(slot, id)
        }
        if (id !== 0) {
          cells[out + x] = id
          if (inYZ && x >= 0 && x < size.x) solidInside = true
        }
      }
    }
  }
  if (!solidInside) return null
  const highlight = options.highlight
  const faded = highlight
    ? Uint8Array.from(states, (key, i) => (i > 0 && !highlight.has(nameOf(key)) ? 1 : 0))
    : null
  return { size, cells, states, faded }
}

function nameOf(key: string): string {
  const open = key.indexOf('[')
  return open === -1 ? key : key.slice(0, open)
}
