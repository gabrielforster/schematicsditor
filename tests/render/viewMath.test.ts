import { describe, expect, it } from 'vitest'
import { BoxSelectionTool, normalizeBox } from '../../src/render/selection'
import { fitView, flyDelta, schematicBounds, shouldSuggestColored } from '../../src/render/viewMath'
import { makeSchematic } from '../helpers/model'

const NO_KEYS = { forward: false, back: false, left: false, right: false, up: false, down: false }

describe('BoxSelectionTool', () => {
  it('builds a box from two clicked corners in any order', () => {
    const tool = new BoxSelectionTool()
    tool.start()
    expect(tool.click({ x: 5, y: 1, z: 9 })).toBeNull()
    expect(tool.firstCorner).toEqual({ x: 5, y: 1, z: 9 })
    expect(tool.click({ x: 2, y: 4, z: 3 })).toEqual({ min: { x: 2, y: 1, z: 3 }, max: { x: 5, y: 4, z: 9 } })
    expect(tool.picking).toBe(false)
    expect(tool.box).toEqual({ min: { x: 2, y: 1, z: 3 }, max: { x: 5, y: 4, z: 9 } })
  })

  it('ignores clicks when not picking and keeps the box on cancel', () => {
    const tool = new BoxSelectionTool()
    tool.set({ min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } })
    expect(tool.click({ x: 3, y: 3, z: 3 })).toBeNull()
    tool.start()
    tool.click({ x: 3, y: 3, z: 3 })
    tool.cancel()
    expect(tool.firstCorner).toBeNull()
    expect(tool.box).toEqual({ min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } })
  })

  it('accepts numeric boxes, normalized, and clearing', () => {
    const tool = new BoxSelectionTool()
    tool.set({ min: { x: 4, y: 0, z: 0 }, max: { x: 1, y: 2, z: 0 } })
    expect(tool.box).toEqual(normalizeBox({ min: { x: 1, y: 0, z: 0 }, max: { x: 4, y: 2, z: 0 } }))
    tool.set(null)
    expect(tool.box).toBeNull()
  })
})

describe('shouldSuggestColored', () => {
  it('suggests colored mode only for regions above 5M blocks', () => {
    const small = makeSchematic([{ size: [1, 1, 1], palette: ['minecraft:air'] }])
    expect(shouldSuggestColored(small)).toBe(false)
    small.regions[0]!.size = { x: 200, y: 200, z: 126 } // 5.04M; the block array is not read
    expect(shouldSuggestColored(small)).toBe(true)
  })
})

describe('schematicBounds', () => {
  const s = makeSchematic([
    { position: [-2, 0, 0], size: [2, 3, 1], palette: ['minecraft:air'] },
    { position: [10, 5, 4], size: [1, 1, 1], palette: ['minecraft:air'] },
  ])

  it('spans all regions with an exclusive max', () => {
    expect(schematicBounds(s)).toEqual({ min: { x: -2, y: 0, z: 0 }, max: { x: 11, y: 6, z: 5 } })
  })

  it('leaves out hidden regions', () => {
    expect(schematicBounds(s, new Set([1]))).toEqual({ min: { x: -2, y: 0, z: 0 }, max: { x: 0, y: 3, z: 1 } })
    expect(schematicBounds(s, new Set([0, 1]))).toBeNull()
  })
})

describe('fitView', () => {
  it('centres on the box and backs off far enough to see all of it', () => {
    const fit = fitView({ min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 10 } }, 60, 1)
    expect(fit.target).toEqual({ x: 5, y: 5, z: 5 })
    const d = Math.hypot(fit.position.x - 5, fit.position.y - 5, fit.position.z - 5)
    const radius = Math.hypot(10, 10, 10) / 2
    expect(d).toBeCloseTo(radius / Math.sin(Math.PI / 6))
    expect(fit.near).toBeLessThan(d - radius)
    expect(fit.far).toBeGreaterThan(d + radius)
  })

  it('backs off further in a narrow viewport', () => {
    const box = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 10 } }
    expect(fitView(box, 60, 0.5).position.x).toBeGreaterThan(fitView(box, 60, 1).position.x)
  })
})

describe('flyDelta', () => {
  it('moves along the view direction and sideways', () => {
    const f = { x: 0, y: 0, z: -1 }
    expect(flyDelta({ ...NO_KEYS, forward: true }, f, 10, 0.5)).toEqual({ x: 0, y: 0, z: -5 })
    const right = flyDelta({ ...NO_KEYS, right: true }, f, 10, 1)
    expect([right.x, right.y, right.z + 0]).toEqual([10, 0, 0])
  })

  it('moves along world Y for up and down', () => {
    expect(flyDelta({ ...NO_KEYS, up: true }, { x: 1, y: 0, z: 0 }, 4, 1)).toEqual({ x: 0, y: 4, z: 0 })
  })

  it('stands still with no keys', () => {
    const d = flyDelta(NO_KEYS, { x: 1, y: 0, z: 0 }, 4, 1)
    expect(Math.hypot(d.x, d.y, d.z)).toBe(0)
  })
})
