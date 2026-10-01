import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChunkCoord } from '../../../src/core/edit/events'
import type { ChunkPass } from '../../../src/render/chunks/coords'
import { ChunkManager, type ChunkView, type Mesher } from '../../../src/render/chunks/manager'
import type { ChunkMeshes } from '../../../src/render/mesh/types'
import type { MeshJob } from '../../../src/render/workers/protocol'
import { makeSchematic } from '../../helpers/model'

const MESHES: ChunkMeshes = { opaque: null, transparent: null, faded: null }

class FakeView implements ChunkView {
  shown = new Map<string, ChunkPass>()
  failed = new Set<string>()
  log: string[] = []
  set(key: string, _r: number, _c: ChunkCoord, pass: ChunkPass) {
    this.shown.set(key, pass)
    this.failed.delete(key)
    this.log.push(`set ${key}`)
  }
  delete(key: string) {
    this.shown.delete(key)
    this.failed.delete(key)
    this.log.push(`delete ${key}`)
  }
  fail(key: string) {
    this.failed.add(key)
    this.log.push(`fail ${key}`)
  }
  clear() {
    this.shown.clear()
    this.failed.clear()
    this.log.push('clear')
  }
}

interface Call { job: MeshJob; resolve: (m: ChunkMeshes) => void; reject: (e: Error) => void }

class FakeMesher implements Mesher {
  calls: Call[] = []
  constructor(readonly size = 1) {}
  mesh(job: MeshJob): Promise<ChunkMeshes> {
    return new Promise((resolve, reject) => this.calls.push({ job, resolve, reject }))
  }
  /** Resolves every outstanding call. */
  async finishAll(): Promise<void> {
    for (const c of this.calls.splice(0)) c.resolve(MESHES)
    await Promise.resolve()
    await Promise.resolve()
  }
}

/** 32 × 32 × 16 region of stone: chunks (0,0,0) and (1,0,0) along x, (0,0,1), (1,0,1) along z. */
function stoneSchematic(size: [number, number, number] = [32, 16, 32]) {
  const volume = size[0] * size[1] * size[2]
  return makeSchematic([{ size, palette: ['minecraft:air', 'minecraft:stone'], blocks: new Array<number>(volume).fill(1) }])
}

const origin = { x: 0, y: 0, z: 0 }

/** Pumps and finishes jobs until the queue is empty; returns the chunk keys meshed, in order. */
async function drain(manager: ChunkManager, mesher: FakeMesher, view: FakeView, camera = origin): Promise<string[]> {
  const before = view.log.length
  for (let i = 0; i < 100; i++) {
    manager.pump(camera)
    if (mesher.calls.length === 0) break
    await mesher.finishAll()
  }
  return view.log.slice(before).filter((l) => l.startsWith('set ')).map((l) => l.slice(4))
}

function setup(size = 1) {
  const view = new FakeView()
  const mesher = new FakeMesher(size)
  const manager = new ChunkManager(view, mesher)
  return { view, mesher, manager }
}

afterEach(() => vi.restoreAllMocks())

