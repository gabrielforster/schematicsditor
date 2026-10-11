// Builds .litematic NBT trees directly with deepslate, independent of our
// writer, so reader tests don't depend on writer correctness.
import { NbtCompound, NbtInt, NbtIntArray, NbtList, NbtLong, NbtString, type NbtTag } from 'deepslate/nbt'
import { bitsForPalette, packBits } from '../../src/core/litematic/bits'
import { wordsToLongArray } from '../../src/core/nbt'

export interface RegionSpec {
  name?: string
  position?: [number, number, number]
  size: [number, number, number]
  /** Block state keys like `minecraft:oak_stairs[facing=north]`. */
  palette: string[]
  /** Palette indices in Litematica order. Defaults to all zeros. */
  blocks?: number[]
  tileEntities?: NbtCompound[]
  extra?: Record<string, NbtTag>
}

export interface LitematicSpec {
  dataVersion?: number | null
  version?: number | null
  subVersion?: number | null
  name?: string
  regions: RegionSpec[]
  metadataExtra?: Record<string, NbtTag>
  rootExtra?: Record<string, NbtTag>
  previewImage?: number[]
}

export function vec(x: number, y: number, z: number): NbtCompound {
  return new NbtCompound().set('x', new NbtInt(x)).set('y', new NbtInt(y)).set('z', new NbtInt(z))
}

function paletteEntry(key: string): NbtCompound {
  const open = key.indexOf('[')
  const entry = new NbtCompound().set('Name', new NbtString(open === -1 ? key : key.slice(0, open)))
  if (open !== -1) {
    const props = new NbtCompound()
    for (const pair of key.slice(open + 1, -1).split(',')) {
      const [k, v] = pair.split('=')
      props.set(k!, new NbtString(v!))
    }
    entry.set('Properties', props)
  }
  return entry
}

export function regionNbt(spec: RegionSpec): NbtCompound {
  const [sx, sy, sz] = spec.size
  const volume = Math.abs(sx * sy * sz)
  const blocks = Uint32Array.from(spec.blocks ?? new Array<number>(volume).fill(0))
  const region = new NbtCompound()
    .set('Position', vec(...(spec.position ?? [0, 0, 0])))
    .set('Size', vec(sx, sy, sz))
    .set('BlockStatePalette', new NbtList(spec.palette.map(paletteEntry)))
    .set('BlockStates', wordsToLongArray(packBits(blocks, bitsForPalette(spec.palette.length))))
    .set('TileEntities', new NbtList(spec.tileEntities ?? []))
    .set('Entities', new NbtList([]))
    .set('PendingBlockTicks', new NbtList([]))
    .set('PendingFluidTicks', new NbtList([]))
  for (const [k, v] of Object.entries(spec.extra ?? {})) region.set(k, v)
  return region
}

export function litematicNbt(spec: LitematicSpec): NbtCompound {
  const regions = new NbtCompound()
  spec.regions.forEach((r, i) => regions.set(r.name ?? `region${i}`, regionNbt(r)))
  const metadata = new NbtCompound()
    .set('Name', new NbtString(spec.name ?? 'Test'))
    .set('Author', new NbtString('tester'))
    .set('Description', new NbtString(''))
    .set('RegionCount', new NbtInt(spec.regions.length))
    .set('TimeCreated', new NbtLong(1700000000000n))
    .set('TimeModified', new NbtLong(1700000001000n))
    .set('TotalBlocks', new NbtInt(0))
    .set('TotalVolume', new NbtInt(0))
    .set('EnclosingSize', vec(1, 1, 1))
  if (spec.previewImage) metadata.set('PreviewImageData', new NbtIntArray(spec.previewImage))
  for (const [k, v] of Object.entries(spec.metadataExtra ?? {})) metadata.set(k, v)
  const root = new NbtCompound()
  if (spec.version !== null) root.set('Version', new NbtInt(spec.version ?? 6))
  if (spec.subVersion !== null) root.set('SubVersion', new NbtInt(spec.subVersion ?? 1))
  if (spec.dataVersion !== null) root.set('MinecraftDataVersion', new NbtInt(spec.dataVersion ?? 3953))
  root.set('Metadata', metadata).set('Regions', regions)
  for (const [k, v] of Object.entries(spec.rootExtra ?? {})) root.set(k, v)
  return root
}

export function tileEntity(id: string, x: number, y: number, z: number): NbtCompound {
  return new NbtCompound()
    .set('id', new NbtString(id))
    .set('x', new NbtInt(x)).set('y', new NbtInt(y)).set('z', new NbtInt(z))
}
