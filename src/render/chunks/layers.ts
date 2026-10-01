import { CHUNK_SIZE } from '../../core/edit/events'
import type { Region, Schematic } from '../../core/model'
import type { LocalYRange } from './extract'

/**
 * Visible layers (spec §8.5): inclusive Y range in schematic coordinates,
 * the same frame as Plan 2's `{ kind: 'yRange' }` scope. minY === maxY is
 * single-layer mode.
 */
export interface LayerRange {
  minY: number
  maxY: number
}

/** Lowest and highest block Y over all regions, or null without regions. */
export function schematicYBounds(schematic: Schematic): LayerRange | null {
  if (schematic.regions.length === 0) return null
  let minY = Infinity, maxY = -Infinity
  for (const r of schematic.regions) {
    minY = Math.min(minY, r.position.y)
    maxY = Math.max(maxY, r.position.y + r.size.y - 1)
  }
  return { minY, maxY }
}

/** Orders the ends and clamps them into `bounds`. */
export function clampLayerRange(range: LayerRange, bounds: LayerRange): LayerRange {
  const lo = Math.min(range.minY, range.maxY)
  const hi = Math.max(range.minY, range.maxY)
  const minY = Math.min(Math.max(lo, bounds.minY), bounds.maxY)
  const maxY = Math.min(Math.max(hi, bounds.minY), bounds.maxY)
  return { minY, maxY }
}

/** Moves the range up (delta > 0) or down by whole layers, keeping its height, stopping at the bounds (↑/↓ keys). */
export function stepLayerRange(range: LayerRange, delta: number, bounds: LayerRange): LayerRange {
  const height = range.maxY - range.minY
  let minY = range.minY + delta
  minY = Math.max(bounds.minY, Math.min(minY, bounds.maxY - height))
  return { minY, maxY: minY + height }
}

/** In single-layer mode, the layer below, drawn faded (spec §8.5); otherwise null. */
export function ghostLayer(range: LayerRange | null): LayerRange | null {
  if (!range || range.minY !== range.maxY) return null
  return { minY: range.minY - 1, maxY: range.minY - 1 }
}

/**
 * A layer range in one region's local coordinates. Null means every layer.
 * A range that misses the region comes back with min > max.
 */
export function toLocalRange(range: LayerRange | null, region: Region): LocalYRange | null {
  if (!range) return null
  return { min: range.minY - region.position.y, max: range.maxY - region.position.y }
}

/**
 * What a chunk row's mesh depends on: the visible part of its own layers
 * plus the border layer on each side, or 'empty' when none of its own
 * layers are visible.
 */
export function rowSignature(range: LocalYRange | null, cy: number, sizeY: number): string {
  const lo = Math.max(0, range?.min ?? 0)
  const hi = Math.min(sizeY - 1, range?.max ?? sizeY - 1)
  const y0 = cy * CHUNK_SIZE
  const y1 = Math.min(sizeY - 1, y0 + CHUNK_SIZE - 1)
  if (hi < y0 || lo > y1 || lo > hi) return 'empty'
  return `${Math.max(lo, y0 - 1)},${Math.min(hi, y1 + 1)}`
}

/** Chunk rows whose meshes change when the visible range goes from `before` to `after` (spec §8.5). */
export function rowsToRemesh(before: LocalYRange | null, after: LocalYRange | null, sizeY: number): number[] {
  const rows: number[] = []
  const n = Math.ceil(sizeY / CHUNK_SIZE)
  for (let cy = 0; cy < n; cy++) {
    if (rowSignature(before, cy, sizeY) !== rowSignature(after, cy, sizeY)) rows.push(cy)
  }
  return rows
}
