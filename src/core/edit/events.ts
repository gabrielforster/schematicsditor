import type { Vec3 } from '../model'

/** Edge length of a render chunk (spec §6, §8.4). */
export const CHUNK_SIZE = 16

/** Chunk coordinates in region-local space: chunk (cx, cy, cz) holds x in [16cx, 16cx + 15], etc. */
export interface ChunkCoord {
  cx: number
  cy: number
  cz: number
}

/**
 * What an edit changed, for the renderer (spec §3, §8.7). `regionId` is the
 * index into `schematic.regions`.
 * - `dirtyChunks`: block indices changed inside these chunks. Chunks that
 *   share a face with a changed block are included, because face culling
 *   there depends on it.
 * - `paletteChange`: these palette slots now hold different states; every
 *   chunk containing one of them must be remeshed.
 */
export type RegionChange =
  | { regionId: number; dirtyChunks: ChunkCoord[] }
  | { regionId: number; paletteChange: { indices: number[] } }

/** Collects the chunks touched by changed blocks of one region. */
export class DirtyChunks {
  private readonly counts: Vec3
  private readonly marks: Uint8Array

  constructor(private readonly size: Vec3) {
    this.counts = {
      x: Math.ceil(size.x / CHUNK_SIZE),
      y: Math.ceil(size.y / CHUNK_SIZE),
      z: Math.ceil(size.z / CHUNK_SIZE),
    }
    this.marks = new Uint8Array(this.counts.x * this.counts.y * this.counts.z)
  }

  /** Mark the chunk of local block (x, y, z) and chunks sharing a face with it. */
  mark(x: number, y: number, z: number): void {
    const cx = Math.floor(x / CHUNK_SIZE), cy = Math.floor(y / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE)
    this.set(cx, cy, cz)
    const lx = x % CHUNK_SIZE, ly = y % CHUNK_SIZE, lz = z % CHUNK_SIZE
    if (lx === 0) this.set(cx - 1, cy, cz)
    if (lx === CHUNK_SIZE - 1) this.set(cx + 1, cy, cz)
    if (ly === 0) this.set(cx, cy - 1, cz)
    if (ly === CHUNK_SIZE - 1) this.set(cx, cy + 1, cz)
    if (lz === 0) this.set(cx, cy, cz - 1)
    if (lz === CHUNK_SIZE - 1) this.set(cx, cy, cz + 1)
  }

  /** Mark by block index (`y*sizeX*sizeZ + z*sizeX + x`). */
  markIndex(index: number): void {
    const { x: sx, z: sz } = this.size
    this.mark(index % sx, Math.floor(index / (sx * sz)), Math.floor(index / sx) % sz)
  }

  /** Marked chunks ordered by cy, then cz, then cx. */
  list(): ChunkCoord[] {
    const out: ChunkCoord[] = []
    const { x: nx, z: nz } = this.counts
    for (let i = 0; i < this.marks.length; i++) {
      if (this.marks[i]) out.push({ cx: i % nx, cy: Math.floor(i / (nx * nz)), cz: Math.floor(i / nx) % nz })
    }
    return out
  }

  private set(cx: number, cy: number, cz: number): void {
    const { x: nx, y: ny, z: nz } = this.counts
    if (cx < 0 || cy < 0 || cz < 0 || cx >= nx || cy >= ny || cz >= nz) return
    this.marks[cy * nx * nz + cz * nx + cx] = 1
  }
}

export function dirtyChunksForIndices(size: Vec3, indices: ArrayLike<number>): ChunkCoord[] {
  const dirty = new DirtyChunks(size)
  for (let i = 0; i < indices.length; i++) dirty.markIndex(indices[i]!)
  return dirty.list()
}
