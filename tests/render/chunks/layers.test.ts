import { describe, expect, it } from 'vitest'
import {
  clampLayerRange, ghostLayer, rowSignature, rowsToRemesh, schematicYBounds, stepLayerRange, toLocalRange,
} from '../../../src/render/chunks/layers'
import { makeSchematic } from '../../helpers/model'

describe('layer ranges', () => {
  const s = makeSchematic([
    { position: [0, -4, 0], size: [1, 10, 1], palette: ['minecraft:air'] },
    { position: [5, 20, 0], size: [1, 3, 1], palette: ['minecraft:air'] },
  ])
  const bounds = { minY: -4, maxY: 22 }

  it('spans all regions', () => {
    expect(schematicYBounds(s)).toEqual(bounds)
    expect(schematicYBounds(makeSchematic([]))).toBeNull()
  })

  it('orders and clamps the ends', () => {
    expect(clampLayerRange({ minY: 30, maxY: -10 }, bounds)).toEqual(bounds)
    expect(clampLayerRange({ minY: 3, maxY: 1 }, bounds)).toEqual({ minY: 1, maxY: 3 })
  })

  it('steps the whole range and stops at the bounds', () => {
    expect(stepLayerRange({ minY: 0, maxY: 2 }, 1, bounds)).toEqual({ minY: 1, maxY: 3 })
    expect(stepLayerRange({ minY: 20, maxY: 22 }, 1, bounds)).toEqual({ minY: 20, maxY: 22 })
    expect(stepLayerRange({ minY: -3, maxY: -3 }, -5, bounds)).toEqual({ minY: -4, maxY: -4 })
  })

  it('has a ghost layer only in single-layer mode', () => {
    expect(ghostLayer({ minY: 5, maxY: 5 })).toEqual({ minY: 4, maxY: 4 })
    expect(ghostLayer({ minY: 5, maxY: 6 })).toBeNull()
    expect(ghostLayer(null)).toBeNull()
  })

  it('converts to region-local Y', () => {
    expect(toLocalRange({ minY: 0, maxY: 2 }, s.regions[0]!)).toEqual({ min: 4, max: 6 })
    expect(toLocalRange(null, s.regions[0]!)).toBeNull()
  })
})

describe('rowsToRemesh', () => {
  const sizeY = 48 // rows 0..2

  it('remeshes only rows whose visible part changed', () => {
    expect(rowsToRemesh(null, { min: 0, max: 40 }, sizeY)).toEqual([2])
  })

  it('includes the row whose border layer changed', () => {
    // Moving the top from 16 to 15 changes row 1 (its own layer) and row 0 (its border layer).
    expect(rowsToRemesh({ min: 0, max: 16 }, { min: 0, max: 15 }, sizeY)).toEqual([0, 1])
  })

  it('treats rows with none of their own layers visible as empty, whatever the border', () => {
    expect(rowSignature({ min: 0, max: 15 }, 1, sizeY)).toBe('empty')
    expect(rowsToRemesh({ min: 0, max: 10 }, { min: 0, max: 12 }, sizeY)).toEqual([0])
  })

  it('stepping a single layer touches at most the rows around it', () => {
    expect(rowsToRemesh({ min: 20, max: 20 }, { min: 21, max: 21 }, sizeY)).toEqual([1])
    expect(rowsToRemesh({ min: 31, max: 31 }, { min: 32, max: 32 }, sizeY)).toEqual([1, 2])
  })

  it('handles ranges outside the region', () => {
    expect(rowsToRemesh({ min: -10, max: -5 }, null, sizeY)).toEqual([0, 1, 2])
    expect(rowSignature({ min: 100, max: 120 }, 2, sizeY)).toBe('empty')
  })
})
