import { afterEach, describe, expect, it, vi } from 'vitest'
import { writeNbt } from '../../src/core/nbt'
import { parseLitematicInWorker, ParseFailure } from '../../src/workers/parseClient'
import { handleParseRequest, type ParseResponse } from '../../src/workers/parseProtocol'
import { FakeWorker } from '../helpers/fakeWorker'
import { litematicNbt } from '../helpers/litematicNbt'

const fileBytes = () =>
  writeNbt(litematicNbt({ regions: [{ size: [2, 1, 1], palette: ['minecraft:air', 'minecraft:stone'], blocks: [1, 0] }] })).slice().buffer
const realWorker = () => new FakeWorker<ArrayBuffer, ParseResponse>(async (buffer) => (await handleParseRequest(buffer)).response)

afterEach(() => {
  vi.useRealTimers()
})

describe('parseLitematicInWorker', () => {
  it('returns the schematic and transfers the input buffer', async () => {
    const worker = realWorker()
    const buffer = fileBytes()
    const s = await parseLitematicInWorker(buffer, { createWorker: () => worker })
    expect(Array.from(s.regions[0]!.blocks)).toEqual([1, 0])
    expect(worker.posted[0]!.transfer).toEqual([buffer])
  })

  it('rejects with the reader error code, message and details', async () => {
    const job = parseLitematicInWorker(new TextEncoder().encode('nope').buffer, { createWorker: realWorker })
    await expect(job).rejects.toBeInstanceOf(ParseFailure)
    await expect(job).rejects.toMatchObject({ code: 'not-nbt', message: 'This file is not a valid NBT file.' })
  })

  it('rejects with a timeout ParseFailure when the worker never answers', async () => {
    vi.useFakeTimers()
    const job = parseLitematicInWorker(fileBytes(), { createWorker: () => new FakeWorker(), timeoutMs: 1000 })
    const settled = expect(job).rejects.toMatchObject({ code: 'timeout' })
    await vi.advanceTimersByTimeAsync(1000)
    await settled
  })

  it('rejects with an internal ParseFailure when the worker crashes', async () => {
    const worker = new FakeWorker<ArrayBuffer, ParseResponse>()
    const job = parseLitematicInWorker(fileBytes(), { createWorker: () => worker })
    worker.onerror?.({ message: 'out of memory' })
    await expect(job).rejects.toMatchObject({ code: 'internal', message: 'The file reader crashed.', details: 'out of memory' })
  })
})
