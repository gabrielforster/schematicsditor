import type { Vec3 } from '../../core/model'

interface Entry<T> {
  key: string
  center: Vec3
  payload: T
  version: number
  pending: boolean
}

export interface ScheduledChunk<T> {
  key: string
  version: number
  payload: T
}

/** Camera movement (in blocks) after which the queue is re-sorted. */
const RESORT_DISTANCE = 8

/**
 * Nearest-first chunk queue (spec §8.4). Every invalidation bumps the
 * chunk's version, so results of jobs started before it can be recognised
 * as stale with `isCurrent`.
 */
export class ChunkScheduler<T> {
  private readonly entries = new Map<string, Entry<T>>()
  /** Pending entries, farthest first, so the nearest pops off the end. */
  private queue: Entry<T>[] = []
  private sortedFor: Vec3 | null = null
  private needsSort = false
  private pending = 0

  get pendingCount(): number {
    return this.pending
  }

  /** Marks a chunk as needing a (re)mesh. `center` is in world coordinates. */
  invalidate(key: string, center: Vec3, payload: T): void {
    const e = this.entries.get(key)
    if (e) {
      e.version++
      e.payload = payload
      e.center = center
      if (!e.pending) {
        e.pending = true
        this.pending++
        this.queue.push(e)
        this.needsSort = true
      }
      return
    }
    const entry: Entry<T> = { key, center, payload, version: 1, pending: true }
    this.entries.set(key, entry)
    this.pending++
    this.queue.push(entry)
    this.needsSort = true
  }

  /** Forgets a chunk; results of its running job become stale. */
  remove(key: string): void {
    const e = this.entries.get(key)
    if (!e) return
    if (e.pending) this.pending--
    e.pending = false
    e.version++
    this.entries.delete(key)
  }

  /** Takes every pending chunk whose payload matches out of the queue (e.g. a hidden region), returning them. */
  unqueueWhere(match: (payload: T) => boolean): { key: string; payload: T }[] {
    const out: { key: string; payload: T }[] = []
    for (const e of this.entries.values()) {
      if (!e.pending || !match(e.payload)) continue
      e.pending = false
      this.pending--
      out.push({ key: e.key, payload: e.payload })
    }
    return out
  }

  /** The pending chunk nearest to `camera`, now marked as taken; null when none is pending. */
  take(camera: Vec3): ScheduledChunk<T> | null {
    if (this.needsSort || !this.sortedFor || distance2(this.sortedFor, camera) > RESORT_DISTANCE ** 2) this.sort(camera)
    for (;;) {
      const e = this.queue.pop()
      if (!e) return null
      if (!e.pending || this.entries.get(e.key) !== e) continue
      e.pending = false
      this.pending--
      return { key: e.key, version: e.version, payload: e.payload }
    }
  }

  /** True when no invalidation or removal happened since `version` was taken. */
  isCurrent(key: string, version: number): boolean {
    return this.entries.get(key)?.version === version
  }

  clear(): void {
    for (const key of [...this.entries.keys()]) this.remove(key)
    this.queue = []
  }

  private sort(camera: Vec3): void {
    this.queue = this.queue.filter((e) => e.pending && this.entries.get(e.key) === e)
    const d = new Map(this.queue.map((e) => [e, distance2(e.center, camera)]))
    this.queue.sort((a, b) => d.get(b)! - d.get(a)!)
    this.sortedFor = { ...camera }
    this.needsSort = false
  }
}

function distance2(a: Vec3, b: Vec3): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2
}
