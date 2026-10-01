import { CHUNK_SIZE, type ChunkCoord, type RegionChange } from '../../core/edit/events'
import type { Schematic, Vec3 } from '../../core/model'
import type { ChunkMeshes, RenderMode } from '../mesh/types'
import type { MeshJob } from '../workers/protocol'
import { allChunks, chunkCounts, chunkKey, type ChunkPass } from './coords'
import { extractChunk, type LocalYRange } from './extract'
import { chunksForChange } from './invalidate'
import { ghostLayer, rowSignature, rowsToRemesh, toLocalRange, type LayerRange } from './layers'
import { ChunkScheduler } from './scheduler'

/** Where finished chunk meshes go; the Three.js layer implements it. */
export interface ChunkView {
  /** Shows (or replaces) a chunk's meshes. */
  set(key: string, regionId: number, coord: ChunkCoord, pass: ChunkPass, meshes: ChunkMeshes): void
  /** Removes a chunk's meshes or failure marker, if any. */
  delete(key: string): void
  /** Marks a chunk whose meshing failed (spec §12: red outline). */
  fail(key: string, regionId: number, coord: ChunkCoord, pass: ChunkPass): void
  clear(): void
}

/** Meshes chunk jobs; MeshWorkerPool implements it. */
export interface Mesher {
  readonly size: number
  mesh(job: MeshJob): Promise<ChunkMeshes>
}

export interface ChunkStats {
  /** Chunks of the main pass. */
  total: number
  /** Main-pass chunks waiting to be meshed. */
  queued: number
  /** Jobs running in workers (both passes). */
  meshing: number
  /** Chunks whose last job failed (both passes). */
  failed: number
}

interface Payload {
  regionId: number
  coord: ChunkCoord
  pass: ChunkPass
}

/**
 * Keeps every region's chunk meshes in step with the model and view
 * settings (spec §8.4 to §8.7), without touching Three.js or workers
 * directly. Call `pump` every frame.
 */
export class ChunkManager {
  private schematic: Schematic | null = null
  private mode: RenderMode = 'colored'
  private layers: LayerRange | null = null
  private highlight: ReadonlySet<string> | null = null
  private readonly hidden = new Set<number>()
  private readonly scheduler = new ChunkScheduler<Payload>()
  /** Chunks of hidden regions waiting to be meshed once the region is shown. */
  private readonly parked = new Map<string, Payload>()
  private readonly failed = new Set<string>()
  private meshing = 0
  private total = 0

  constructor(private readonly view: ChunkView, private readonly mesher: Mesher) {}

  get stats(): ChunkStats {
    let queued = this.parked.size
    queued += this.scheduler.pendingCount
    return { total: this.total, queued, meshing: this.meshing, failed: this.failed.size }
  }

  setSchematic(schematic: Schematic | null): void {
    this.scheduler.clear()
    this.parked.clear()
    this.failed.clear()
    this.hidden.clear()
    this.view.clear()
    this.schematic = schematic
    this.total = 0
    if (!schematic) return
    for (const region of schematic.regions) {
      const n = chunkCounts(region.size)
      this.total += n.x * n.y * n.z
    }
    this.invalidateAll()
  }

  setMode(mode: RenderMode): void {
    if (mode === this.mode) return
    this.mode = mode
    this.invalidateAll()
  }

  /** Visible layers; null shows everything. Only chunk rows whose visible part changes are remeshed. */
  setLayerRange(range: LayerRange | null): void {
    const before = this.layers
    this.layers = range
    const s = this.schematic
    if (!s) return
    const ghostBefore = ghostLayer(before)
    const ghostAfter = ghostLayer(range)
    s.regions.forEach((region, regionId) => {
      for (const [pass, a, b] of [['main', before, range], ['ghost', ghostBefore, ghostAfter]] as const) {
        // The ghost pass draws nothing when there is no ghost layer.
        const from = pass === 'ghost' && !a ? EMPTY : toLocalRange(a, region)
        const to = pass === 'ghost' && !b ? EMPTY : toLocalRange(b, region)
        const rows = new Set(rowsToRemesh(from, to, region.size.y))
        if (rows.size === 0) continue
        for (const coord of allChunks(region.size)) {
          if (!rows.has(coord.cy)) continue
          if (rowSignature(to, coord.cy, region.size.y) === 'empty') this.drop(regionId, coord, pass)
          else this.invalidate(regionId, coord, pass)
        }
      }
    })
  }

  /** Block names to highlight (others fade), or null to show everything normally. Remeshes every chunk. */
  setHighlight(names: readonly string[] | null): void {
    this.highlight = names ? new Set(names) : null
    const s = this.schematic
    if (!s) return
    s.regions.forEach((region, regionId) => {
      for (const coord of allChunks(region.size)) {
        if (rowSignature(toLocalRange(this.layers, region), coord.cy, region.size.y) !== 'empty') {
          this.invalidate(regionId, coord, 'main')
        }
      }
    })
  }

