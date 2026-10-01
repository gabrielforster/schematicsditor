import { describe, expect, it } from 'vitest'
import { ChunkScheduler } from '../../../src/render/chunks/scheduler'

const at = (x: number) => ({ x, y: 0, z: 0 })

function filled() {
  const s = new ChunkScheduler<string>()
  s.invalidate('far', at(100), 'far')
  s.invalidate('near', at(10), 'near')
  s.invalidate('mid', at(50), 'mid')
  return s
}

describe('ChunkScheduler', () => {
  it('hands out the nearest pending chunk first', () => {
    const s = filled()
    expect([s.take(at(0)), s.take(at(0)), s.take(at(0))].map((c) => c!.key)).toEqual(['near', 'mid', 'far'])
    expect(s.take(at(0))).toBeNull()
  })

  it('re-sorts when the camera moves', () => {
    const s = filled()
    expect(s.take(at(0))!.key).toBe('near')
    expect(s.take(at(100))!.key).toBe('far')
  })

  it('makes running jobs stale when a chunk is invalidated again', () => {
    const s = filled()
    const job = s.take(at(0))!
    expect(s.isCurrent(job.key, job.version)).toBe(true)
    s.invalidate('near', at(10), 'near again')
    expect(s.isCurrent(job.key, job.version)).toBe(false)
    const again = s.take(at(0))!
    expect(again).toMatchObject({ key: 'near', payload: 'near again' })
    expect(s.isCurrent(again.key, again.version)).toBe(true)
  })

  it('queues a chunk once however often it is invalidated', () => {
    const s = new ChunkScheduler<number>()
    s.invalidate('a', at(1), 1)
    s.invalidate('a', at(1), 2)
    expect(s.pendingCount).toBe(1)
    expect(s.take(at(0))!.payload).toBe(2)
    expect(s.take(at(0))).toBeNull()
  })

  it('drops removed chunks and makes their jobs stale', () => {
    const s = filled()
    const job = s.take(at(0))!
    s.remove('near')
    s.remove('mid')
    expect(s.isCurrent(job.key, job.version)).toBe(false)
    expect(s.take(at(0))!.key).toBe('far')
  })

  it('takes pending chunks out of the queue by payload, leaving running jobs current', () => {
    const s = filled()
    const running = s.take(at(0))! // near
    expect(s.unqueueWhere(() => true).map((r) => r.key).sort()).toEqual(['far', 'mid'])
    expect(s.pendingCount).toBe(0)
    expect(s.take(at(0))).toBeNull()
    expect(s.isCurrent(running.key, running.version)).toBe(true)
    s.invalidate('mid', at(50), 'mid')
    expect(s.take(at(0))!.key).toBe('mid')
  })

  it('clears everything', () => {
    const s = filled()
    s.clear()
    expect(s.pendingCount).toBe(0)
    expect(s.take(at(0))).toBeNull()
  })
})
