import { CHUNK_SIZE, type ChunkCoord } from '../../core/edit/events'
import type { Vec3 } from '../../core/model'

/** Which mesh set a chunk belongs to: the normal view, or the faded layer below in single-layer mode. */
export type ChunkPass = 'main' | 'ghost'

/** Number of chunks along each axis of a region. */
export function chunkCounts(size: Vec3): Vec3 {
  return { x: Math.ceil(size.x / CHUNK_SIZE), y: Math.ceil(size.y / CHUNK_SIZE), z: Math.ceil(size.z / CHUNK_SIZE) }
}

/** Region-local block coordinates of the chunk's minimum corner. */
export function chunkOrigin(c: ChunkCoord): Vec3 {
  return { x: c.cx * CHUNK_SIZE, y: c.cy * CHUNK_SIZE, z: c.cz * CHUNK_SIZE }
}

/** Inner size of a chunk: 16 per axis, less at the region's far edges. */
export function chunkInnerSize(regionSize: Vec3, c: ChunkCoord): Vec3 {
  const o = chunkOrigin(c)
  return {
    x: Math.min(CHUNK_SIZE, regionSize.x - o.x),
    y: Math.min(CHUNK_SIZE, regionSize.y - o.y),
    z: Math.min(CHUNK_SIZE, regionSize.z - o.z),
  }
}

/** Every chunk of a region, ordered by cy, then cz, then cx. */
export function allChunks(size: Vec3): ChunkCoord[] {
  const n = chunkCounts(size)
  const out: ChunkCoord[] = []
  for (let cy = 0; cy < n.y; cy++) for (let cz = 0; cz < n.z; cz++) for (let cx = 0; cx < n.x; cx++) out.push({ cx, cy, cz })
  return out
}

export function chunkKey(regionId: number, c: ChunkCoord, pass: ChunkPass): string {
  return `${regionId}/${c.cx},${c.cy},${c.cz}/${pass}`
}
