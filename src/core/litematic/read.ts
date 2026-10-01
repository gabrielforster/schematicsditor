import { NbtCompound, NbtLongArray } from 'deepslate/nbt'
import type { BlockState, Metadata, Region, Schematic, Vec3 } from '../model'
import { blockIndex, createBlockArray, volumeOf } from '../model'
import { NbtReadError, longArrayToWords, readNbt } from '../nbt'
import { bitsForPalette, unpackBits } from './bits'
import { LitematicError } from './errors'

/** DataVersion of Minecraft 1.13 (the flattening). */
export const MIN_DATA_VERSION = 1519

const ROOT_KEYS = new Set(['Version', 'SubVersion', 'MinecraftDataVersion', 'Metadata', 'Regions'])
const METADATA_KEYS = new Set([
  'Name', 'Author', 'Description', 'TimeCreated', 'TimeModified',
  'RegionCount', 'TotalBlocks', 'TotalVolume', 'EnclosingSize', 'PreviewImageData',
])
const REGION_KEYS = new Set(['Position', 'Size', 'BlockStatePalette', 'BlockStates', 'TileEntities'])

export function readLitematic(bytes: Uint8Array): Schematic {
  let root: NbtCompound
  try {
    root = readNbt(bytes)
  } catch (cause) {
    if (cause instanceof NbtReadError) {
      throw new LitematicError('not-nbt', 'This file is not a valid NBT file.', { cause })
    }
    throw cause
  }
  return decodeLitematic(root)
}

export function decodeLitematic(root: NbtCompound): Schematic {
  if (!root.hasCompound('Regions') || root.getCompound('Regions').size === 0) {
    throw new LitematicError('no-regions', 'This file has no Regions; it is not a Litematica schematic.')
  }
  if (!root.hasNumber('Version')) {
    throw new LitematicError('corrupt', 'This file has no schematic Version; it is not a valid Litematica schematic.')
  }
  if (!root.hasNumber('MinecraftDataVersion') || root.getNumber('MinecraftDataVersion') < MIN_DATA_VERSION) {
    throw new LitematicError(
      'unsupported-version',
      'This schematic was made for a Minecraft version before 1.13, which is not supported.',
    )
  }
  const regionsTag = root.getCompound('Regions')
  const regions = [...regionsTag.keys()].map((name) => decodeRegion(name, regionsTag.getCompound(name)))
  return {
    version: root.getNumber('Version'),
    ...(root.hasNumber('SubVersion') ? { subVersion: root.getNumber('SubVersion') } : {}),
    dataVersion: root.getNumber('MinecraftDataVersion'),
    metadata: decodeMetadata(root.getCompound('Metadata')),
    regions,
    extra: pickUnknown(root, ROOT_KEYS),
  }
}

function decodeMetadata(tag: NbtCompound): Metadata {
  return {
    name: tag.getString('Name'),
    author: tag.getString('Author'),
    description: tag.getString('Description'),
    timeCreated: tag.getNumber('TimeCreated'),
    timeModified: tag.getNumber('TimeModified'),
    regionCount: tag.getNumber('RegionCount'),
    totalBlocks: tag.getNumber('TotalBlocks'),
    totalVolume: tag.getNumber('TotalVolume'),
    enclosingSize: decodeVec(tag.getCompound('EnclosingSize')),
    ...(tag.has('PreviewImageData')
      ? { previewImage: Int32Array.from(tag.getIntArray('PreviewImageData').getItems(), (i) => i.getAsNumber()) }
      : {}),
    extra: pickUnknown(tag, METADATA_KEYS),
  }
}

function decodeRegion(name: string, tag: NbtCompound): Region {
  const rawPos = decodeVec(tag.getCompound('Position'))
  const rawSize = decodeVec(tag.getCompound('Size'))
  if (rawSize.x === 0 || rawSize.y === 0 || rawSize.z === 0) {
    throw new LitematicError('corrupt', `Region "${name}" has a zero size.`)
  }
  const { position, size } = normalizeBox(rawPos, rawSize)

  const palette = tag.getList('BlockStatePalette', 10).map(decodeBlockState)
  if (palette.length === 0) {
    throw new LitematicError('corrupt', `Region "${name}" has an empty block palette.`)
  }

  const volume = volumeOf(size)
  const blocks = createBlockArray(volume, palette.length)
  const packed = tag.get('BlockStates')
  try {
    if (!(packed instanceof NbtLongArray)) throw new RangeError('BlockStates is missing')
    unpackBits(longArrayToWords(packed), volume, bitsForPalette(palette.length), blocks)
  } catch (cause) {
    throw new LitematicError('corrupt', `Region "${name}" has truncated block data.`, { cause })
  }
  for (let i = 0; i < volume; i++) {
    if (blocks[i]! >= palette.length) {
      throw new LitematicError('corrupt', `Region "${name}" references a block outside its palette.`)
    }
  }

  const tileEntities = new Map<number, NbtCompound>()
  const strayTileEntities: NbtCompound[] = []
  for (const te of tag.getList('TileEntities', 10).getItems()) {
    const x = te.getNumber('x'), y = te.getNumber('y'), z = te.getNumber('z')
    const inBounds = x >= 0 && y >= 0 && z >= 0 && x < size.x && y < size.y && z < size.z
    const index = blockIndex(size, x, y, z)
    if (inBounds && !tileEntities.has(index)) tileEntities.set(index, te)
    else strayTileEntities.push(te)
  }

  return {
    name,
    position,
    size,
    fileBox: { position: rawPos, size: rawSize },
    palette,
    blocks,
    tileEntities,
    strayTileEntities,
    extra: pickUnknown(tag, REGION_KEYS),
  }
}

/** Litematica sizes may be negative; convert to a min corner plus positive size. */
export function normalizeBox(position: Vec3, size: Vec3): { position: Vec3; size: Vec3 } {
  const axis = (p: number, s: number): [number, number] => (s < 0 ? [p + s + 1, -s] : [p, s])
  const [px, sx] = axis(position.x, size.x)
  const [py, sy] = axis(position.y, size.y)
  const [pz, sz] = axis(position.z, size.z)
  return { position: { x: px, y: py, z: pz }, size: { x: sx, y: sy, z: sz } }
}

function decodeBlockState(entry: NbtCompound): BlockState {
  const properties: Record<string, string> = {}
  if (entry.hasCompound('Properties')) {
    entry.getCompound('Properties').forEach((k, v) => {
      properties[k] = v.getAsString()
    })
  }
  return { name: entry.getString('Name'), properties }
}

function decodeVec(tag: NbtCompound): Vec3 {
  return { x: tag.getNumber('x'), y: tag.getNumber('y'), z: tag.getNumber('z') }
}

function pickUnknown(tag: NbtCompound, known: Set<string>): NbtCompound {
  const extra = new NbtCompound()
  tag.forEach((k, v) => {
    if (!known.has(k)) extra.set(k, v)
  })
  return extra
}
