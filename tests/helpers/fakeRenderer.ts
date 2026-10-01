// Records what the UI asks of the renderer and lets tests fire renderer events.
import type { Editor } from '../../src/core/edit/editor'
import type { Box } from '../../src/core/edit/scopes'
import type { Schematic } from '../../src/core/model'
import type { LayerRange, RendererEvents, RenderMode, RenderStatus } from '../../src/render'
import type { RendererLike } from '../../src/ui/app/services'

export const idleStatus = (patch: Partial<RenderStatus> = {}): RenderStatus => ({
  mode: 'textured',
  effectiveMode: 'colored',
  assets: { state: 'none' },
  suggestColored: false,
  chunks: { total: 0, queued: 0, parked: 0, meshing: 0, failed: 0 },
  ...patch,
})

type Listeners = { [K in keyof RendererEvents]: Set<(value: RendererEvents[K]) => void> }

export class FakeRenderer implements RendererLike {
  readonly calls: string[] = []
  loaded: { schematic: Schematic; editor: Editor | undefined } | null = null
  status: RenderStatus = idleStatus()
  layerRange: LayerRange | null = null
  selection: Box | null = null
  selecting = false
  flyMode = false
  highlight: readonly string[] | null = null
  hidden = new Set<number>()
  disposed = false
  private readonly listeners: Listeners = { hover: new Set(), click: new Set(), selection: new Set(), status: new Set() }

  load(schematic: Schematic, changes?: unknown): void {
    this.calls.push('load')
    this.loaded = { schematic, editor: changes as Editor | undefined }
  }

  unload(): void {
    this.calls.push('unload')
    this.loaded = null
  }

  setMode(mode: RenderMode): void {
    this.calls.push(`setMode:${mode}`)
    this.emit('status', (this.status = { ...this.status, mode }))
  }

  retryAssets(): void {
    this.calls.push('retryAssets')
  }

  setRegionVisible(regionId: number, visible: boolean): void {
    this.calls.push(`setRegionVisible:${regionId}:${visible}`)
    if (visible) this.hidden.delete(regionId)
    else this.hidden.add(regionId)
  }

  /** Clamps to Y 0..9 like a 10-layer schematic would. */
  setLayerRange(range: LayerRange | null): void {
    this.calls.push(`setLayerRange:${range ? `${range.minY}..${range.maxY}` : 'all'}`)
    this.layerRange = range && {
      minY: Math.max(0, Math.min(range.minY, range.maxY)),
      maxY: Math.min(9, Math.max(range.minY, range.maxY)),
    }
  }

  stepLayer(delta: number): void {
    this.calls.push(`stepLayer:${delta}`)
    const r = this.layerRange ?? { minY: 9, maxY: 9 }
    this.layerRange = this.layerRange
      ? { minY: Math.max(0, r.minY + delta), maxY: Math.min(9, r.maxY + delta) }
      : r
  }

  setHighlight(blockNames: readonly string[] | null): void {
    this.calls.push(`setHighlight:${blockNames ? blockNames.join(',') : 'none'}`)
    this.highlight = blockNames
  }

  startBoxSelection(): void {
    this.calls.push('startBoxSelection')
    this.selecting = true
  }

  cancelBoxSelection(): void {
    this.calls.push('cancelBoxSelection')
    this.selecting = false
  }

  setSelection(box: Box | null): void {
    this.calls.push('setSelection')
    this.selection = box && {
      min: { x: Math.min(box.min.x, box.max.x), y: Math.min(box.min.y, box.max.y), z: Math.min(box.min.z, box.max.z) },
      max: { x: Math.max(box.min.x, box.max.x), y: Math.max(box.min.y, box.max.y), z: Math.max(box.min.z, box.max.z) },
    }
    this.emit('selection', this.selection)
  }

  fitToView(): void {
    this.calls.push('fitToView')
  }

  setFlyMode(on: boolean): void {
    this.calls.push(`setFlyMode:${on}`)
    this.flyMode = on
  }

  on<K extends keyof RendererEvents>(event: K, listener: (value: RendererEvents[K]) => void): () => void {
    const set = this.listeners[event] as Set<(value: RendererEvents[K]) => void>
    set.add(listener)
    return () => set.delete(listener)
  }

  dispose(): void {
    this.disposed = true
  }

  emit<K extends keyof RendererEvents>(event: K, value: RendererEvents[K]): void {
    for (const l of this.listeners[event] as Set<(value: RendererEvents[K]) => void>) l(value)
  }
}