  /** Hidden regions keep their meshes (the view hides them) but are not meshed until shown again. */
  setRegionVisible(regionId: number, visible: boolean): void {
    if (visible) {
      if (!this.hidden.delete(regionId)) return
      for (const [key, p] of [...this.parked]) {
        if (p.regionId !== regionId) continue
        this.parked.delete(key)
        this.invalidate(p.regionId, p.coord, p.pass)
      }
    } else if (!this.hidden.has(regionId)) {
      this.hidden.add(regionId)
      for (const { key, payload } of this.scheduler.unqueueWhere((p) => p.regionId === regionId)) this.parked.set(key, payload)
    }
  }

  /** Remeshes the chunks an edit touched (spec §8.7). Pass Editor change events here. */
  applyChanges(changes: readonly RegionChange[]): void {
    const s = this.schematic
    if (!s) return
    for (const change of changes) {
      const region = s.regions[change.regionId]
      if (!region) continue
      const ghost = ghostLayer(this.layers)
      for (const coord of chunksForChange(region, change)) {
        if (rowSignature(toLocalRange(this.layers, region), coord.cy, region.size.y) !== 'empty') {
          this.invalidate(change.regionId, coord, 'main')
        }
        if (ghost && rowSignature(toLocalRange(ghost, region), coord.cy, region.size.y) !== 'empty') {
          this.invalidate(change.regionId, coord, 'ghost')
        }
      }
    }
  }

  /** Starts jobs for the chunks nearest to `camera` (world coordinates) while workers have room. */
  pump(camera: Vec3): void {
    const s = this.schematic
    if (!s) return
    const capacity = this.mesher.size * 2
    while (this.meshing < capacity) {
      const next = this.scheduler.take(camera)
      if (!next) return
      const { key, version, payload } = next
      const { regionId, coord, pass } = payload
      const region = s.regions[regionId]
      if (!region) continue
      const range = pass === 'main' ? this.layers : ghostLayer(this.layers)
      if (pass === 'ghost' && !range) {
        this.view.delete(key)
        continue
      }
      const slice = extractChunk(region, coord, {
        yRange: toLocalRange(range, region),
        highlight: pass === 'main' ? this.highlight : null,
      })
      if (!slice) {
        this.failed.delete(key)
        this.view.delete(key)
        continue
      }
      this.meshing++
      this.mesher.mesh({ mode: this.mode, slice }).then(
        (meshes) => {
          this.meshing--
          if (!this.scheduler.isCurrent(key, version)) return
          this.failed.delete(key)
          this.view.set(key, regionId, coord, pass, meshes)
        },
        (error: unknown) => {
          this.meshing--
          if (!this.scheduler.isCurrent(key, version)) return
          console.error(`Meshing chunk ${key} failed`, error)
          this.failed.add(key)
          this.view.fail(key, regionId, coord, pass)
        },
      )
    }
  }

  private invalidateAll(): void {
    const s = this.schematic
    if (!s) return
    const ghost = ghostLayer(this.layers)
    s.regions.forEach((region, regionId) => {
      for (const coord of allChunks(region.size)) {
        if (rowSignature(toLocalRange(this.layers, region), coord.cy, region.size.y) !== 'empty') {
          this.invalidate(regionId, coord, 'main')
        }
        if (ghost && rowSignature(toLocalRange(ghost, region), coord.cy, region.size.y) !== 'empty') {
          this.invalidate(regionId, coord, 'ghost')
        }
      }
    })
  }

  private invalidate(regionId: number, coord: ChunkCoord, pass: ChunkPass): void {
    const key = chunkKey(regionId, coord, pass)
    const payload = { regionId, coord, pass }
    if (this.hidden.has(regionId)) {
      this.parked.set(key, payload)
      return
    }
    const region = this.schematic!.regions[regionId]!
    const half = CHUNK_SIZE / 2
    const center = {
      x: region.position.x + coord.cx * CHUNK_SIZE + half,
      y: region.position.y + coord.cy * CHUNK_SIZE + half,
      z: region.position.z + coord.cz * CHUNK_SIZE + half,
    }
    this.scheduler.invalidate(key, center, payload)
  }

  private drop(regionId: number, coord: ChunkCoord, pass: ChunkPass): void {
    const key = chunkKey(regionId, coord, pass)
    this.scheduler.remove(key)
    this.parked.delete(key)
    this.failed.delete(key)
    this.view.delete(key)
  }
}

/** A local range that shows nothing. */
const EMPTY: LocalYRange = { min: 1, max: 0 }
