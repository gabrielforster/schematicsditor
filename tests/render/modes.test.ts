import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LoadedAssets } from '../../src/render/assets/loader'
import { ModeController } from '../../src/render/modes'

function loaded(id = '26.3', newerThanKnown = false): LoadedAssets {
  return {
    choice: { version: { id, type: 'release', stable: true, data_version: 5023 }, exact: !newerThanKnown, newerThanKnown },
    assets: { version: id, blockDefinitionsJson: '{}', modelsJson: '{}', textures: {}, white: [0, 0, 1, 1] },
    atlas: { width: 1, height: 1, data: new Uint8Array(4) },
  }
}

function setup() {
  const calls: { dataVersion: number; resolve: (l: LoadedAssets) => void; reject: (e: Error) => void }[] = []
  const ready: LoadedAssets[] = []
  let changes = 0
  const c = new ModeController(
    (dataVersion) => new Promise((resolve, reject) => calls.push({ dataVersion, resolve, reject })),
    (l) => ready.push(l),
    () => changes++,
  )
  return { c, calls, ready, changes: () => changes }
}

const tick = () => new Promise((r) => setTimeout(r, 0))

afterEach(() => vi.restoreAllMocks())

describe('ModeController', () => {
  it('draws colored while textured assets load, then textured', async () => {
    const { c, calls, ready } = setup()
    c.setDataVersion(3465)
    expect(calls.map((x) => x.dataVersion)).toEqual([3465])
    expect(c.assets).toEqual({ state: 'loading' })
    expect(c.effectiveMode).toBe('colored')
    calls[0]!.resolve(loaded('1.20.1'))
    await tick()
    expect(c.assets).toEqual({ state: 'ready', version: '1.20.1', exact: true, newerThanKnown: false })
    expect(c.effectiveMode).toBe('textured')
    expect(ready).toHaveLength(1)
  })

  it('reports files newer than every known version', async () => {
    const { c, calls } = setup()
    c.setDataVersion(9999)
    calls[0]!.resolve(loaded('26.3', true))
    await tick()
    expect(c.assets).toMatchObject({ state: 'ready', newerThanKnown: true })
  })

  it('switches to colored on failure and loads again on retry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { c, calls } = setup()
    c.setDataVersion(5023)
    calls[0]!.reject(new Error('Could not load block textures: offline'))
    await tick()
    expect(c.mode).toBe('colored')
    expect(c.assets).toEqual({ state: 'failed', message: 'Could not load block textures: offline' })
    c.retry()
    expect(c.mode).toBe('textured')
    expect(calls).toHaveLength(2)
    calls[1]!.resolve(loaded())
    await tick()
    expect(c.effectiveMode).toBe('textured')
  })

  it('does not load anything in colored mode', () => {
    const { c, calls } = setup()
    c.setMode('colored')
    c.setDataVersion(5023)
    expect(calls).toHaveLength(0)
    expect(c.effectiveMode).toBe('colored')
    c.setMode('textured')
    expect(calls).toHaveLength(1)
  })

  it('reuses loaded assets for another file of the same version', async () => {
    const { c, calls } = setup()
    c.setDataVersion(5023)
    calls[0]!.resolve(loaded())
    await tick()
    c.setDataVersion(5023)
    expect(calls).toHaveLength(1)
    expect(c.effectiveMode).toBe('textured')
  })

  it('keeps loaded assets while no file is open', async () => {
    const { c, calls } = setup()
    c.setDataVersion(5023)
    calls[0]!.resolve(loaded())
    await tick()
    c.setDataVersion(null)
    c.setDataVersion(5023)
    expect(calls).toHaveLength(1)
    expect(c.effectiveMode).toBe('textured')
  })

  it('does not restart a load for the same version', () => {
    const { c, calls } = setup()
    c.setDataVersion(5023)
    c.setDataVersion(null)
    c.setDataVersion(5023)
    expect(calls).toHaveLength(1)
  })

  it('ignores a load that finishes after another file was opened', async () => {
    const { c, calls, ready } = setup()
    c.setDataVersion(3465)
    c.setDataVersion(5023)
    calls[0]!.resolve(loaded('1.20.1'))
    await tick()
    expect(ready).toHaveLength(0)
    expect(c.assets).toEqual({ state: 'loading' })
    calls[1]!.resolve(loaded('26.3'))
    await tick()
    expect(c.assets).toMatchObject({ state: 'ready', version: '26.3' })
  })

  it('notifies on every state change', async () => {
    const { c, calls, changes } = setup()
    c.setDataVersion(5023)
    calls[0]!.resolve(loaded())
    await tick()
    expect(changes()).toBe(2) // loading, then ready
  })
})
