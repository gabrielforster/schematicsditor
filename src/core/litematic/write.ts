import { NbtCompound, NbtInt, NbtIntArray, NbtList, NbtLong, NbtString } from 'deepslate/nbt'
import type { BlockState, Metadata, Region, Schematic, Vec3 } from '../model'
import { AIR, blockStateKey, createBlockArray, isAir, volumeOf } from '../model'
import { wordsToLongArray, writeNbt } from '../nbt'
import { bitsForPalette, packBits } from './bits'
import { normalizeBox } from './read'

/**
 * Drop unused palette entries, merge entries with equal keys, and put
 * minecraft:air at index 0 (Litematica's container default).
 */
export function compactRegion(region: Region): Region {
  const used = new Uint8Array(region.palette.length)
  for (let i = 0; i < region.blocks.length; i++) used[region.blocks[i]!] = 1

  const palette: BlockState[] = [AIR]
  const byKey = new Map<string, number>([[blockStateKey(AIR), 0]])
  const remap = new Uint32Array(region.palette.length)
  region.palette.forEach((state, oldIndex) => {
    if (!used[oldIndex]) return
    const key = blockStateKey(state)
    let newIndex = byKey.get(key)
    if (newIndex === undefined) {
      newIndex = palette.length
      palette.push(state)
      byKey.set(key, newIndex)
    }
    remap[oldIndex] = newIndex
  })

  const blocks = createBlockArray(region.blocks.length, palette.length)
  for (let i = 0; i < blocks.length; i++) blocks[i] = remap[region.blocks[i]!]!
  return { ...region, palette, blocks }
}

export function recomputeMetadata(schematic: Schematic, now: number): Metadata {
  let totalBlocks = 0
  let totalVolume = 0
  const min: Vec3 = { x: Infinity, y: Infinity, z: Infinity }
  const max: Vec3 = { x: -Infinity, y: -Infinity, z: -Infinity }
  for (const region of schematic.regions) {
    const air = region.palette.map(isAir)
    for (let i = 0; i < region.blocks.length; i++) if (!air[region.blocks[i]!]) totalBlocks++
    totalVolume += volumeOf(region.size)
    for (const axis of ['x', 'y', 'z'] as const) {
      min[axis] = Math.min(min[axis], region.position[axis])
      max[axis] = Math.max(max[axis], region.position[axis] + region.size[axis])
    }
  }
  return {
    ...schematic.metadata,
    regionCount: schematic.regions.length,
    totalBlocks,
    totalVolume,
    // With no regions min/max stay ±Infinity; report an empty box, not NaN.
    enclosingSize: schematic.regions.length === 0
      ? { x: 0, y: 0, z: 0 }
      : { x: max.x - min.x, y: max.y - min.y, z: max.z - min.z },
    timeModified: now,
  }
}

/** The exact model that will be written: compacted regions and fresh metadata. */
export function prepareForWrite(schematic: Schematic, now: number): Schematic {
  const regions = schematic.regions.map(compactRegion)
  const compacted = { ...schematic, regions }
  return { ...compacted, metadata: recomputeMetadata(compacted, now) }
}

/** Encode a model as-is. Call prepareForWrite first; saveLitematic does both. */
export function encodeLitematic(schematic: Schematic): Uint8Array {
  const root = new NbtCompound().set('Version', new NbtInt(schematic.version))
  if (schematic.subVersion !== undefined) root.set('SubVersion', new NbtInt(schematic.subVersion))
  root
    .set('MinecraftDataVersion', new NbtInt(schematic.dataVersion))
    .set('Metadata', encodeMetadata(schematic.metadata))
  const regions = new NbtCompound()
  for (const region of schematic.regions) regions.set(region.name, encodeRegion(region))
  root.set('Regions', regions)
  schematic.extra.forEach((k, v) => root.set(k, v))
  return writeNbt(root)
}

function encodeMetadata(m: Metadata): NbtCompound {
  const tag = new NbtCompound()
    .set('Name', new NbtString(m.name))
    .set('Author', new NbtString(m.author))
    .set('Description', new NbtString(m.description))
    .set('RegionCount', new NbtInt(m.regionCount))
    .set('TimeCreated', new NbtLong(BigInt(m.timeCreated)))
    .set('TimeModified', new NbtLong(BigInt(m.timeModified)))
    .set('TotalBlocks', new NbtInt(m.totalBlocks))
    .set('TotalVolume', new NbtInt(m.totalVolume))
    .set('EnclosingSize', encodeVec(m.enclosingSize))
  if (m.previewImage) tag.set('PreviewImageData', new NbtIntArray(m.previewImage))
  m.extra.forEach((k, v) => tag.set(k, v))
  return tag
}

function encodeRegion(region: Region): NbtCompound {
  const palette = new NbtList(region.palette.map(encodeBlockState))
  const tileEntities = new NbtList([...region.tileEntities.values(), ...region.strayTileEntities])
  const { position, size } = fileBoxFor(region)
  const tag = new NbtCompound()
    .set('Position', encodeVec(position))
    .set('Size', encodeVec(size))
    .set('BlockStatePalette', palette)
    .set('BlockStates', wordsToLongArray(packBits(region.blocks, bitsForPalette(region.palette.length))))
    .set('TileEntities', tileEntities)
  region.extra.forEach((k, v) => tag.set(k, v))
  return tag
}

/**
 * The Position/Size to write: the file's original raw corner when it still
 * normalizes to this region's box (so entity positions, which Litematica
 * stores relative to the raw Position, keep pointing at the right blocks),
 * otherwise the normalized min-corner/positive-size form.
 */
function fileBoxFor(region: Region): { position: Vec3; size: Vec3 } {
  const { fileBox } = region
  if (!fileBox) return { position: region.position, size: region.size }
  const renormalized = normalizeBox(fileBox.position, fileBox.size)
  const matches = vecEquals(renormalized.position, region.position) && vecEquals(renormalized.size, region.size)
  return matches ? fileBox : { position: region.position, size: region.size }
}

function vecEquals(a: Vec3, b: Vec3): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z
}

function encodeBlockState(state: BlockState): NbtCompound {
  const entry = new NbtCompound().set('Name', new NbtString(state.name))
  const keys = Object.keys(state.properties).sort()
  if (keys.length > 0) {
    const props = new NbtCompound()
    for (const k of keys) props.set(k, new NbtString(state.properties[k]!))
    entry.set('Properties', props)
  }
  return entry
}

function encodeVec(v: Vec3): NbtCompound {
  return new NbtCompound().set('x', new NbtInt(v.x)).set('y', new NbtInt(v.y)).set('z', new NbtInt(v.z))
}