describe('ChunkManager', () => {
  it('meshes every chunk, nearest to the camera first', async () => {
    const { view, mesher, manager } = setup()
    manager.setSchematic(stoneSchematic())
    expect(manager.stats).toMatchObject({ total: 4, queued: 4 })
    const order = await drain(manager, mesher, view, { x: 40, y: 0, z: 40 })
    expect(order[0]).toBe('0/1,0,1/main')
    expect(order.at(-1)).toBe('0/0,0,0/main')
    expect(view.shown.size).toBe(4)
    expect(manager.stats).toMatchObject({ queued: 0, meshing: 0 })
  })

  it('keeps at most twice the pool size of jobs in flight', () => {
    const { mesher, manager } = setup(1)
    manager.setSchematic(stoneSchematic())
    manager.pump(origin)
    expect(mesher.calls).toHaveLength(2)
    expect(manager.stats.meshing).toBe(2)
  })

  it('skips the workers for chunks with nothing visible', () => {
    const { view, mesher, manager } = setup()
    manager.setSchematic(makeSchematic([{ size: [16, 16, 16], palette: ['minecraft:air'] }]))
    manager.pump(origin)
    expect(mesher.calls).toHaveLength(0)
    expect(view.log).toContain('delete 0/0,0,0/main')
  })

  it('passes the render mode and switches it by remeshing everything', async () => {
    const { view, mesher, manager } = setup(4)
    manager.setSchematic(stoneSchematic())
    manager.pump(origin)
    expect(mesher.calls.every((c) => c.job.mode === 'colored')).toBe(true)
    await drain(manager, mesher, view)
    manager.setMode('textured')
    manager.pump(origin)
    expect(mesher.calls).toHaveLength(4)
    expect(mesher.calls.every((c) => c.job.mode === 'textured')).toBe(true)
  })

  it('remeshes only the chunks an edit touched', async () => {
    const { view, mesher, manager } = setup()
    manager.setSchematic(stoneSchematic())
    await drain(manager, mesher, view)
    manager.applyChanges([{ regionId: 0, dirtyChunks: [{ cx: 1, cy: 0, cz: 0 }] }])
    expect(await drain(manager, mesher, view)).toEqual(['0/1,0,0/main'])
  })

  it('remeshes the chunks holding a changed palette slot', async () => {
    const { view, mesher, manager } = setup()
    const s = makeSchematic([{ size: [32, 1, 1], palette: ['minecraft:air', 'minecraft:stone', 'minecraft:dirt'], blocks: [...new Array<number>(20).fill(1), ...new Array<number>(12).fill(2)] }])
    manager.setSchematic(s)
    await drain(manager, mesher, view)
    manager.applyChanges([{ regionId: 0, paletteChange: { slots: [2] } }])
    expect(await drain(manager, mesher, view)).toEqual(['0/1,0,0/main'])
  })

  it('ignores results that an edit made stale', async () => {
    const { view, mesher, manager } = setup()
    manager.setSchematic(stoneSchematic([16, 16, 16]))
    manager.pump(origin)
    const first = mesher.calls.shift()!
    manager.applyChanges([{ regionId: 0, dirtyChunks: [{ cx: 0, cy: 0, cz: 0 }] }])
    first.resolve(MESHES)
    await Promise.resolve()
    expect(view.shown.size).toBe(0)
    expect(await drain(manager, mesher, view)).toEqual(['0/0,0,0/main'])
  })

  it('replacing the schematic while a job is in flight drops the old result (success)', async () => {
    const { view, mesher, manager } = setup()
    manager.setSchematic(stoneSchematic([16, 16, 16]))
    manager.pump(origin)
    const stale = mesher.calls.shift()!
    manager.setSchematic(makeSchematic([{ size: [16, 16, 16], palette: ['minecraft:air'] }]))
    manager.pump(origin)
    expect(view.log).toContain('delete 0/0,0,0/main')
    stale.resolve(MESHES)
    await Promise.resolve()
    await Promise.resolve()
    expect(view.shown.size).toBe(0)
  })

  it('replacing the schematic while a job is in flight drops the old result (failure)', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { view, mesher, manager } = setup()
    manager.setSchematic(stoneSchematic([16, 16, 16]))
    manager.pump(origin)
    const stale = mesher.calls.shift()!
    manager.setSchematic(makeSchematic([{ size: [16, 16, 16], palette: ['minecraft:air'] }]))
    manager.pump(origin)
    stale.reject(new Error('stale failure'))
    await Promise.resolve()
    await Promise.resolve()
    expect(view.failed.has('0/0,0,0/main')).toBe(false)
    expect(manager.stats.failed).toBe(0)
    expect(error).not.toHaveBeenCalled()
  })

  it('marks failed chunks and keeps rendering the rest', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { view, mesher, manager } = setup()
    manager.setSchematic(stoneSchematic())
    manager.pump(origin)
    mesher.calls.shift()!.reject(new Error('out of memory'))
    await Promise.resolve()
    expect(view.failed.has('0/0,0,0/main')).toBe(true)
    expect(manager.stats.failed).toBe(1)
    expect(error).toHaveBeenCalled()
    await drain(manager, mesher, view)
    expect(view.shown.size).toBe(3)
  })

  describe('layer view', () => {
    // 16 × 48 × 16: rows cy = 0, 1, 2.
    const tall = () => stoneSchematic([16, 48, 16])

    it('passes the visible range to the mesher and remeshes only boundary rows', async () => {
      const { view, mesher, manager } = setup(4)
      manager.setSchematic(tall())
      await drain(manager, mesher, view)
      manager.setLayerRange({ minY: 0, maxY: 20 })
      expect(view.log.at(-1)).toBe('delete 0/0,2,0/main') // row 2 has nothing visible
      manager.pump(origin)
      expect(mesher.calls.map((c) => c.job.slice.size.y)).toEqual([16]) // only row 1 remeshes
      const cells = mesher.calls[0]!.job.slice.cells
      const layer = 18 * 18
      // Row 1 covers y = 16..31: y = 20 (local 4) is the last visible layer; padded rows are offset by one.
      expect(cells[(4 + 1) * layer + 1 * 18 + 1]).toBe(1)
      expect(cells[(5 + 1) * layer + 1 * 18 + 1]).toBe(0)
    })

    it('draws the layer below as a ghost in single-layer mode', async () => {
      const { view, mesher, manager } = setup(4)
      manager.setSchematic(tall())
      await drain(manager, mesher, view)
      manager.setLayerRange({ minY: 20, maxY: 20 })
      const meshed = await drain(manager, mesher, view)
      expect(meshed.sort()).toEqual(['0/0,1,0/ghost', '0/0,1,0/main'])
      expect([...view.shown.keys()].sort()).toEqual(['0/0,1,0/ghost', '0/0,1,0/main'])
      manager.setLayerRange(null)
      expect(view.shown.has('0/0,1,0/ghost')).toBe(false)
    })

    it('has no ghost below the lowest layer', async () => {
      const { view, mesher, manager } = setup(4)
      manager.setSchematic(tall())
      manager.setLayerRange({ minY: 0, maxY: 0 })
      expect((await drain(manager, mesher, view)).filter((k) => k.endsWith('/ghost'))).toEqual([])
    })

    it('remeshes ghost chunks when an edit touches them', async () => {
      const { view, mesher, manager } = setup(4)
      manager.setSchematic(tall())
      manager.setLayerRange({ minY: 20, maxY: 20 })
      await drain(manager, mesher, view)
      manager.applyChanges([{ regionId: 0, dirtyChunks: [{ cx: 0, cy: 1, cz: 0 }] }])
      expect((await drain(manager, mesher, view)).sort()).toEqual(['0/0,1,0/ghost', '0/0,1,0/main'])
    })

    it('counts only main-pass chunks in stats.queued, even with a ghost pass pending', () => {
      const { manager } = setup()
      manager.setSchematic(stoneSchematic([16, 16, 16]))
      manager.setLayerRange({ minY: 5, maxY: 5 })
      expect(manager.stats).toMatchObject({ total: 1, queued: 1 })
    })
  })

  it('fades blocks outside the highlight set', async () => {
    const { view, mesher, manager } = setup()
    manager.setSchematic(stoneSchematic([16, 16, 16]))
    await drain(manager, mesher, view)
    manager.setHighlight(['minecraft:dirt'])
    manager.pump(origin)
    expect(Array.from(mesher.calls[0]!.job.slice.faded!)).toEqual([0, 1])
    await drain(manager, mesher, view)
    manager.setHighlight(null)
    manager.pump(origin)
    expect(mesher.calls[0]!.job.slice.faded).toBeNull()
  })

  it('does not mesh hidden regions until they are shown', async () => {
    const { view, mesher, manager } = setup()
    manager.setSchematic(stoneSchematic())
    manager.setRegionVisible(0, false)
    manager.pump(origin)
    expect(mesher.calls).toHaveLength(0)
    expect(manager.stats.queued).toBe(4)
    manager.setRegionVisible(0, true)
    expect(await drain(manager, mesher, view)).toHaveLength(4)
  })

  it('remeshes edits made while a region was hidden once it is shown', async () => {
    const { view, mesher, manager } = setup()
    manager.setSchematic(stoneSchematic())
    await drain(manager, mesher, view)
    manager.setRegionVisible(0, false)
    manager.applyChanges([{ regionId: 0, dirtyChunks: [{ cx: 1, cy: 0, cz: 1 }] }])
    manager.pump(origin)
    expect(mesher.calls).toHaveLength(0)
    manager.setRegionVisible(0, true)
    expect(await drain(manager, mesher, view)).toEqual(['0/1,0,1/main'])
  })

  it('clears the view when the schematic is replaced', () => {
    const { view, manager } = setup()
    manager.setSchematic(stoneSchematic())
    manager.setSchematic(null)
    expect(view.log.at(-1)).toBe('clear')
    expect(manager.stats).toEqual({ total: 0, queued: 0, meshing: 0, failed: 0 })
  })
})
