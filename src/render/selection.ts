import type { Box } from '../core/edit/scopes'
import type { Vec3 } from '../core/model'

/** The same box with min ≤ max on every axis (Plan 2's Box allows corners in any order). */
export function normalizeBox(box: Box): Box {
  return {
    min: { x: Math.min(box.min.x, box.max.x), y: Math.min(box.min.y, box.max.y), z: Math.min(box.min.z, box.max.z) },
    max: { x: Math.max(box.min.x, box.max.x), y: Math.max(box.min.y, box.max.y), z: Math.max(box.min.z, box.max.z) },
  }
}

/**
 * Two-click box selection (spec §8.6): after `start`, the first clicked
 * block is one corner and the second completes the box. `set` is the
 * numeric min/max API. Coordinates are inclusive block coordinates in the
 * schematic frame, so the box feeds Plan 2's `{ kind: 'box' }` scope as is.
 */
export class BoxSelectionTool {
  private current: Box | null = null
  private corner: Vec3 | null = null
  private active = false

  get box(): Box | null {
    return this.current
  }

  /** True while waiting for corner clicks. */
  get picking(): boolean {
    return this.active
  }

  /** The first corner while waiting for the second, else null. */
  get firstCorner(): Vec3 | null {
    return this.corner
  }

  start(): void {
    this.active = true
    this.corner = null
  }

  cancel(): void {
    this.active = false
    this.corner = null
  }

  /** Feeds a clicked block. Returns the new box when this click completed one, else null. */
  click(block: Vec3): Box | null {
    if (!this.active) return null
    if (!this.corner) {
      this.corner = { ...block }
      return null
    }
    this.current = normalizeBox({ min: this.corner, max: block })
    this.active = false
    this.corner = null
    return this.current
  }

  set(box: Box | null): void {
    this.current = box ? normalizeBox(box) : null
  }
}
