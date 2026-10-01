import { CHUNK_SIZE, type ChunkCoord, type RegionChange } from '../../core/edit/events'
import type { Region } from '../../core/model'
import { chunkCounts } from './coords'

/**
 * Chunks to remesh for one change event (spec §8.7). `dirtyChunks` already
 * include face neighbours. For `paletteChange`, every chunk holding one of
 * the slots is dirty, plus its face neighbours (whose border may hold one).
 * Each chunk is scanned only up to its first changed block, so the cost
 * stays near one pass over the region's block array.
 */
export function chunksForChange(region: Region, change: RegionChange): ChunkCoord[] {
  if ('dirtyChunks' in change) return change.dirtyChunks
  const changed = new Uint8Array(region.palette.length)
  for (const slot of change.paletteChange.slots) if (slot < changed.length) changed[slot] = 1
  const n = chunkCounts(region.size)
  const marks = new Uint8Array(n.x * n.y * n.z)
  const mark = (cx: number, cy: number, cz: number) => {
    if (cx >= 0 && cy >= 0 && cz >= 0 && cx < n.x && cy < n.y && cz < n.z) marks[(cy * n.z + cz) * n.x + cx] = 1
  }
  for (let cy = 0; cy < n.y; cy++) {
    for (let cz = 0; cz < n.z; cz++) {
      for (let cx = 0; cx < n.x; cx++) {
        if (holdsChanged(region, changed, cx, cy, cz)) {
          mark(cx, cy, cz)
          mark(cx - 1, cy, cz)
          mark(cx + 1, cy, cz)
          mark(cx, cy - 1, cz)
          mark(cx, cy + 1, cz)
          mark(cx, cy, cz - 1)
          mark(cx, cy, cz + 1)
        }
      }
    }
  }
  const out: ChunkCoord[] = []
  for (let i = 0; i < marks.length; i++) {
    if (marks[i]) out.push({ cx: i % n.x, cy: Math.floor(i / (n.x * n.z)), cz: Math.floor(i / n.x) % n.z })
  }
  return out
}

/** True when some block of the chunk uses a changed palette slot; stops at the first one. */
function holdsChanged(region: Region, changed: Uint8Array, cx: number, cy: number, cz: number): boolean {
  const { blocks, size } = region
  const layer = size.x * size.z
  const x0 = cx * CHUNK_SIZE, y0 = cy * CHUNK_SIZE, z0 = cz * CHUNK_SIZE
  const x1 = Math.min(size.x, x0 + CHUNK_SIZE), y1 = Math.min(size.y, y0 + CHUNK_SIZE), z1 = Math.min(size.z, z0 + CHUNK_SIZE)
  for (let y = y0; y < y1; y++) {
    for (let z = z0; z < z1; z++) {
      const row = y * layer + z * size.x
      for (let i = row + x0, end = row + x1; i < end; i++) if (changed[blocks[i]!]) return true
    }
  }
  return false
}
