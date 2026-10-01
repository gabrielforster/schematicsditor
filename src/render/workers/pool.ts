import type { TexturedAssets } from '../assets/resources'
import type { ChunkMeshes } from '../mesh/types'
import type { MeshJob, MeshRequest, MeshResponse } from './protocol'

/** The part of `Worker` the pool uses; tests pass fakes. */
export interface WorkerLike {
  postMessage(message: MeshRequest, transfer: Transferable[]): void
  terminate(): void
  onmessage: ((event: { data: MeshResponse }) => void) | null
  onerror: ((event: { message?: string }) => void) | null
  onmessageerror: ((event: unknown) => void) | null
}

/** Thrown for a job that failed in the worker (bad data, out of memory) or whose worker crashed. */
export class MeshJobError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MeshJobError'
  }
}

interface Pending {
  id: number
  job: MeshJob
  resolve: (meshes: ChunkMeshes) => void
  reject: (error: Error) => void
}

interface Slot {
  worker: WorkerLike
  current: Pending | null
}

/** Default pool size: one worker per logical core (spec §6). */
export function defaultPoolSize(): number {
  const n = typeof navigator === 'undefined' ? 0 : navigator.hardwareConcurrency
  return Math.max(1, n || 4)
}

/**
 * Mesh worker pool (spec §6). One job per worker at a time; extra jobs wait
 * in FIFO order. A worker that crashes is replaced and its job rejected, so
 * one bad chunk never stops the others.
 */
export class MeshWorkerPool {
  readonly size: number
  private readonly slots: Slot[] = []
  private readonly queue: Pending[] = []
  private assets: TexturedAssets | null = null
  private nextId = 1
  private disposed = false

  constructor(private readonly createWorker: () => WorkerLike, size = defaultPoolSize()) {
    this.size = size
    for (let i = 0; i < size; i++) this.slots.push(this.spawn())
  }

  /** Jobs queued or running. */
  get pending(): number {
    return this.queue.length + this.slots.filter((s) => s.current).length
  }

  /** Sends textured assets (or null) to every worker, now and after any respawn. */
  setAssets(assets: TexturedAssets | null): void {
    this.assets = assets
    for (const slot of this.slots) slot.worker.postMessage({ type: 'assets', assets }, [])
  }

  /** Meshes a chunk. The slice's cell buffer is transferred to the worker. */
  mesh(job: MeshJob): Promise<ChunkMeshes> {
    if (this.disposed) return Promise.reject(new MeshJobError('mesh worker pool disposed'))
    return new Promise((resolve, reject) => {
      this.queue.push({ id: this.nextId++, job, resolve, reject })
      this.dispatch()
    })
  }

  /** Terminates every worker and rejects every unfinished job. */
  dispose(): void {
    this.disposed = true
    const error = new MeshJobError('mesh worker pool disposed')
    for (const slot of this.slots) {
      slot.worker.terminate()
      slot.current?.reject(error)
      slot.current = null
    }
    for (const p of this.queue.splice(0)) p.reject(error)
  }

  private spawn(): Slot {
    const slot: Slot = { worker: this.createWorker(), current: null }
    slot.worker.onmessage = (event) => {
      const r = event.data
      const p = slot.current
      if (!p || p.id !== r.id) return
      slot.current = null
      if (r.ok) p.resolve(r.meshes)
      else p.reject(new MeshJobError(r.error))
      this.dispatch()
    }
    slot.worker.onerror = (event) => this.crash(slot, `mesh worker crashed: ${event.message ?? 'unknown error'}`)
    slot.worker.onmessageerror = () => this.crash(slot, 'mesh worker sent an unreadable message')
    if (this.assets) slot.worker.postMessage({ type: 'assets', assets: this.assets }, [])
    return slot
  }

  private crash(slot: Slot, message: string): void {
    if (this.disposed) return
    slot.worker.terminate()
    const p = slot.current
    const i = this.slots.indexOf(slot)
    if (i !== -1) this.slots[i] = this.spawn()
    p?.reject(new MeshJobError(message))
    this.dispatch()
  }

  private dispatch(): void {
    for (const slot of this.slots) {
      if (slot.current) continue
      const p = this.queue.shift()
      if (!p) return
      slot.current = p
      slot.worker.postMessage({ type: 'mesh', id: p.id, job: p.job }, [p.job.slice.cells.buffer as ArrayBuffer])
    }
  }
}
