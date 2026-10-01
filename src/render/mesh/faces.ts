import { FULL_CUBE, OPAQUE, type MeshData } from './types'

export type DirectionName = 'up' | 'down' | 'north' | 'south' | 'west' | 'east'

export interface Direction {
  name: DirectionName
  /** Bit in a cull mask. */
  bit: number
  dx: number
  dy: number
  dz: number
  /**
   * The unit cube face's corners, counter-clockwise seen from outside (12
   * numbers). Same corner order as deepslate's model faces.
   */
  corners: readonly number[]
}

export const DIRECTIONS: readonly Direction[] = [
  { name: 'up', bit: 1, dx: 0, dy: 1, dz: 0, corners: [0, 1, 1, 1, 1, 1, 1, 1, 0, 0, 1, 0] },
  { name: 'down', bit: 2, dx: 0, dy: -1, dz: 0, corners: [0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1] },
  { name: 'south', bit: 4, dx: 0, dy: 0, dz: 1, corners: [0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1] },
  { name: 'north', bit: 8, dx: 0, dy: 0, dz: -1, corners: [1, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 0] },
  { name: 'east', bit: 16, dx: 1, dy: 0, dz: 0, corners: [1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 1, 1] },
  { name: 'west', bit: 32, dx: -1, dy: 0, dz: 0, corners: [0, 0, 0, 0, 0, 1, 0, 1, 1, 0, 1, 0] },
]

/**
 * Minecraft-style directional shading for a face normal: up 1.0, down 0.5,
 * north/south 0.8, east/west 0.6, blended for tilted faces.
 */
export function faceShade(nx: number, ny: number, nz: number): number {
  return Math.min(1, nx * nx * 0.6 + ny * ny * (ny > 0 ? 1 : 0.5) + nz * nz * 0.8)
}

/**
 * Whether the face of block `self` towards block `neighbor` is hidden
 * (spec §8.4): neighbours that are opaque full cubes hide it, and so does an
 * identical full-cube neighbour (glass next to glass). A faded neighbour
 * (outside the highlight set) never hides a block that is not faded.
 */
export function isFaceHidden(
  selfFlags: number, selfId: number, selfFaded: boolean,
  neighborFlags: number, neighborId: number, neighborFaded: boolean,
): boolean {
  if (neighborFaded && !selfFaded) return false
  if (neighborFlags & OPAQUE) return true
  return (selfFlags & FULL_CUBE) !== 0 && selfId === neighborId
}

/** Growable vertex/index buffers for one bucket of a chunk mesh. */
export class MeshBuilder {
  /** Capacity in vertices; every buffer is sized from it. */
  private capacity = 256
  private positions = new Float32Array(this.capacity * 3)
  private colors = new Uint8Array(this.capacity * 4)
  private uvs: Float32Array | null
  private indices = new Uint32Array((this.capacity / 4) * 6)
  private vertexCount = 0
  private indexCount = 0

  constructor(withUvs: boolean) {
    this.uvs = withUvs ? new Float32Array(this.capacity * 2) : null
  }

  get quadCount(): number {
    return this.indexCount / 6
  }

  /**
   * Adds a quad. `corners` holds 4 corners (12 numbers) offset by (ox, oy, oz);
   * `uv` 8 numbers when the builder has UVs. rgb are 0..1, alpha 0..255.
   */
  quad(
    corners: ArrayLike<number>, cornerOffset: number, ox: number, oy: number, oz: number,
    r: number, g: number, b: number, alpha: number,
    uv?: ArrayLike<number>, uvOffset = 0,
  ): void {
    this.reserve(4)
    const v = this.vertexCount
    for (let k = 0; k < 4; k++) {
      const p = (v + k) * 3
      this.positions[p] = corners[cornerOffset + k * 3]! + ox
      this.positions[p + 1] = corners[cornerOffset + k * 3 + 1]! + oy
      this.positions[p + 2] = corners[cornerOffset + k * 3 + 2]! + oz
      const c = (v + k) * 4
      this.colors[c] = Math.round(r * 255)
      this.colors[c + 1] = Math.round(g * 255)
      this.colors[c + 2] = Math.round(b * 255)
      this.colors[c + 3] = alpha
      if (this.uvs && uv) {
        this.uvs[(v + k) * 2] = uv[uvOffset + k * 2]!
        this.uvs[(v + k) * 2 + 1] = uv[uvOffset + k * 2 + 1]!
      }
    }
    const i = this.indexCount
    this.indices[i] = v
    this.indices[i + 1] = v + 1
    this.indices[i + 2] = v + 2
    this.indices[i + 3] = v
    this.indices[i + 4] = v + 2
    this.indices[i + 5] = v + 3
    this.vertexCount += 4
    this.indexCount += 6
  }

  /** Trimmed copies of the buffers, or null when no quad was added. */
  finish(): MeshData | null {
    if (this.indexCount === 0) return null
    return {
      positions: this.positions.slice(0, this.vertexCount * 3),
      colors: this.colors.slice(0, this.vertexCount * 4),
      uvs: this.uvs ? this.uvs.slice(0, this.vertexCount * 2) : null,
      indices: this.indices.slice(0, this.indexCount),
    }
  }

  /** Grows every buffer together; quads are 4 vertices and 6 indices, so indices follow vertices. */
  private reserve(vertices: number): void {
    if (this.vertexCount + vertices <= this.capacity) return
    this.capacity *= 2
    this.positions = grow(this.positions, this.capacity * 3)
    this.colors = grow(this.colors, this.capacity * 4)
    if (this.uvs) this.uvs = grow(this.uvs, this.capacity * 2)
    this.indices = grow(this.indices, (this.capacity / 4) * 6)
  }
}

function grow<T extends Float32Array | Uint8Array | Uint32Array>(a: T, length: number): T {
  const out = new (a.constructor as new (n: number) => T)(length)
  out.set(a)
  return out
}
