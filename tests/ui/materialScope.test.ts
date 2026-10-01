import { describe, expect, it } from 'vitest'
import { materialScopes } from '../../src/ui/logic/materialScope'

const view = { regionCount: 3, hiddenRegions: [] as number[], layerRange: null, selection: null }
const box = { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } }

describe('materialScopes', () => {
  it('counts everything for the whole schematic', () => {
    expect(materialScopes('all', { ...view, hiddenRegions: [1], layerRange: { minY: 0, maxY: 0 } })).toEqual([])
  })

  it('limits visible layers to the layer range and the regions not hidden', () => {
    expect(materialScopes('visible', view)).toEqual([])
    expect(materialScopes('visible', { ...view, hiddenRegions: [1], layerRange: { minY: 2, maxY: 5 } })).toEqual([
      { kind: 'regions', regionIds: [0, 2] },
      { kind: 'yRange', minY: 2, maxY: 5 },
    ])
  })

  it('uses the box selection, or nothing without one', () => {
    expect(materialScopes('box', view)).toBeNull()
    expect(materialScopes('box', { ...view, selection: box })).toEqual([{ kind: 'box', box }])
  })
})
