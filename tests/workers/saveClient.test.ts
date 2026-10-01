import { afterEach, describe, expect, it, vi } from 'vitest'
import { readLitematic } from '../../src/core/litematic/read'
import { saveLitematicInWorker, SaveFailure } from '../../src/workers/saveClient'
import { handleSaveRequest, type SaveRequest, type SaveResponse } from '../../src/workers/saveProtocol'
import { FakeWorker } from '../helpers/fakeWorker'
import { makeSchematic } from '../helpers/model'

const realWorker = () => new FakeWorker<SaveRequest, SaveResponse>(async (req) => (await handleSaveRequest(req)).response)
const sample = () => makeSchematic([{ size: [2, 1, 1], palette: ['minecraft:air', 'minecraft:stone'], blocks: [1, 0] }])

afterEach(() => {
  vi.useRealTimers()
})

describe('saveLitematicInWorker', () => {
  it('returns the saved bytes', async () => {
    const bytes = await saveLitematicInWorker(sample(), { now: 5, createWorker: realWorker })
    expect(readLitematic(bytes).metadata.timeModified).toBe(5)
  })

  it('copies the schematic instead of transferring its live block arrays', async () => {
    const worker = realWorker()
    const s = sample()
    await saveLitematicInWorker(s, { createWorker: () => worker })
    expect(worker.posted[0]!.transfer).toEqual([])
    expect(s.regions[0]!.blocks.byteLength).toBe(4)
  })

  it('rejects with the worker failure code and details', async () => {
    const worker = new FakeWorker<SaveRequest, SaveResponse>(() => ({ ok: false, code: 'round-trip', message: 'm', details: 'region count: 2 ≠ 1' }))
    await expect(saveLitematicInWorker(sample(), { createWorker: () => worker })).rejects.toMatchObject({
      name: 'SaveFailure', code: 'round-trip', message: 'm', details: 'region count: 2 ≠ 1',
    })
  })

  it('rejects with a timeout SaveFailure when the worker never answers', async () => {
    vi.useFakeTimers()
    const job = saveLitematicInWorker(sample(), { createWorker: () => new FakeWorker(), timeoutMs: 50 })
    const settled = expect(job).rejects.toBeInstanceOf(SaveFailure)
    await vi.advanceTimersByTimeAsync(50)
    await settled
    await expect(job).rejects.toMatchObject({ code: 'timeout' })
  })
})
