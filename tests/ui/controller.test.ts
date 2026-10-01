import { describe, expect, it } from 'vitest'
import { parseMatcher } from '../../src/core/edit/matchers'
import { bundledRegistry } from '../../src/core/registry'
import { findFamily } from '../../src/core/families'
import { AppController } from '../../src/ui/app/controller'
import { ParseFailure } from '../../src/workers/parseClient'
import { SaveFailure } from '../../src/workers/saveClient'
import { FakeRenderer, idleStatus } from '../helpers/fakeRenderer'
import { fakeFile, fakeServices, parsesTo } from '../helpers/fakeServices'
import { blockKeys, makeSchematic } from '../helpers/model'

const registry = bundledRegistry()
const sample = () => makeSchematic([{ size: [2, 1, 1], palette: ['minecraft:stone', 'minecraft:oak_planks'], blocks: [0, 1] }])

function setup(options: ConstructorParameters<typeof AppController>[1] = {}, services = fakeServices({ parse: parsesTo(sample()) })) {
  const controller = new AppController(services, options)
  const renderer = new FakeRenderer()
  controller.attachRenderer(renderer)
  return { controller, renderer, services }
}

async function opened(options: ConstructorParameters<typeof AppController>[1] = {}) {
  const t = setup(options)
  await t.controller.openFile(fakeFile('castle.litematic'))
  return { ...t, doc: t.controller.state.doc! }
}

/** A promise with its resolve/reject exposed. */
function deferred<T>() {
  let resolve!: (v: T) => void, reject!: (e: unknown) => void
  const promise = new Promise<T>((a, b) => { resolve = a; reject = b })
  return { promise, resolve, reject }
}

