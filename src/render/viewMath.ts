import type { Schematic, Vec3 } from '../core/model'
import { volumeOf } from '../core/model'

/** World-space box: `min` inclusive, `max` exclusive (block faces). */
export interface Bounds {
  min: Vec3
  max: Vec3
}

/** Region volume above which colored mode is suggested (spec §8.4). */
export const COLORED_SUGGESTION_VOLUME = 5_000_000

/** True when any region is large enough that colored mode should be suggested, not forced. */
export function shouldSuggestColored(schematic: Schematic): boolean {
  return schematic.regions.some((r) => volumeOf(r.size) > COLORED_SUGGESTION_VOLUME)
}

/** Box around every region not in `hidden`, or null when none is left. */
export function schematicBounds(schematic: Schematic, hidden: ReadonlySet<number> = new Set()): Bounds | null {
  let out: Bounds | null = null
  schematic.regions.forEach((r, i) => {
    if (hidden.has(i)) return
    const max = { x: r.position.x + r.size.x, y: r.position.y + r.size.y, z: r.position.z + r.size.z }
    out = out
      ? {
          min: { x: Math.min(out.min.x, r.position.x), y: Math.min(out.min.y, r.position.y), z: Math.min(out.min.z, r.position.z) },
          max: { x: Math.max(out.max.x, max.x), y: Math.max(out.max.y, max.y), z: Math.max(out.max.z, max.z) },
        }
      : { min: { ...r.position }, max }
  })
  return out
}

export interface CameraFit {
  target: Vec3
  position: Vec3
  near: number
  far: number
}

/** Viewing direction for fit-to-view: from above, south-east of the target. */
const FIT_DIRECTION = (() => {
  const d = { x: 1, y: 0.8, z: 1 }
  const len = Math.hypot(d.x, d.y, d.z)
  return { x: d.x / len, y: d.y / len, z: d.z / len }
})()

/**
 * Camera placement that shows the whole box (spec §8.6 fit-to-view): the
 * box's bounding sphere fits the narrower of the vertical and horizontal
 * fields of view.
 */
export function fitView(bounds: Bounds, fovDegrees: number, aspect: number): CameraFit {
  const target = {
    x: (bounds.min.x + bounds.max.x) / 2,
    y: (bounds.min.y + bounds.max.y) / 2,
    z: (bounds.min.z + bounds.max.z) / 2,
  }
  const radius = Math.max(1, Math.hypot(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y, bounds.max.z - bounds.min.z) / 2)
  const vHalf = (fovDegrees * Math.PI) / 360
  const hHalf = Math.atan(Math.tan(vHalf) * aspect)
  const distance = radius / Math.sin(Math.min(vHalf, hHalf))
  return {
    target,
    position: {
      x: target.x + FIT_DIRECTION.x * distance,
      y: target.y + FIT_DIRECTION.y * distance,
      z: target.z + FIT_DIRECTION.z * distance,
    },
    near: Math.max(0.05, (distance - radius) / 100),
    far: (distance + radius) * 4,
  }
}

/** Bounds of the near plane (blocks) and the smallest far plane. */
const MIN_NEAR = 0.05
const MAX_NEAR = 100
const MIN_FAR = 100

/**
 * Camera clip planes for the current camera position (recomputed every
 * frame, so zooming in, flying and zooming out never clip the schematic):
 * near is 1% of the distance to the box (0.05 inside it), far reaches 10%
 * past the box's farthest corner.
 */
export function clipPlanes(camera: Vec3, bounds: Bounds): { near: number; far: number } {
  const gap = (v: number, lo: number, hi: number) => Math.max(lo - v, 0, v - hi)
  const toBox = Math.hypot(
    gap(camera.x, bounds.min.x, bounds.max.x),
    gap(camera.y, bounds.min.y, bounds.max.y),
    gap(camera.z, bounds.min.z, bounds.max.z),
  )
  const reach = (v: number, lo: number, hi: number) => Math.max(Math.abs(v - lo), Math.abs(v - hi))
  const farthest = Math.hypot(
    reach(camera.x, bounds.min.x, bounds.max.x),
    reach(camera.y, bounds.min.y, bounds.max.y),
    reach(camera.z, bounds.min.z, bounds.max.z),
  )
  return {
    near: Math.min(MAX_NEAR, Math.max(MIN_NEAR, toBox * 0.01)),
    far: Math.max(MIN_FAR, farthest * 1.1),
  }
}

export interface FlyKeys {
  forward: boolean
  back: boolean
  left: boolean
  right: boolean
  up: boolean
  down: boolean
}

/**
 * Fly-mode movement for one frame (spec §8.6 optional WASD fly): W/S along
 * the view direction, A/D sideways, Space/Shift along world Y.
 */
export function flyDelta(keys: FlyKeys, forward: Vec3, speed: number, seconds: number): Vec3 {
  const len = Math.hypot(forward.x, forward.y, forward.z) || 1
  const f = { x: forward.x / len, y: forward.y / len, z: forward.z / len }
  // right = forward × up(0, 1, 0)
  const rl = Math.hypot(f.z, f.x) || 1
  const r = { x: -f.z / rl, y: 0, z: f.x / rl }
  const k = (a: boolean, b: boolean) => (a ? 1 : 0) - (b ? 1 : 0)
  const fw = k(keys.forward, keys.back)
  const rt = k(keys.right, keys.left)
  const up = k(keys.up, keys.down)
  const s = speed * seconds
  return { x: (f.x * fw + r.x * rt) * s, y: (f.y * fw + up) * s, z: (f.z * fw + r.z * rt) * s }
}
