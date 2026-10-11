import { describe, expect, it } from 'vitest'
import { Editor } from '../../src/core/edit/editor'
import { bundledRegistry } from '../../src/core/registry'
import { noticesFor } from '../../src/ui/app/notices'
import { initialState, type AppState } from '../../src/ui/app/state'
import { idleStatus } from '../helpers/fakeRenderer'
import { makeSchematic } from '../helpers/model'

const schematic = makeSchematic([{ size: [1, 1, 1], palette: ['minecraft:stone'] }])
const doc = { schematic, editor: new Editor(schematic, bundledRegistry()), fileName: 'a.litematic', revision: 0 }
const state = (patch: Partial<AppState>): AppState => ({ ...initialState, doc, render: idleStatus(), ...patch })
const kinds = (s: AppState) => noticesFor(s).map((n) => n.kind)

describe('noticesFor', () => {
  it('shows nothing for a healthy view', () => {
    expect(noticesFor(state({}))).toEqual([])
  })

  it('reports an asset failure with a retry action that cannot be dismissed', () => {
    const [n] = noticesFor(state({ render: idleStatus({ mode: 'colored', assets: { state: 'failed', message: 'HTTP 503' } }) }))
    expect(n).toMatchObject({ kind: 'assets-failed', tone: 'error', action: { run: 'retry-assets' } })
    expect(n!.dismiss).toBeUndefined()
    expect(n!.message).toContain('HTTP 503')
  })

  it('warns about a file newer than every known version', () => {
    const s = state({ render: idleStatus({ assets: { state: 'ready', version: '26.3', exact: false, newerThanKnown: true } }) })
    expect(noticesFor(s)[0]!.message).toContain('26.3')
    expect(kinds({ ...s, dismissed: ['newer-version'] })).toEqual([])
  })

  it('suggests colored mode for regions over 5M blocks, only while textured', () => {
    expect(noticesFor(state({ render: idleStatus({ suggestColored: true }) }))[0]).toMatchObject({ kind: 'suggest-colored', action: { run: 'use-colored' } })
    expect(kinds(state({ render: idleStatus({ suggestColored: true, mode: 'colored' }) }))).toEqual([])
    expect(kinds(state({ render: idleStatus({ suggestColored: true }), dismissed: ['suggest-colored'] }))).toEqual([])
  })

  it('reports chunks that failed to mesh', () => {
    const s = state({ render: idleStatus({ chunks: { total: 10, queued: 0, parked: 0, meshing: 0, failed: 2 } }) })
    expect(noticesFor(s)[0]!.message).toBe('2 chunks could not be drawn and are outlined in red. The browser console has the error.')
  })

  it('warns after an edit that cannot be undone', () => {
    expect(kinds(state({ lastEdit: { message: 'Replaced 9 blocks.', undoable: false } }))).toEqual(['not-undoable'])
    expect(kinds(state({ lastEdit: { message: 'Replaced 9 blocks.', undoable: true } }))).toEqual([])
  })

  it('shows no render notices without a schematic', () => {
    expect(kinds({ ...initialState, render: idleStatus({ suggestColored: true }) })).toEqual([])
  })
})
