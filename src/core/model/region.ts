import type { NbtCompound } from 'deepslate/nbt'
import type { BlockArray } from '../litematic/bits'
import type { BlockState } from './blockState'

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface Region {
  name: string
  /** Minimum corner, in schematic coordinates. */
  position: Vec3
  /** Always positive on every axis. */
  size: Vec3
  palette: BlockState[]
  /** Palette indices, `index = y*sizeX*sizeZ + z*sizeX + x`. */
  blocks: BlockArray
  /** Block entity tags keyed by block index; tags keep their own x/y/z. */
  tileEntities: Map<number, NbtCompound>
  /** Block entity tags whose x/y/z fall outside the region; written back untouched. */
  strayTileEntities: NbtCompound[]
  /** Every other region tag (Entities, PendingBlockTicks, unknown keys), verbatim. */
  extra: NbtCompound
}

export function volumeOf(size: Vec3): number {
  return size.x * size.y * size.z
}

export function blockIndex(size: Vec3, x: number, y: number, z: number): number {
  return y * size.x * size.z + z * size.x + x
}

export function createBlockArray(volume: number, paletteSize: number): BlockArray {
  return paletteSize > 65536 ? new Uint32Array(volume) : new Uint16Array(volume)
}

export function blockAt(region: Region, x: number, y: number, z: number): BlockState {
  const state = region.palette[region.blocks[blockIndex(region.size, x, y, z)]!]
  if (!state) throw new RangeError(`no palette entry at ${x},${y},${z}`)
  return state
}
