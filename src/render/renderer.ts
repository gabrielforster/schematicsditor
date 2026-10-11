import type { RegionChange } from '../core/edit/events'
import type { Box } from '../core/edit/scopes'
import type { Schematic } from '../core/model'
import { cachedFetcher, openAssetCache } from './assets/cache'
import { decodeImage } from './assets/decode'
import { loadTexturedAssets, type LoadedAssets } from './assets/loader'
import { clampLayerRange, schematicYBounds, stepLayerRange, type LayerRange } from './chunks/layers'
import { ChunkManager, type ChunkStats } from './chunks/manager'
import type { RenderMode } from './mesh/types'
import { ModeController, type AssetStatus } from './modes'
import { pickBlock, type PickHit } from './pick/pick'
import { BoxSelectionTool } from './selection'
import { ThreeChunkView } from './three/chunkView'
import { atlasTexture } from './three/geometry'
import { ChunkMaterials } from './three/materials'
import { Overlays } from './three/overlays'
import { Viewport } from './three/viewport'
import { schematicBounds, shouldSuggestColored } from './viewMath'
import { defaultPoolSize, MeshWorkerPool, type WorkerLike } from './workers/pool'

/** Anything that emits Plan 2 change events; `Editor` satisfies it. */
export interface ChangeSource {
  subscribe(listener: (changes: RegionChange[]) => void): () => void
}

export interface RenderStatus {
  /** The mode the user picked (switches to colored by itself when assets fail). */
  mode: RenderMode
  /** The mode chunks are drawn in now (colored while textures load). */
  effectiveMode: RenderMode
  assets: AssetStatus
  /** Spec §8.4: some region exceeds ~5M blocks; suggest (not force) colored mode. */
  suggestColored: boolean
  chunks: ChunkStats
}

export interface RendererEvents {
  /** The block under the pointer changed (null: none). */
  hover: PickHit | null
  /** A click (not a drag) on the canvas. The UI implements Alt+click eyedropper with `event.altKey`. */
  click: { hit: PickHit | null; event: MouseEvent }
  /** The box selection changed (two-click completion or `setSelection`). */
  selection: Box | null
  status: RenderStatus
}

export interface RendererOptions {
  /** Mesh worker count; defaults to `navigator.hardwareConcurrency`. */
  workers?: number
  createWorker?: () => WorkerLike
  loadAssets?: (dataVersion: number) => Promise<LoadedAssets>
}

type Listeners = { [K in keyof RendererEvents]: Set<(value: RendererEvents[K]) => void> }

/** Pointer travel (pixels) below which a press-release counts as a click, not a drag. */
const CLICK_SLOP = 4

/**
 * The rendering API Plan 4's UI drives (spec §8): owns the viewport, the
 * mesh worker pool, chunk meshes, layer view, highlight, picking and box
 * selection. It reads the schematic and never mutates it.
 *
 * `dispose()` is idempotent and drops every listener. After it, setters and
 * actions are no-ops, `pickAt` returns null, `on` returns a no-op
 * unsubscribe, and getters keep returning the last state.
 */
export class SchematicRenderer {
  private readonly viewport: Viewport
  private readonly pool: MeshWorkerPool
  private readonly materials = new ChunkMaterials()
  private readonly chunkView: ThreeChunkView
  private readonly chunks: ChunkManager
  private readonly overlays = new Overlays()
  private readonly selectionTool = new BoxSelectionTool()
  private readonly modes: ModeController
  private readonly listeners: Listeners = { hover: new Set(), click: new Set(), selection: new Set(), status: new Set() }
  private schematic: Schematic | null = null
  private unsubscribe: (() => void) | null = null
  private layers: LayerRange | null = null
  private readonly hidden = new Set<number>()
  private pointer: { x: number; y: number } | null = null
  private pointerMoved = false
  private pressedAt: { x: number; y: number } | null = null
  private hover: PickHit | null = null
  private highlightNames: readonly string[] | null = null
  private lastStatus = ''
  private disposed = false

