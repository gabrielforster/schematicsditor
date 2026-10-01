import type { Vec3 } from '../../core/model'

export interface Ray {
  origin: Vec3
  /** Need not be normalized; `t` values are in units of its length. */
  dir: Vec3
}

export interface GridHit {
  x: number
  y: number
  z: number
  /** Outward normal of the face the ray entered through. */
  normal: Vec3
  /** Ray parameter at the entry point. */
  t: number
}

const AXES = ['x', 'y', 'z'] as const

/**
 * Voxel DDA (Amanatides & Woo) through a grid of unit cells spanning
 * [0, size) on each axis (spec §8.6: picking against the model grid, not
 * the meshes). Returns the first cell with `solid(x, y, z)`, or null.
 */
export function raycastGrid(ray: Ray, size: Vec3, maxT: number, solid: (x: number, y: number, z: number) => boolean): GridHit | null {
  // Clip the ray to the grid box (slab method), remembering the entry axis.
  let tEnter = 0
  let tExit = maxT
  let enterAxis = -1
  for (let a = 0; a < 3; a++) {
    const axis = AXES[a]!
    const o = ray.origin[axis]
    const d = ray.dir[axis]
    if (d === 0) {
      if (o < 0 || o >= size[axis]) return null
      continue
    }
    let t0 = (0 - o) / d
    let t1 = (size[axis] - o) / d
    if (t0 > t1) [t0, t1] = [t1, t0]
    if (t0 > tEnter) {
      tEnter = t0
      enterAxis = a
    }
    tExit = Math.min(tExit, t1)
  }
  if (tEnter > tExit) return null

  const p = AXES.map((axis) => ray.origin[axis] + ray.dir[axis] * tEnter)
  const cell = AXES.map((axis, a) => Math.min(size[axis] - 1, Math.max(0, Math.floor(p[a]!))))
  const step = AXES.map((axis) => Math.sign(ray.dir[axis]))
  const tDelta = AXES.map((axis) => (ray.dir[axis] === 0 ? Infinity : Math.abs(1 / ray.dir[axis])))
  const tMax = AXES.map((axis, a) => {
    const d = ray.dir[axis]
    if (d === 0) return Infinity
    const boundary = cell[a]! + (d > 0 ? 1 : 0)
    return tEnter + (boundary - p[a]!) / d
  })
  let t = tEnter
  let axis = enterAxis
  for (;;) {
    if (solid(cell[0]!, cell[1]!, cell[2]!)) {
      const normal = { x: 0, y: 0, z: 0 }
      if (axis >= 0) normal[AXES[axis]!] = -step[axis]!
      return { x: cell[0]!, y: cell[1]!, z: cell[2]!, normal, t }
    }
    axis = tMax[0]! < tMax[1]! ? (tMax[0]! < tMax[2]! ? 0 : 2) : tMax[1]! < tMax[2]! ? 1 : 2
    t = tMax[axis]!
    if (t > tExit) return null
    cell[axis]! += step[axis]!
    if (cell[axis]! < 0 || cell[axis]! >= size[AXES[axis]!]) return null
    tMax[axis]! += tDelta[axis]!
  }
}
