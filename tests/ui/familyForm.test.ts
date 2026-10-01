import { describe, expect, it } from 'vitest'
import { bundledFamilies } from '../../src/core/families'
import { buildFamilySwap } from '../../src/ui/logic/familyForm'
import { emptyScopeForm } from '../../src/ui/logic/scopeForm'

const groups = bundledFamilies()

describe('buildFamilySwap', () => {
  it('waits until both families are chosen', () => {
    expect(buildFamilySwap({ sourceId: 'oak', targetId: '', scope: emptyScopeForm }, groups, null)).toEqual({ ok: false, error: null })
  })

  it('rejects swapping a family for itself', () => {
    expect(buildFamilySwap({ sourceId: 'oak', targetId: 'oak', scope: emptyScopeForm }, groups, null)).toEqual({ ok: false, error: 'Pick two different families.' })
  })

  it('returns both families and the scopes', () => {
    const built = buildFamilySwap({ sourceId: 'oak', targetId: 'white', scope: { ...emptyScopeForm, yRange: { on: true, minY: '0', maxY: '3' } } }, groups, null)
    expect(built).toMatchObject({ ok: true, source: { id: 'oak' }, target: { id: 'white' }, scopes: [{ kind: 'yRange', minY: 0, maxY: 3 }] })
  })

  it('reports an incomplete scope', () => {
    expect(buildFamilySwap({ sourceId: 'oak', targetId: 'spruce', scope: { ...emptyScopeForm, box: { on: true } } }, groups, null))
      .toEqual({ ok: false, error: 'Select a box in the left panel first.' })
  })
})