  constructor(container: HTMLElement, options: RendererOptions = {}) {
    this.viewport = new Viewport(container)
    const createWorker = options.createWorker ??
      (() => new Worker(new URL('./workers/mesh.worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike)
    this.pool = new MeshWorkerPool(createWorker, options.workers ?? defaultPoolSize())
    this.chunkView = new ThreeChunkView(this.materials)
    this.chunks = new ChunkManager(this.chunkView, this.pool)
    this.viewport.scene.add(this.chunkView.root, this.overlays.root)
    const load = options.loadAssets ??
      (async (dataVersion: number) => loadTexturedAssets(dataVersion, cachedFetcher(await openAssetCache()), decodeImage))
    this.modes = new ModeController(load, (loaded) => {
      if (this.disposed) return
      this.pool.setAssets(loaded.assets)
      this.materials.setAtlas(atlasTexture(loaded.atlas))
      // Colored chunks meshed from the bundled palette pick up the assets' block colors.
      if (this.modes.effectiveMode === 'colored') this.chunks.remeshAll()
    }, () => {
      if (this.disposed) return
      this.chunks.setMode(this.modes.effectiveMode)
      this.emitStatus()
    })
    this.viewport.onFrame = (_seconds, cameraMoved) => this.frame(cameraMoved)
    const canvas = this.viewport.canvas
    canvas.addEventListener('pointermove', this.onPointerMove)
    canvas.addEventListener('pointerleave', this.onPointerLeave)
    canvas.addEventListener('pointerdown', this.onPointerDown)
    canvas.addEventListener('pointerup', this.onPointerUp)
  }

  get status(): RenderStatus {
    return {
      mode: this.modes.mode,
      effectiveMode: this.modes.effectiveMode,
      assets: this.modes.assets,
      suggestColored: this.schematic ? shouldSuggestColored(this.schematic) : false,
      chunks: this.chunks.stats,
    }
  }

  /** Shows a schematic. `changes` (the Plan 2 Editor) drives incremental remeshing. */
  load(schematic: Schematic, changes?: ChangeSource): void {
    if (this.disposed) return
    this.unload()
    this.schematic = schematic
    this.chunkView.setSchematic(schematic)
    this.chunks.setSchematic(schematic)
    this.viewport.clipBounds = schematicBounds(schematic)
    this.unsubscribe = changes?.subscribe((c) => {
      this.chunks.applyChanges(c)
      this.pointerMoved = true // the block under the pointer may have changed
    }) ?? null
    this.modes.setDataVersion(schematic.dataVersion)
    this.fitToView()
    this.emitStatus()
  }

  unload(): void {
    if (this.disposed) return
    this.unsubscribe?.()
    this.unsubscribe = null
    this.schematic = null
    this.viewport.clipBounds = null
    this.layers = null
    this.highlightNames = null
    this.hidden.clear()
    const hadSelection = this.selectionTool.box !== null
    this.selectionTool.set(null)
    this.selectionTool.cancel()
    this.overlays.setSelection(null)
    this.overlays.setCorner(null)
    this.setHover(null)
    this.chunks.setSchematic(null)
    this.chunks.setLayerRange(null)
    this.chunks.setHighlight(null)
    this.chunkView.setSchematic(null)
    this.modes.setDataVersion(null)
    if (hadSelection) this.emit('selection', null)
  }

  setMode(mode: RenderMode): void {
    if (this.disposed) return
    this.modes.setMode(mode)
  }

  /** After an asset failure (spec §12): back to textured and fetch again. */
  retryAssets(): void {
    if (this.disposed) return
    this.modes.retry()
  }

  setRegionVisible(regionId: number, visible: boolean): void {
    if (this.disposed) return
    if (visible) this.hidden.delete(regionId)
    else this.hidden.add(regionId)
    this.chunkView.setRegionVisible(regionId, visible)
    this.chunks.setRegionVisible(regionId, visible)
    this.pointerMoved = true
  }

  isRegionVisible(regionId: number): boolean {
    return !this.hidden.has(regionId)
  }

  /** Visible layers in schematic Y (spec §8.5); null shows all. minY === maxY is single-layer mode with a ghost layer below. */
  setLayerRange(range: LayerRange | null): void {
    if (this.disposed) return
    const bounds = this.schematic && schematicYBounds(this.schematic)
    this.layers = range && bounds ? clampLayerRange(range, bounds) : null
    this.chunks.setLayerRange(this.layers)
    this.pointerMoved = true
  }

  get layerRange(): LayerRange | null {
    return this.layers
  }

  /** ↑/↓: moves the visible range by `delta` layers (starting from the top layer when no range is set). */
  stepLayer(delta: number): void {
    if (this.disposed) return
    const bounds = this.schematic && schematicYBounds(this.schematic)
    if (!bounds) return
    const from = this.layers ?? { minY: bounds.maxY, maxY: bounds.maxY }
    this.setLayerRange(this.layers ? stepLayerRange(from, delta, bounds) : from)
  }

  /** Highlights blocks with these names (`minecraft:stone`) and fades the rest; null clears (spec §8.6). */
  setHighlight(blockNames: readonly string[] | null): void {
    if (this.disposed) return
    this.highlightNames = blockNames ? [...blockNames] : null
    this.chunks.setHighlight(blockNames)
  }

  /** The highlighted block names, or null when nothing is highlighted. */
  get highlight(): readonly string[] | null {
    return this.highlightNames
  }

  /** Starts two-click box selection: the next two clicked blocks are the corners. */
  startBoxSelection(): void {
    if (this.disposed) return
    this.selectionTool.start()
  }

  cancelBoxSelection(): void {
    if (this.disposed) return
    this.selectionTool.cancel()
    this.overlays.setCorner(null)
  }

  /** Numeric min/max API (inclusive, schematic coordinates); null clears. */
  setSelection(box: Box | null): void {
    if (this.disposed) return
    this.selectionTool.set(box)
    this.overlays.setSelection(this.selectionTool.box)
    this.emit('selection', this.selectionTool.box)
  }

  get selection(): Box | null {
    return this.selectionTool.box
  }

  get selecting(): boolean {
    return this.selectionTool.picking
  }

  fitToView(): void {
    if (this.disposed) return
    if (this.schematic) this.viewport.fit(schematicBounds(this.schematic, this.hidden))
  }

  setFlyMode(on: boolean): void {
    if (this.disposed) return
    this.viewport.setFlyMode(on)
  }

  get flyMode(): boolean {
    return this.viewport.flyMode
  }

  /** The block under a page point, honoring hidden regions and the layer range. */
  pickAt(clientX: number, clientY: number): PickHit | null {
    if (this.disposed || !this.schematic) return null
    return pickBlock(this.schematic, this.viewport.ray(clientX, clientY), { hidden: this.hidden, layers: this.layers })
  }

  on<K extends keyof RendererEvents>(event: K, listener: (value: RendererEvents[K]) => void): () => void {
    if (this.disposed) return () => false
    const set = this.listeners[event] as Set<(value: RendererEvents[K]) => void>
    set.add(listener)
    return () => set.delete(listener)
  }

  /** Frees the GPU, workers and listeners. Safe to call twice. */
  dispose(): void {
    if (this.disposed) return
    this.unload()
    this.disposed = true
    for (const set of Object.values(this.listeners)) set.clear()
    const canvas = this.viewport.canvas
    canvas.removeEventListener('pointermove', this.onPointerMove)
    canvas.removeEventListener('pointerleave', this.onPointerLeave)
    canvas.removeEventListener('pointerdown', this.onPointerDown)
    canvas.removeEventListener('pointerup', this.onPointerUp)
    this.pool.dispose()
    this.overlays.dispose()
    this.materials.dispose()
    this.viewport.dispose()
  }

  private frame(cameraMoved: boolean): void {
    this.chunks.pump(this.viewport.cameraPosition())
    if (cameraMoved) this.pointerMoved = true // a still pointer now points at another block
    if (this.pointer && this.pointerMoved) {
      this.pointerMoved = false
      this.setHover(this.pickAt(this.pointer.x, this.pointer.y))
    }
    this.emitStatus()
  }

  private setHover(hit: PickHit | null): void {
    const same = hit && this.hover && hit.regionId === this.hover.regionId &&
      hit.world.x === this.hover.world.x && hit.world.y === this.hover.world.y && hit.world.z === this.hover.world.z &&
      hit.state === this.hover.state
    if (same || (!hit && !this.hover)) return
    this.hover = hit
    this.overlays.setHover(hit?.world ?? null)
    this.emit('hover', hit)
  }

  private emit<K extends keyof RendererEvents>(event: K, value: RendererEvents[K]): void {
    for (const l of this.listeners[event] as Set<(value: RendererEvents[K]) => void>) l(value)
  }

  private emitStatus(): void {
    const status = this.status
    const json = JSON.stringify(status)
    if (json === this.lastStatus) return
    this.lastStatus = json
    this.emit('status', status)
  }

  private readonly onPointerMove = (e: PointerEvent): void => {
    this.pointer = { x: e.clientX, y: e.clientY }
    this.pointerMoved = true
  }

  private readonly onPointerLeave = (): void => {
    this.pointer = null
    this.setHover(null)
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    this.pressedAt = { x: e.clientX, y: e.clientY }
  }

  private readonly onPointerUp = (e: PointerEvent): void => {
    const p = this.pressedAt
    this.pressedAt = null
    if (!p || Math.hypot(e.clientX - p.x, e.clientY - p.y) > CLICK_SLOP || e.button !== 0) return
    const hit = this.pickAt(e.clientX, e.clientY)
    if (hit && this.selectionTool.picking) {
      const box = this.selectionTool.click(hit.world)
      this.overlays.setCorner(this.selectionTool.firstCorner)
      if (box) {
        this.overlays.setSelection(box)
        this.emit('selection', box)
      }
    }
    this.emit('click', { hit, event: e })
  }
}
