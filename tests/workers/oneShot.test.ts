import { afterEach, describe, expect, it, vi } from 'vitest'
import { jobTimeout, runOneShot, WorkerFailure } from '../../src/workers/oneShot'
import { FakeWorker } from '../helpers/fakeWorker'

afterEach(() => {
  vi.useRealTimers()
})

describe('runOneShot', () => {
  it('resolves with the first reply and terminates the worker', async () => {
    const worker = new FakeWorker<number, number>((n) => n * 2)
    await expect(runOneShot(() => worker, 21, [], 1000)).resolves.toBe(42)
    expect(worker.terminated).toBe(true)
  })

  it('rejects with a crashed WorkerFailure on an error event', async () => {
    const worker = new FakeWorker<number, number>()
    const job = runOneShot(() => worker, 1, [], 1000)
    worker.onerror?.({ message: 'boom' })
    await expect(job).rejects.toMatchObject({ name: 'WorkerFailure', kind: 'crashed', details: 'boom' })
    expect(worker.terminated).toBe(true)
  })

  it('rejects with a messageerror WorkerFailure when the reply cannot be decoded', async () => {
    const worker = new FakeWorker<number, number>()
    const job = runOneShot(() => worker, 1, [], 1000)
    worker.onmessageerror?.({})
    await expect(job).rejects.toMatchObject({ kind: 'messageerror' })
  })

  it('rejects with a timeout WorkerFailure when a worker dies silently (out of memory)', async () => {
    vi.useFakeTimers()
    const worker = new FakeWorker<number, number>()
    const job = runOneShot(() => worker, 1, [], 5000)
    const settled = expect(job).rejects.toBeInstanceOf(WorkerFailure)
    vi.advanceTimersByTime(5000)
    await settled
    await expect(job).rejects.toMatchObject({ kind: 'timeout' })
    expect(worker.terminated).toBe(true)
  })

  it('ignores a reply that arrives after the timeout', async () => {
    vi.useFakeTimers()
    const worker = new FakeWorker<number, number>()
    const job = runOneShot(() => worker, 1, [], 10)
    vi.advanceTimersByTime(10)
    await expect(job).rejects.toMatchObject({ kind: 'timeout' })
    expect(worker.onmessage).toBeNull()
  })
})

describe('jobTimeout', () => {
  it('is one minute plus ten seconds per unit, at most ten minutes', () => {
    expect(jobTimeout(0)).toBe(60_000)
    expect(jobTimeout(2.5)).toBe(90_000)
    expect(jobTimeout(1000)).toBe(600_000)
  })
})