describe('AppController.openFile', () => {
  it('opens a schematic with an editor and hands both to the renderer', async () => {
    const { controller, renderer, doc } = await opened()
    expect(doc.fileName).toBe('castle.litematic')
    expect(renderer.loaded?.schematic).toBe(doc.schematic)
    expect(renderer.loaded?.editor).toBe(doc.editor)
    expect(controller.state.busy).toBeNull()
  })

  it('shows busy while parsing', async () => {
    const parse = deferred<ReturnType<typeof sample>>()
    const { controller } = setup({}, fakeServices({ parse: () => parse.promise }))
    const job = controller.openFile(fakeFile('castle.litematic'))
    await Promise.resolve()
    expect(controller.state.busy).toEqual({ kind: 'open', label: 'Opening castle.litematic…' })
    parse.resolve(sample())
    await job
    expect(controller.state.busy).toBeNull()
  })

  it('keeps the current schematic open and shows a friendly error with details when parsing fails', async () => {
    const { controller, services, doc } = await opened()
    services.parse = async () => {
      throw new ParseFailure({ code: 'not-nbt', message: 'This file is not a valid NBT file.', details: 'stack…' })
    }
    await controller.openFile(fakeFile('photo.png'))
    expect(controller.state.doc).toBe(doc)
    expect(controller.state.error).toEqual({
      title: 'Not a Litematica file',
      message: 'This file is not a valid NBT file. Only .litematic files from the Litematica mod can be opened.',
      details: 'stack…',
    })
  })

  it('asks before reading a very large file and does nothing when declined', async () => {
    let parsed = 0
    const { controller } = setup({ largeFileBytes: 1000 }, fakeServices({ parse: async () => { parsed++; return sample() } }))
    const job = controller.openFile(fakeFile('huge.litematic', 5 * 1024 * 1024))
    await Promise.resolve()
    expect(controller.state.confirm).toMatchObject({ title: 'Very large file', confirmLabel: 'Open anyway' })
    controller.answerConfirm(false)
    await job
    expect(parsed).toBe(0)
    expect(controller.state.doc).toBeNull()
  })

  it('opens a very large file after the user confirms', async () => {
    const { controller } = setup({ largeFileBytes: 1000 })
    const job = controller.openFile(fakeFile('huge.litematic', 2000))
    await Promise.resolve()
    controller.answerConfirm(true)
    await job
    expect(controller.state.doc?.fileName).toBe('huge.litematic')
  })

  it('asks before showing a schematic whose volume is very large', async () => {
    const { controller, renderer } = setup({ largeVolume: 1 })
    const job = controller.openFile(fakeFile('wide.litematic'))
    await new Promise((r) => setTimeout(r, 0))
    expect(controller.state.confirm?.title).toBe('Very large schematic')
    expect(controller.state.confirm?.message).toContain('2 blocks')
    controller.answerConfirm(false)
    await job
    expect(controller.state.doc).toBeNull()
    expect(renderer.loaded).toBeNull()
  })

  it('lets the later of two overlapping opens win', async () => {
    const first = deferred<ReturnType<typeof sample>>()
    const second = sample()
    const parses = [() => first.promise, async () => second]
    const { controller } = setup({}, fakeServices({ parse: () => parses.shift()!() }))
    const a = controller.openFile(fakeFile('a.litematic'))
    await controller.openFile(fakeFile('b.litematic'))
    first.resolve(sample())
    await a
    expect(controller.state.doc?.fileName).toBe('b.litematic')
    expect(controller.state.doc?.schematic).toBe(second)
  })

  it('clears busy once an earlier open finishes, even though a later open declined its own confirm first', async () => {
    const first = deferred<ReturnType<typeof sample>>()
    const { controller } = setup({ largeFileBytes: 1000 }, fakeServices({ parse: () => first.promise }))
    const jobA = controller.openFile(fakeFile('a.litematic', 10))
    await Promise.resolve()
    expect(controller.state.busy).toEqual({ kind: 'open', label: 'Opening a.litematic…' })
    const jobB = controller.openFile(fakeFile('huge.litematic', 5 * 1024 * 1024))
    await Promise.resolve()
    expect(controller.state.confirm).toMatchObject({ title: 'Very large file' })
    controller.answerConfirm(false)
    await jobB
    // B never reached its own busy-setting step (its confirm was declined first),
    // so A's busy is still correctly shown: A really is still in flight.
    expect(controller.state.busy).toEqual({ kind: 'open', label: 'Opening a.litematic…' })
    first.resolve(sample())
    await jobA
    // A's own completion must still clear the busy it set, even though B's
    // token now makes A the stale one (so A does not get to show its doc).
    expect(controller.state.busy).toBeNull()
    expect(controller.state.doc).toBeNull()
  })

  it('clears busy cleanly when a later opens volume confirm is declined', async () => {
    const first = deferred<ReturnType<typeof sample>>()
    const parses = [() => first.promise, async () => sample()]
    const { controller } = setup({ largeVolume: 1 }, fakeServices({ parse: () => parses.shift()!() }))
    const jobA = controller.openFile(fakeFile('a.litematic'))
    expect(controller.state.busy).toEqual({ kind: 'open', label: 'Opening a.litematic…' })
    const jobB = controller.openFile(fakeFile('b.litematic'))
    await new Promise((r) => setTimeout(r, 0))
    expect(controller.state.confirm).toMatchObject({ title: 'Very large schematic' })
    expect(controller.state.busy).toBeNull()
    controller.answerConfirm(false)
    await jobB
    expect(controller.state.busy).toBeNull()
    expect(controller.state.doc).toBeNull()
    first.resolve(sample())
    await jobA
    expect(controller.state.busy).toBeNull()
    expect(controller.state.doc).toBeNull()
  })

  it('resets view state for the new schematic', async () => {
    const { controller } = await opened()
    controller.setRegionVisible(0, false)
    controller.setLayerRange({ minY: 1, maxY: 2 })
    controller.setHighlight({ key: 'minecraft:stone', blocks: ['minecraft:stone'] })
    await controller.openFile(fakeFile('other.litematic'))
    expect(controller.state).toMatchObject({ hiddenRegions: [], layerRange: null, highlight: null, selection: null })
  })

  it('loads an already open schematic into a renderer attached later', async () => {
    const controller = new AppController(fakeServices({ parse: parsesTo(sample()) }))
    await controller.openFile(fakeFile('castle.litematic'))
    const renderer = new FakeRenderer()
    controller.attachRenderer(renderer)
    expect(renderer.loaded?.schematic).toBe(controller.state.doc!.schematic)
  })
})

