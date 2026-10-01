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
  /** Null once the slot is dead (its worker kept crashing). */
  worker: WorkerLike | null
  current: Pending | null
  /** Times of recent crashes, for the respawn limit. */
  crashes: number[]
}

export interface MeshWorkerPoolOptions {
  /** Milliseconds clock for the respawn limit; defaults to `Date.now`. */
  now?: () => number
}

/** A slot whose worker crashes this many times within `CRASH_WINDOW_MS` is not respawned again. */
const MAX_CRASHES = 3
const CRASH_WINDOW_MS = 10_000

const UNAVAILABLE = 'mesh workers unavailable'

/** Default pool size: one worker per logical core (spec §6). */
export function defaultPoolSize(): number {
  const n = typeof navigator === 'undefined' ? 0 : navigator.hardwareConcurrency
  return Math.max(1, n || 4)
}

/**
 * Mesh worker pool (spec §6). One job per worker at a time; extra jobs wait
 * in FIFO order. A worker that crashes is replaced and its job rejected, so
 * one bad chunk never stops the others. A worker that crashes 3 times within
 * 10 s (e.g. its script fails to load) is not replaced; once no worker is
 * left, queued and new jobs are rejected with "mesh workers unavailable".
 */
export class MeshWorkerPool {
  readonly size: number
  private readonly slots: Slot[] = []
  private readonly queue: Pending[] = []
  private assets: TexturedAssets | null = null
  private nextId = 1
  private disposed = false
  private readonly now: () => number

  constructor(private readonly createWorker: () => WorkerLike, size = defaultPoolSize(), options: MeshWorkerPoolOptions = {}) {
    this.size = size
    this.now = options.now ?? (() => Date.now())
    for (let i = 0; i < size; i++) {
      const slot: Slot = { worker: null, current: null, crashes: [] }
      this.slots.push(slot)
      this.spawn(slot)
    }
  }

  /** Jobs queued or running. */
  get pending(): number {
    return this.queue.length + this.slots.filter((s) => s.current).length
  }

  /** Sends textured assets (or null) to every worker, now and after any respawn. */
  setAssets(assets: TexturedAssets | null): void {
    this.assets = assets
    for (const slot of this.slots) slot.worker?.postMessage({ type: 'assets', assets }, [])
  }

  /** Meshes a chunk. The slice's cell buffer is transferred to the worker. */
  mesh(job: MeshJob): Promise<ChunkMeshes> {
    if (this.disposed) return Promise.reject(new MeshJobError('mesh worker pool disposed'))
    if (this.allDead()) return Promise.reject(new MeshJobError(UNAVAILABLE))
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
      slot.worker?.terminate()
      const p = slot.current
      slot.current = null
      p?.reject(error)
    }
    for (const p of this.queue.splice(0)) p.reject(error)
  }

  private spawn(slot: Slot): void {
    const worker = this.createWorker()
    slot.worker = worker
    worker.onmessage = (event) => {
      const r = event.data
      const p = slot.current
      if (slot.worker !== worker || !p || p.id !== r.id) return
      slot.current = null
      if (r.ok) p.resolve(r.meshes)
      else p.reject(new MeshJobError(r.error))
      this.dispatch()
    }
    worker.onerror = (event) => this.crash(slot, worker, `mesh worker crashed: ${event.message ?? 'unknown error'}`)
    worker.onmessageerror = () => this.crash(slot, worker, 'mesh worker sent an unreadable message')
    if (this.assets) worker.postMessage({ type: 'assets', assets: this.assets }, [])
  }

  /** Replaces a crashed worker (unless it keeps crashing) and rejects its job. Later reports from the same worker are ignored. */
  private crash(slot: Slot, worker: WorkerLike, message: string): void {
    if (this.disposed || slot.worker !== worker) return
    worker.terminate()
    const p = slot.current
    slot.current = null
    slot.worker = null
    const now = this.now()
    slot.crashes = slot.crashes.filter((t) => now - t < CRASH_WINDOW_MS)
    slot.crashes.push(now)
    if (slot.crashes.length < MAX_CRASHES) this.spawn(slot)
    else console.error(`mesh worker crashed ${MAX_CRASHES} times within ${CRASH_WINDOW_MS / 1000} s; not restarting it`)
    p?.reject(new MeshJobError(message))
    if (this.allDead()) {
      const error = new MeshJobError(UNAVAILABLE)
      for (const q of this.queue.splice(0)) q.reject(error)
    }
    this.dispatch()
  }

  private allDead(): boolean {
    return this.slots.every((s) => !s.worker)
  }

  private dispatch(): void {
    for (const slot of this.slots) {
      if (slot.current || !slot.worker) continue
      const p = this.queue.shift()
      if (!p) return
      slot.current = p
      slot.worker.postMessage({ type: 'mesh', id: p.id, job: p.job }, [p.job.slice.cells.buffer as ArrayBuffer])
    }
  }
}
