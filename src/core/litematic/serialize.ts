// Schematics cross worker boundaries via structured clone, which strips class
// prototypes. NBT tags therefore travel as deepslate JSON. `serializeSchematic`
// also returns the block array buffers as a transfer list: the parse worker
// transfers them (no copy), while the save path ignores the list and copies,
// because the editor keeps using those arrays.
import { NbtCompound } from 'deepslate/nbt'
import type { BlockArray } from './bits'
import type { BlockState, Metadata, Region, Schematic, Vec3 } from '../model'

type TagJson = ReturnType<NbtCompound['toJson']>

export interface SerializedRegion {
  name: string
  position: Vec3
  size: Vec3
  fileBox?: { position: Vec3; size: Vec3 }
  palette: BlockState[]
  blocks: BlockArray
  tileEntities: [number, TagJson][]
  strayTileEntities: TagJson[]
  extra: TagJson
}

export interface SerializedSchematic {
  version: number
  subVersion?: number
  dataVersion: number
  metadata: Omit<Metadata, 'extra'> & { extra: TagJson }
  regions: SerializedRegion[]
  extra: TagJson
}

export function serializeSchematic(s: Schematic): { data: SerializedSchematic; transfer: ArrayBuffer[] } {
  const transfer: ArrayBuffer[] = []
  const regions = s.regions.map((r): SerializedRegion => {
    transfer.push(r.blocks.buffer as ArrayBuffer)
    return {
      name: r.name,
      position: r.position,
      size: r.size,
      ...(r.fileBox !== undefined ? { fileBox: r.fileBox } : {}),
      palette: r.palette,
      blocks: r.blocks,
      tileEntities: [...r.tileEntities].map(([i, te]) => [i, te.toJson()]),
      strayTileEntities: r.strayTileEntities.map((te) => te.toJson()),
      extra: r.extra.toJson(),
    }
  })
  const data: SerializedSchematic = {
    version: s.version,
    ...(s.subVersion !== undefined ? { subVersion: s.subVersion } : {}),
    dataVersion: s.dataVersion,
    metadata: { ...s.metadata, extra: s.metadata.extra.toJson() },
    regions,
    extra: s.extra.toJson(),
  }
  return { data, transfer }
}

export function deserializeSchematic(d: SerializedSchematic): Schematic {
  const regions = d.regions.map((r): Region => ({
    name: r.name,
    position: r.position,
    size: r.size,
    ...(r.fileBox !== undefined ? { fileBox: r.fileBox } : {}),
    palette: r.palette,
    blocks: r.blocks,
    tileEntities: new Map(r.tileEntities.map(([i, json]) => [i, NbtCompound.fromJson(json)])),
    strayTileEntities: r.strayTileEntities.map((json) => NbtCompound.fromJson(json)),
    extra: NbtCompound.fromJson(r.extra),
  }))
  return {
    version: d.version,
    ...(d.subVersion !== undefined ? { subVersion: d.subVersion } : {}),
    dataVersion: d.dataVersion,
    metadata: { ...d.metadata, extra: NbtCompound.fromJson(d.metadata.extra) },
    regions,
    extra: NbtCompound.fromJson(d.extra),
  }
}
