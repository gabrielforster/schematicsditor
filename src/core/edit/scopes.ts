import type { Region, Schematic, Vec3 } from '../model'

/** Axis-aligned box with inclusive corners. Corners may come in any order. */
export interface Box {
  min: Vec3
  max: Vec3
}

/**
 * Where an edit or material count applies (spec §9.1, §10). Coordinates are
 * schematic coordinates (region.position + local). A scope list combines by
 * intersection; the empty list means the whole schematic.
 */
export type Scope =
  | { kind: 'whole' }
  | { kind: 'regions'; regionIds: readonly number[] }
  /** Inclusive Y range, e.g. the layer slider's visible range. */
  | { kind: 'yRange'; minY: number; maxY: number }
  | { kind: 'box'; box: Box }

/** A scope resolved against one region, in region-local inclusive coordinates. */
export interface RegionScope {
  /** Index into `schematic.regions`. */
  regionId: number
  min: Vec3
  max: Vec3
  /** True when the scope covers the entire region (enables palette-only edits). */
  whole: boolean
}

const AXES = ['x', 'y', 'z'] as const

/** One RegionScope per region the scopes touch; regions they miss are left out. */
export function resolveScopes(schematic: Schematic, scopes: readonly Scope[]): RegionScope[] {
  const out: RegionScope[] = []
  schematic.regions.forEach((region, regionId) => {
    const min: Vec3 = { x: 0, y: 0, z: 0 }
    const max: Vec3 = { x: region.size.x - 1, y: region.size.y - 1, z: region.size.z - 1 }
    const clip = (axis: 'x' | 'y' | 'z', lo: number, hi: number) => {
      const a = Math.min(lo, hi) - region.position[axis]
      const b = Math.max(lo, hi) - region.position[axis]
      min[axis] = Math.max(min[axis], a)
      max[axis] = Math.min(max[axis], b)
    }
    for (const scope of scopes) {
      switch (scope.kind) {
        case 'whole':
          break
        case 'regions':
          if (!scope.regionIds.includes(regionId)) return
          break
        case 'yRange':
          clip('y', scope.minY, scope.maxY)
          break
        case 'box':
          for (const axis of AXES) clip(axis, scope.box.min[axis], scope.box.max[axis])
          break
      }
    }
    if (AXES.some((axis) => min[axis] > max[axis])) return
    const whole = AXES.every((axis) => min[axis] === 0 && max[axis] === region.size[axis] - 1)
    out.push({ regionId, min, max, whole })
  })
  return out
}

/** Calls `fn` with every block index inside `scope`, in Litematica index order. */
export function forEachIndexInScope(size: Vec3, scope: RegionScope, fn: (index: number) => void): void {
  const { min, max } = scope
  const layer = size.x * size.z
  for (let y = min.y; y <= max.y; y++) {
    for (let z = min.z; z <= max.z; z++) {
      const row = y * layer + z * size.x
      for (let x = min.x; x <= max.x; x++) fn(row + x)
    }
  }
}

/** True when a region-local block index lies inside `scope`. */
export function indexInScope(size: Vec3, scope: RegionScope, index: number): boolean {
  const x = index % size.x
  const z = Math.floor(index / size.x) % size.z
  const y = Math.floor(index / (size.x * size.z))
  const { min, max } = scope
  return x >= min.x && x <= max.x && y >= min.y && y <= max.y && z >= min.z && z <= max.z
}

/** Number of blocks per palette slot inside `scope`. */
export function paletteCounts(region: Region, scope: RegionScope): Uint32Array {
  const counts = new Uint32Array(region.palette.length)
  const { blocks } = region
  if (scope.whole) {
    for (let i = 0; i < blocks.length; i++) counts[blocks[i]!]!++
  } else {
    forEachIndexInScope(region.size, scope, (i) => { counts[blocks[i]!]!++ })
  }
  return counts
}
