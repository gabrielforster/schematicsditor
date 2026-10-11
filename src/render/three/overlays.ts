import { Box3, Box3Helper, Color, Group, Vector3 } from 'three'
import type { Box } from '../../core/edit/scopes'
import type { Vec3 } from '../../core/model'

/** Wireframes drawn over the chunks: box selection, its pending corner, and the hovered block. */
export class Overlays {
  readonly root = new Group()
  private readonly selection = wireBox(0xffd200)
  private readonly corner = wireBox(0xffd200)
  private readonly hover = wireBox(0xffffff)

  constructor() {
    this.root.name = 'overlays'
    for (const h of [this.selection, this.corner, this.hover]) {
      h.visible = false
      h.renderOrder = 10
      this.root.add(h)
    }
  }

  /** Inclusive block box in world coordinates, or null to hide. */
  setSelection(box: Box | null): void {
    show(this.selection, box, 0.01)
  }

  setCorner(block: Vec3 | null): void {
    show(this.corner, block && { min: block, max: block }, 0.02)
  }

  setHover(block: Vec3 | null): void {
    show(this.hover, block && { min: block, max: block }, 0.005)
  }

  dispose(): void {
    for (const h of [this.selection, this.corner, this.hover]) h.dispose()
  }
}

function wireBox(color: number): Box3Helper {
  const h = new Box3Helper(new Box3(), new Color(color))
  const m = h.material as { depthTest: boolean; transparent: boolean }
  m.depthTest = false
  m.transparent = true
  return h
}

/** Covers the blocks from min to max inclusive, grown by `pad` so lines are not hidden by faces. */
function show(helper: Box3Helper, box: Box | null, pad: number): void {
  helper.visible = box !== null
  if (!box) return
  helper.box.min.set(box.min.x - pad, box.min.y - pad, box.min.z - pad)
  helper.box.max.copy(new Vector3(box.max.x + 1 + pad, box.max.y + 1 + pad, box.max.z + 1 + pad))
}
