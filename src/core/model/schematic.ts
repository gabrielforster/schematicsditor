import type { NbtCompound } from 'deepslate/nbt'
import type { Region, Vec3 } from './region'

export interface Metadata {
  name: string
  author: string
  description: string
  /** Milliseconds since the Unix epoch. */
  timeCreated: number
  timeModified: number
  regionCount: number
  totalBlocks: number
  totalVolume: number
  enclosingSize: Vec3
  previewImage?: Int32Array
  /** Unknown Metadata tags, verbatim. */
  extra: NbtCompound
}

export interface Schematic {
  version: number
  subVersion?: number
  dataVersion: number
  metadata: Metadata
  regions: Region[]
  /** Unknown root tags, verbatim. */
  extra: NbtCompound
}
