import type { NbtCompound } from 'deepslate/nbt'
import type { Region, Schematic, Vec3 } from '../model'
import { blockStateKey } from '../model'
import { readLitematic } from './read'
import { encodeLitematic, prepareForWrite } from './write'

export class RoundTripError extends Error {
  readonly differences: string[]

  constructor(differences: string[]) {
    super(`Saved file does not match the schematic: ${differences.slice(0, 3).join('; ')}`)
    this.name = 'RoundTripError'
    this.differences = differences
  }
}

/**
 * Prepare, encode, re-read and compare. Throws RoundTripError instead of
 * returning bytes that would not load back as the same schematic.
 */
export function saveLitematic(
  schematic: Schematic,
  now: number = Date.now(),
  encode: (s: Schematic) => Uint8Array = encodeLitematic,
): { bytes: Uint8Array; saved: Schematic } {
  const saved = prepareForWrite(schematic, now)
  const bytes = encode(saved)
  let reread: Schematic
  try {
    reread = readLitematic(bytes)
  } catch (e) {
    throw new RoundTripError([`re-read failed: ${e instanceof Error ? e.message : String(e)}`])
  }
  const differences = diffSchematics(saved, reread)
  if (differences.length > 0) throw new RoundTripError(differences)
  return { bytes, saved }
}

/** Human-readable differences between two models; empty when equivalent. */
export function diffSchematics(a: Schematic, b: Schematic): string[] {
  const out: string[] = []
  const same = (label: string, x: unknown, y: unknown) => {
    if (x !== y) out.push(`${label}: ${String(x)} ≠ ${String(y)}`)
  }
  same('Version', a.version, b.version)
  same('SubVersion', a.subVersion, b.subVersion)
  same('MinecraftDataVersion', a.dataVersion, b.dataVersion)

  const ma = a.metadata, mb = b.metadata
  for (const k of ['name', 'author', 'description', 'timeCreated', 'timeModified', 'regionCount', 'totalBlocks', 'totalVolume'] as const) {
    same(`metadata.${k}`, ma[k], mb[k])
  }
  sameVec(out, 'metadata.enclosingSize', ma.enclosingSize, mb.enclosingSize)
  if (!sameInts(ma.previewImage, mb.previewImage)) out.push('metadata.previewImage differs')
  sameTag(out, 'metadata extra tags', ma.extra, mb.extra)
  sameTag(out, 'root extra tags', a.extra, b.extra)

  same('region count', a.regions.length, b.regions.length)
  a.regions.forEach((ra, i) => {
    const rb = b.regions[i]
    if (rb) diffRegion(out, ra, rb)
  })
  return out
}

function diffRegion(out: string[], a: Region, b: Region): void {
  const p = `region "${a.name}"`
  if (a.name !== b.name) out.push(`${p}: name ≠ "${b.name}"`)
  sameVec(out, `${p} position`, a.position, b.position)
  sameVec(out, `${p} size`, a.size, b.size)
  if (a.blocks.length !== b.blocks.length) {
    out.push(`${p}: block count ${a.blocks.length} ≠ ${b.blocks.length}`)
  } else {
    // Compare by block state key, via shared integer ids, so palettes may differ in order.
    const ids = new Map<string, number>()
    const idOf = (key: string) => ids.get(key) ?? (ids.set(key, ids.size), ids.size - 1)
    const idsA = Int32Array.from(a.palette, (s) => idOf(blockStateKey(s)))
    const idsB = Int32Array.from(b.palette, (s) => idOf(blockStateKey(s)))
    let mismatches = 0
    for (let i = 0; i < a.blocks.length; i++) if (idsA[a.blocks[i]!] !== idsB[b.blocks[i]!]) mismatches++
    if (mismatches > 0) out.push(`${p}: ${mismatches} blocks differ`)
  }
  if (a.tileEntities.size !== b.tileEntities.size) {
    out.push(`${p}: ${a.tileEntities.size} tile entities ≠ ${b.tileEntities.size}`)
  }
  for (const [index, te] of a.tileEntities) {
    const other = b.tileEntities.get(index)
    if (!other || !te.equals(other)) out.push(`${p}: tile entity at index ${index} differs`)
  }
  if (a.strayTileEntities.length !== b.strayTileEntities.length ||
      a.strayTileEntities.some((te, i) => !te.equals(b.strayTileEntities[i]!))) {
    out.push(`${p}: stray tile entities differ`)
  }
  sameTag(out, `${p} extra tags`, a.extra, b.extra)
}

function sameVec(out: string[], label: string, a: Vec3, b: Vec3): void {
  if (a.x !== b.x || a.y !== b.y || a.z !== b.z) out.push(`${label}: ${a.x},${a.y},${a.z} ≠ ${b.x},${b.y},${b.z}`)
}

function sameInts(a: Int32Array | undefined, b: Int32Array | undefined): boolean {
  if (!a || !b) return a === b
  return a.length === b.length && a.every((v, i) => v === b[i])
}

function sameTag(out: string[], label: string, a: NbtCompound, b: NbtCompound): void {
  if (!a.equals(b)) out.push(`${label} differ`)
}
