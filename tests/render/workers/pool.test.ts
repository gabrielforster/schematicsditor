import { describe, expect, it } from 'vitest'
import type { ChunkMeshes } from '../../../src/render/mesh/types'
import { MeshJobError, MeshWorkerPool, type WorkerLike } from '../../../src/render/workers/pool'
import type { MeshRequest, MeshResponse } from '../../../src/render/workers/protocol'
import { testAssets } from '../../helpers/assets'
import { makeSlice } from '../../helpers/slice'

class FakeWorker implements WorkerLike {
  received: MeshRequest[] = []
  terminated = false
  onmessage: ((event: { data: MeshResponse }) => void) | null = null
  onerror: ((event: { message?: string }) => void) | null = null
  onmessageerror: ((event: unknown) => void) | null = null
  postMessage(message: MeshRequest): void {
    this.received.push(message)
  }
  terminate(): void {
    this.terminated = true
  }
  lastJobId(): number {
    const m = this.received.filter((r) => r.type === 'mesh').at(-1)
    if (!m || m.type !== 'mesh') throw new Error('no job')
    return m.id
  }
  reply(meshes: ChunkMeshes = EMPTY): void {
    this.onmessage!({ data: { type: 'mesh', id: this.lastJobId(), ok: true, meshes } })
  }
}

const EMPTY: ChunkMeshes = { opaque: null, transparent: null, faded: null }
const job = () => ({ mode: 'colored' as const, slice: makeSlice([1, 1, 1], () => 'minecraft:stone') })

function setup(size: number) {
  const workers: FakeWorker[] = []
  const pool = new MeshWorkerPool(() => {
    const w = new FakeWorker()
    workers.push(w)
    return w
  }, size)
  return { pool, workers }
}

describe('MeshWorkerPool', () => {
  it('runs one job per worker and queues the rest', async () => {
    const { pool, workers } = setup(2)
    const results = [pool.mesh(job()), pool.mesh(job()), pool.mesh(job())]
    expect(workers.map((w) => w.received.length)).toEqual([1, 1])
    expect(pool.pending).toBe(3)
    workers[0]!.reply()
    await results[0]
    expect(workers[0]!.received).toHaveLength(2) // the queued job went to the free worker
    workers[1]!.reply()
    workers[0]!.reply()
    await Promise.all(results)
    expect(pool.pending).toBe(0)
  })

  it('rejects a job the worker reports as failed and keeps going', async () => {
    const { pool, workers } = setup(1)
    const failed = pool.mesh(job())
    const next = pool.mesh(job())
    workers[0]!.onmessage!({ data: { type: 'mesh', id: workers[0]!.lastJobId(), ok: false, error: 'boom' } })
    await expect(failed).rejects.toThrow('boom')
    workers[0]!.reply()
    await expect(next).resolves.toEqual(EMPTY)
  })

  it('replaces a crashed worker, rejects its job and resends assets', async () => {
    const { pool, workers } = setup(1)
    const assets = testAssets()
    pool.setAssets(assets)
    const crashed = pool.mesh(job())
    const queued = pool.mesh(job())
    workers[0]!.onerror!({ message: 'out of memory' })
    await expect(crashed).rejects.toThrow(MeshJobError)
    await expect(crashed).rejects.toThrow('out of memory')
    expect(workers[0]!.terminated).toBe(true)
    expect(workers).toHaveLength(2)
    expect(workers[1]!.received[0]).toEqual({ type: 'assets', assets })
    expect(workers[1]!.received[1]!.type).toBe('mesh')
    workers[1]!.reply()
    await expect(queued).resolves.toEqual(EMPTY)
  })

  it('sends assets to every worker', () => {
    const { pool, workers } = setup(3)
    pool.setAssets(null)
    expect(workers.every((w) => w.received[0]!.type === 'assets')).toBe(true)
  })

  it('rejects everything on dispose', async () => {
    const { pool, workers } = setup(1)
    const running = pool.mesh(job())
    const queued = pool.mesh(job())
    pool.dispose()
    await expect(running).rejects.toThrow('disposed')
    await expect(queued).rejects.toThrow('disposed')
    await expect(pool.mesh(job())).rejects.toThrow('disposed')
    expect(workers[0]!.terminated).toBe(true)
  })
})
