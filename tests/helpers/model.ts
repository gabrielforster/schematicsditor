// Builds in-memory schematics for edit and material tests.
import { NbtCompound } from 'deepslate/nbt'
import type { Region, Schematic, Vec3 } from '../../src/core/model'
import { blockStateKey, parseBlockStateKey } from '../../src/core/model'

export interface TestRegion {
  name?: string
  position?: [number, number, number]
  size: [number, number, number]
  /** Block state keys, e.g. `minecraft:oak_stairs[facing=north]`. */
  palette: string[]
  /** Palette indices in Litematica order; defaults to all zeros. */
  blocks?: number[]
}

export function makeRegion(spec: TestRegion): Region {
  const [sx, sy, sz] = spec.size
  const [px, py, pz] = spec.position ?? [0, 0, 0]
  const volume = sx * sy * sz
  return {
    name: spec.name ?? 'r',
    position: { x: px, y: py, z: pz },
    size: { x: sx, y: sy, z: sz },
    palette: spec.palette.map((k) => parseBlockStateKey(k)),
    blocks: Uint16Array.from(spec.blocks ?? new Array<number>(volume).fill(0)),
    tileEntities: new Map(),
    strayTileEntities: [],
    extra: new NbtCompound(),
  }
}

export function makeSchematic(regions: TestRegion[]): Schematic {
  const zero: Vec3 = { x: 0, y: 0, z: 0 }
  return {
    version: 6,
    subVersion: 1,
    dataVersion: 3953,
    metadata: {
      name: 'test', author: 'tester', description: '',
      timeCreated: 0, timeModified: 0, regionCount: regions.length,
      totalBlocks: 0, totalVolume: 0, enclosingSize: zero, extra: new NbtCompound(),
    },
    regions: regions.map((r, i) => makeRegion({ name: `region${i}`, ...r })),
    extra: new NbtCompound(),
  }
}

/** Block state keys of a region, in index order. */
export function blockKeys(region: Region): string[] {
  return Array.from(region.blocks, (i) => blockStateKey(region.palette[i]!))
}
