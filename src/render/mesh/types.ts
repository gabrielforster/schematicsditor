import type { Vec3 } from '../../core/model'

/** Render facts about one block state, as bit flags (spec §8.4). */
export const OPAQUE = 1
/** The block fills its whole cell (glass, leaves, water): identical neighbours cull the shared face. */
export const FULL_CUBE = 2
/** Drawn in the transparent pass (stained glass, ice, water). */
export const TRANSLUCENT = 4
/** No data for this block: drawn as a magenta cube. */
export const UNKNOWN = 8
/** Air, or a block without geometry: no faces, never hides a neighbour. */
export const INVISIBLE = 16

export const MAGENTA = 0xff00ff

/** Appearance of local id 0 (air) in every slice. */
export const AIR_APPEARANCE: SlotAppearance = { flags: INVISIBLE, color: 0 }

/** How the mesher draws one block state. `color` is 0xRRGGBB (colored mode and unknown blocks). */
export interface SlotAppearance {
  flags: number
  color: number
}

/**
 * One chunk's blocks, copied off the model for a mesh worker (spec §6).
 * `cells` covers the chunk plus a 1-block border on every side, so the
 * padded box is `(size.x + 2) × (size.y + 2) × (size.z + 2)`, in the model's
 * order (y, then z, then x). Each cell holds a local id into `states`.
 * Local id 0 is always air; cells outside the region or outside the visible
 * Y range are 0, so faces next to them render (cut faces render solid).
 */
export interface ChunkSlice {
  /** Inner chunk size, 1..16 per axis (smaller at the region's far edges). */
  size: Vec3
  cells: Uint16Array
  /** Block state key per local id; `states[0]` is `minecraft:air`. */
  states: string[]
  /** 1 where the local id is outside the highlight set (drawn faded); null when no highlight is active. */
  faded: Uint8Array | null
}

/** Vertex and index buffers for one draw call. Positions are chunk-local, in blocks. */
export interface MeshData {
  positions: Float32Array
  /** RGBA, 4 bytes per vertex, normalized. */
  colors: Uint8Array
  /** Atlas UVs, 2 floats per vertex; null in colored mode. */
  uvs: Float32Array | null
  indices: Uint32Array
}

/** A chunk's meshes: opaque first, then transparent with depth-write off, then faded (highlight). */
export interface ChunkMeshes {
  opaque: MeshData | null
  transparent: MeshData | null
  faded: MeshData | null
}

export type RenderMode = 'textured' | 'colored'

/** Index of padded cell (x, y, z), where inner cells run 0..size-1 and the border is -1 and size. */
export function paddedIndex(size: Vec3, x: number, y: number, z: number): number {
  const px = size.x + 2
  const pz = size.z + 2
  return (y + 1) * px * pz + (z + 1) * px + (x + 1)
}

/** The buffers a mesh owns, for `postMessage` transfer lists. */
export function meshBuffers(meshes: ChunkMeshes): ArrayBuffer[] {
  const out: ArrayBuffer[] = []
  for (const m of [meshes.opaque, meshes.transparent, meshes.faded]) {
    if (!m) continue
    out.push(m.positions.buffer as ArrayBuffer, m.colors.buffer as ArrayBuffer, m.indices.buffer as ArrayBuffer)
    if (m.uvs) out.push(m.uvs.buffer as ArrayBuffer)
  }
  return out
}
