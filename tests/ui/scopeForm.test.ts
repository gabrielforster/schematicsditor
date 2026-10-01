import { describe, expect, it } from 'vitest'
import { emptyScopeForm, scopesFromForm } from '../../src/ui/logic/scopeForm'

const box = { min: { x: 0, y: 0, z: 0 }, max: { x: 2, y: 2, z: 2 } }

describe('scopesFromForm', () => {
  it('is the whole schematic when nothing is checked', () => {
    expect(scopesFromForm(emptyScopeForm, box)).toEqual({ scopes: [] })
  })

  it('combines every checked scope', () => {
    const form = {
      regions: { on: true, ids: [1] },
      yRange: { on: true, minY: '-2', maxY: '5' },
      box: { on: true },
    }
    expect(scopesFromForm(form, box)).toEqual({ scopes: [
      { kind: 'regions', regionIds: [1] },
      { kind: 'yRange', minY: -2, maxY: 5 },
      { kind: 'box', box },
    ] })
  })

  it('ignores unchecked scopes even when filled in', () => {
    expect(scopesFromForm({ ...emptyScopeForm, yRange: { on: false, minY: 'x', maxY: '' } }, null)).toEqual({ scopes: [] })
  })

  it('explains incomplete checked scopes', () => {
    expect(scopesFromForm({ ...emptyScopeForm, regions: { on: true, ids: [] } }, null)).toEqual({ error: 'Pick at least one region.' })
    expect(scopesFromForm({ ...emptyScopeForm, yRange: { on: true, minY: '1.5', maxY: '3' } }, null)).toEqual({ error: 'Enter whole numbers for the Y range.' })
    expect(scopesFromForm({ ...emptyScopeForm, box: { on: true } }, null)).toEqual({ error: 'Select a box in the left panel first.' })
  })
})
