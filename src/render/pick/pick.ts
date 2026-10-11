import { blockIndex, blockStateKey, isAir, type Schematic, type Vec3 } from '../../core/model'
import type { LayerRange } from '../chunks/layers'
import { raycastGrid, type Ray } from './dda'

/** The block under the cursor (spec §8.6 hover info). */
export interface PickHit {
  regionId: number
  regionName: string
  /** Region-local block coordinates. */
  local: Vec3
  /** Schematic (world) block coordinates. */
  world: Vec3
  /** Outward normal of the face that was hit. */
  normal: Vec3
  /** Canonical block state key, e.g. `minecraft:oak_stairs[facing=north,half=bottom]`. */
  state: string
  /** Distance along the ray, in units of the ray direction's length. */
  distance: number
}

export interface PickOptions {
  /** Region ids that are hidden and must not be hit. */
  hidden?: ReadonlySet<number>
  /** Only blocks inside the visible layers can be hit. */
  layers?: LayerRange | null
  maxDistance?: number
}

/** First non-air block along the ray over every visible region, honoring the layer range. */
export function pickBlock(schematic: Schematic, ray: Ray, options: PickOptions = {}): PickHit | null {
  let best: PickHit | null = null
  schematic.regions.forEach((region, regionId) => {
    if (options.hidden?.has(regionId)) return
    const { position: pos, size, palette, blocks } = region
    const local: Ray = { origin: { x: ray.origin.x - pos.x, y: ray.origin.y - pos.y, z: ray.origin.z - pos.z }, dir: ray.dir }
    const minY = options.layers ? options.layers.minY - pos.y : -Infinity
    const maxY = options.layers ? options.layers.maxY - pos.y : Infinity
    const hit = raycastGrid(local, size, options.maxDistance ?? 1e6, (x, y, z) => {
      if (y < minY || y > maxY) return false
      const state = palette[blocks[blockIndex(size, x, y, z)]!]
      return state !== undefined && !isAir(state)
    })
    if (!hit || (best && best.distance <= hit.t)) return
    const state = palette[blocks[blockIndex(size, hit.x, hit.y, hit.z)]!]!
    best = {
      regionId,
      regionName: region.name,
      local: { x: hit.x, y: hit.y, z: hit.z },
      world: { x: hit.x + pos.x, y: hit.y + pos.y, z: hit.z + pos.z },
      normal: hit.normal,
      state: blockStateKey(state),
      distance: hit.t,
    }
  })
  return best
}