describe('AppController.save', () => {
  it('downloads <name>.litematic from the metadata name', async () => {
    const { controller, services, doc } = await opened()
    doc.schematic.metadata.name = 'My Castle'
    await controller.save()
    expect(services.downloads).toEqual([{ data: new Uint8Array([1, 2, 3]), fileName: 'My Castle.litematic', mimeType: 'application/octet-stream' }])
  })

  it('blocks the download and shows the round-trip error, keeping the schematic open', async () => {
    const { controller, services, doc } = await opened()
    services.save = async () => {
      throw new SaveFailure('round-trip', 'The saved file would not load back as this schematic, so it was not downloaded.', 'region count: 2 ≠ 1')
    }
    await controller.save()
    expect(services.downloads).toEqual([])
    expect(controller.state.doc).toBe(doc)
    expect(controller.state.error).toMatchObject({ title: 'Save blocked', details: 'region count: 2 ≠ 1' })
    expect(controller.state.busy).toBeNull()
  })

  it('does not let an overlapping open and save clear each others busy', async () => {
    const { controller, services } = await opened()
    const savePending = deferred<Uint8Array>()
    services.save = () => savePending.promise
    // Keeps the overlapping open pending under our control, so the test does
    // not race the two promise chains against each other.
    const openPending = deferred<ReturnType<typeof sample>>()
    services.parse = () => openPending.promise
    const saveJob = controller.save()
    expect(controller.state.busy).toEqual({ kind: 'save', label: 'Saving…' })
    const openJob = controller.openFile(fakeFile('other.litematic'))
    expect(controller.state.busy).toEqual({ kind: 'open', label: 'Opening other.litematic…' })
    savePending.resolve(new Uint8Array([9]))
    await saveJob
    // The save's completion must not clear the still-in-flight open's busy.
    expect(controller.state.busy).toEqual({ kind: 'open', label: 'Opening other.litematic…' })
    openPending.resolve(sample())
    await openJob
    expect(controller.state.busy).toBeNull()
  })

  it('ignores a second save while one is running', async () => {
    const pending = deferred<Uint8Array>()
    let saves = 0
    const { controller, services } = await opened()
    services.save = () => { saves++; return pending.promise }
    const job = controller.save()
    await controller.save()
    pending.resolve(new Uint8Array([9]))
    await job
    expect(saves).toBe(1)
    expect(services.downloads).toHaveLength(1)
  })

  it('does nothing without a schematic', async () => {
    const { controller, services } = setup()
    await controller.save()
    expect(services.downloads).toEqual([])
  })
})

describe('AppController edits', () => {
  const stoneToAndesite = () => [{ from: [parseMatcher('stone', registry)], to: { name: 'minecraft:andesite' } }]

  it('replaces, bumps the revision and reports the count', async () => {
    const { controller, doc } = await opened()
    const result = controller.replace(stoneToAndesite(), [])
    expect(result?.count).toBe(1)
    expect(blockKeys(doc.schematic.regions[0]!)).toEqual(['minecraft:andesite', 'minecraft:oak_planks'])
    expect(controller.state.doc!.revision).toBe(1)
    expect(controller.state.lastEdit).toEqual({ message: 'Replaced 1 block.', undoable: true })
  })

  it('undoes and redoes, bumping the revision each time', async () => {
    const { controller, doc } = await opened()
    controller.replace(stoneToAndesite(), [])
    controller.undo()
    expect(blockKeys(doc.schematic.regions[0]!)[0]).toBe('minecraft:stone')
    controller.redo()
    expect(blockKeys(doc.schematic.regions[0]!)[0]).toBe('minecraft:andesite')
    expect(controller.state.doc!.revision).toBe(3)
  })

  it('deletes by replacing with air', async () => {
    const { controller, doc } = await opened()
    expect(controller.delete([parseMatcher('stone', registry)], [])?.count).toBe(1)
    expect(blockKeys(doc.schematic.regions[0]!)[0]).toBe('minecraft:air')
    expect(controller.state.lastEdit?.message).toBe('Deleted 1 block.')
  })

  it('swaps families as one edit', async () => {
    const { controller, doc } = await opened()
    const families = controller.services.families
    controller.familySwap(findFamily(families, 'oak')!, findFamily(families, 'spruce')!, [])
    expect(blockKeys(doc.schematic.regions[0]!)[1]).toBe('minecraft:spruce_planks')
    expect(controller.state.lastEdit?.message).toBe('Swapped 1 block from Oak to Spruce.')
  })

  it('shows an edit error instead of throwing', async () => {
    const { controller } = await opened()
    expect(controller.replace([{ from: [parseMatcher('stone', registry)], to: { name: 'minecraft:nope' } }], [])).toBeNull()
    expect(controller.state.error).toEqual({ title: 'Edit not applied', message: 'Unknown block: minecraft:nope' })
  })

  it('records a not-undoable edit', async () => {
    const { controller } = await opened({ historyCapBytes: 0 })
    controller.replace(stoneToAndesite(), [])
    expect(controller.state.lastEdit).toEqual({ message: 'Replaced 1 block.', undoable: false })
  })

  it('sets metadata and bumps the revision', async () => {
    const { controller, doc } = await opened()
    controller.setMetadata({ name: 'Keep', author: 'Alex' })
    expect(doc.schematic.metadata).toMatchObject({ name: 'Keep', author: 'Alex' })
    expect(controller.state.doc!.revision).toBe(1)
    controller.setMetadata({ name: 'Keep' })
    expect(controller.state.doc!.revision).toBe(1)
  })

  it('shows an error for metadata too long for NBT', async () => {
    const { controller } = await opened()
    controller.setMetadata({ name: 'é'.repeat(40000) })
    expect(controller.state.error?.title).toBe('Edit not applied')
  })

  it('caches region stats per revision', async () => {
    const { controller } = await opened()
    const a = controller.regionStats()
    expect(a).toEqual([{ blocks: 2, volume: 2 }])
    expect(controller.regionStats()).toBe(a)
    controller.delete([parseMatcher('stone', registry)], [])
    expect(controller.regionStats()).toEqual([{ blocks: 1, volume: 2 }])
  })
})

describe('AppController view state', () => {
  it('mirrors renderer status, hover and selection events', async () => {
    const { controller, renderer } = await opened()
    renderer.emit('status', idleStatus({ suggestColored: true }))
    expect(controller.state.render?.suggestColored).toBe(true)
    const hit = { regionId: 0, regionName: 'r', local: { x: 0, y: 0, z: 0 }, world: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, state: 'minecraft:stone', distance: 1 }
    renderer.emit('hover', hit)
    expect(controller.state.hover).toBe(hit)
    const box = { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 0, z: 0 } }
    renderer.emit('selection', box)
    expect(controller.state.selection).toBe(box)
  })

  it('turns Alt+click into an eyedropper pick for the Replace tab', async () => {
    const { controller, renderer } = await opened()
    const hit = { regionId: 0, regionName: 'r', local: { x: 0, y: 0, z: 0 }, world: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, state: 'minecraft:oak_stairs[facing=north,half=top,shape=straight,waterlogged=false]', distance: 1 }
    renderer.emit('click', { hit, event: { altKey: false } as MouseEvent })
    expect(controller.state.picked).toBeNull()
    renderer.emit('click', { hit, event: { altKey: true } as MouseEvent })
    expect(controller.state.picked).toEqual({ state: hit.state, seq: 1 })
    expect(controller.state.tab).toBe('replace')
    renderer.emit('click', { hit, event: { altKey: true } as MouseEvent })
    expect(controller.state.picked?.seq).toBe(2)
  })

  it('does not eyedrop an alt+click that was used for box selection', async () => {
    const { controller, renderer } = await opened()
    const hit = { regionId: 0, regionName: 'r', local: { x: 0, y: 0, z: 0 }, world: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, state: 'minecraft:stone', distance: 1 }
    // First corner: still selecting, so the alt+click places a corner, not an eyedropper pick.
    controller.startBoxSelection()
    renderer.emit('click', { hit, event: { altKey: true } as MouseEvent })
    expect(controller.state.picked).toBeNull()
    expect(controller.state.selecting).toBe(true)
    // Second corner: selecting just turned off, but the selection handler consumed this click.
    renderer.selecting = false
    const box = { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } }
    renderer.emit('selection', box)
    renderer.emit('click', { hit, event: { altKey: true } as MouseEvent })
    expect(controller.state.picked).toBeNull()
    expect(controller.state.selection).toBe(box)
    // An ordinary alt+click, uninvolved in selection, still eyedrops.
    renderer.emit('click', { hit, event: { altKey: true } as MouseEvent })
    expect(controller.state.picked).toEqual({ state: hit.state, seq: 1 })
  })

  it('still eyedrops an alt+click after a programmatic selection update (e.g. a numeric bounds edit)', async () => {
    const { controller, renderer } = await opened()
    controller.setSelection({ min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 0, z: 0 } })
    expect(controller.state.selection).not.toBeNull()
    // The programmatic update's own 'selection' event is not followed by a
    // same-tick 'click', unlike a box-completing pointer click, so by the
    // time any later click actually happens the flag must already be clear.
    await Promise.resolve()
    const hit = { regionId: 0, regionName: 'r', local: { x: 0, y: 0, z: 0 }, world: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, state: 'minecraft:stone', distance: 1 }
    renderer.emit('click', { hit, event: { altKey: true } as MouseEvent })
    expect(controller.state.picked).toEqual({ state: hit.state, seq: 1 })
    expect(controller.state.tab).toBe('replace')
  })

  it('keeps the clamped layer range the renderer reports', async () => {
    const { controller, renderer } = await opened()
    controller.setLayerRange({ minY: -5, maxY: 3 })
    expect(controller.state.layerRange).toEqual({ minY: 0, maxY: 3 })
    controller.stepLayer(1)
    expect(controller.state.layerRange).toEqual({ minY: 1, maxY: 4 })
    controller.setLayerRange(null)
    expect(controller.state.layerRange).toBeNull()
    expect(renderer.calls).toContain('stepLayer:1')
  })

  it('tracks hidden regions', async () => {
    const { controller, renderer } = await opened()
    controller.setRegionVisible(0, false)
    expect(controller.state.hiddenRegions).toEqual([0])
    expect(renderer.hidden.has(0)).toBe(true)
    controller.setRegionVisible(0, true)
    expect(controller.state.hiddenRegions).toEqual([])
  })

  it('highlights a material row and clears it', async () => {
    const { controller, renderer } = await opened()
    controller.setHighlight({ key: 'minecraft:stone', blocks: ['minecraft:stone'] })
    expect(renderer.highlight).toEqual(['minecraft:stone'])
    controller.setHighlight(null)
    expect(renderer.highlight).toBeNull()
    expect(controller.state.highlight).toBeNull()
  })

  it('starts, cancels and sets the box selection', async () => {
    const { controller } = await opened()
    controller.startBoxSelection()
    expect(controller.state.selecting).toBe(true)
    controller.cancelBoxSelection()
    expect(controller.state.selecting).toBe(false)
    controller.setSelection({ min: { x: 3, y: 0, z: 0 }, max: { x: 1, y: 0, z: 0 } })
    expect(controller.state.selection).toEqual({ min: { x: 1, y: 0, z: 0 }, max: { x: 3, y: 0, z: 0 } })
  })

  it('stops listening to a detached renderer', async () => {
    const controller = new AppController(fakeServices())
    const renderer = new FakeRenderer()
    const detach = controller.attachRenderer(renderer)
    detach()
    renderer.emit('status', idleStatus({ suggestColored: true }))
    expect(controller.state.render?.suggestColored).toBe(false)
  })

  it('detaches a previously attached renderer when a new one is attached', async () => {
    const controller = new AppController(fakeServices())
    const first = new FakeRenderer()
    controller.attachRenderer(first)
    const second = new FakeRenderer()
    controller.attachRenderer(second)
    first.emit('status', idleStatus({ suggestColored: true }))
    expect(controller.state.render?.suggestColored).toBe(false)
    second.emit('status', idleStatus({ suggestColored: true }))
    expect(controller.state.render?.suggestColored).toBe(true)
  })
})

describe('AppController notices', () => {
  it('runs the use-colored notice action by switching render mode', async () => {
    const { controller, renderer } = await opened()
    controller.runNoticeAction('use-colored')
    expect(renderer.calls).toContain('setMode:colored')
  })

  it('runs the retry-assets notice action', async () => {
    const { controller, renderer } = await opened()
    controller.runNoticeAction('retry-assets')
    expect(renderer.calls).toContain('retryAssets')
  })

  it('retries assets directly on the renderer', async () => {
    const { controller, renderer } = await opened()
    controller.retryAssets()
    expect(renderer.calls).toContain('retryAssets')
  })

  it('dismisses a notice once, and resets dismissals when a new doc opens', async () => {
    const { controller } = await opened()
    controller.dismissNotice('suggest-colored')
    expect(controller.state.dismissed).toEqual(['suggest-colored'])
    controller.dismissNotice('suggest-colored')
    expect(controller.state.dismissed).toEqual(['suggest-colored'])
    controller.dismissNotice('chunks-failed')
    expect(controller.state.dismissed).toEqual(['suggest-colored', 'chunks-failed'])
    await controller.openFile(fakeFile('other.litematic'))
    expect(controller.state.dismissed).toEqual([])
  })
})
