import { describe, expect, it } from 'vitest'
import { bundledRegistry } from '../../src/core/registry'
import { addFrom, buildReplace, emptyReplaceForm, targetOf } from '../../src/ui/logic/replaceForm'

const registry = bundledRegistry()
const form = (patch: Partial<typeof emptyReplaceForm>) => ({ ...emptyReplaceForm, ...patch })

describe('buildReplace', () => {
  it('needs at least one block to replace', () => {
    expect(buildReplace(emptyReplaceForm, registry, null)).toEqual({ ok: false, field: 'from', error: 'Add at least one block to replace.' })
  })

  it('parses every matcher kind and builds replace and delete rules', () => {
    const built = buildReplace(form({ from: ['oak_stairs', 'stone_stairs[half=top]', 'somemod:widget'], to: 'andesite' }), registry, null)
    if (!built.ok) throw new Error(built.error)
    expect(built.from.map((m) => m.kind)).toEqual(['block', 'partial', 'block'])
    expect(built.replaceRule).toEqual({ from: built.from, to: { name: 'minecraft:andesite', properties: {} } })
    expect(built.deleteRule.to).toEqual({ name: 'minecraft:air' })
    expect(built.scopes).toEqual([])
  })

  it('allows delete without a target', () => {
    const built = buildReplace(form({ from: ['stone'] }), registry, null)
    expect(built).toMatchObject({ ok: true, replaceRule: null })
  })

  it('names the matcher that is wrong', () => {
    expect(buildReplace(form({ from: ['stone', 'oak_stairs[color=red]'] }), registry, null)).toEqual({
      ok: false, field: 'from', error: 'oak_stairs[color=red]: minecraft:oak_stairs has no property "color"',
    })
    expect(buildReplace(form({ from: ['oak_stairs]'] }), registry, null)).toMatchObject({ ok: false, field: 'from' })
  })

  it('rejects unknown targets and invalid target properties', () => {
    expect(buildReplace(form({ from: ['stone'], to: 'nope' }), registry, null)).toEqual({ ok: false, field: 'to', error: 'Unknown block: minecraft:nope' })
    expect(buildReplace(form({ from: ['stone'], to: 'oak_stairs', toProperties: { half: 'middle' } }), registry, null))
      .toEqual({ ok: false, field: 'to', error: 'minecraft:oak_stairs property "half" cannot be "middle"' })
  })

  it('reports incomplete scopes', () => {
    const scope = { ...emptyReplaceForm.scope, box: { on: true } }
    expect(buildReplace(form({ from: ['stone'], scope }), registry, null)).toEqual({ ok: false, field: 'scope', error: 'Select a box in the left panel first.' })
  })
})

describe('targetOf', () => {
  it('merges typed properties with the dropdowns, dropdowns winning', () => {
    expect(targetOf(form({ to: 'oak_stairs[half=top,facing=east]', toProperties: { facing: 'west' } })))
      .toEqual({ name: 'minecraft:oak_stairs', properties: { half: 'top', facing: 'west' } })
    expect(targetOf(form({ to: ' ' }))).toBeNull()
  })
})

describe('addFrom', () => {
  it('adds trimmed text once', () => {
    const f = addFrom(addFrom(emptyReplaceForm, ' stone '), 'stone')
    expect(f.from).toEqual(['stone'])
    expect(addFrom(f, '')).toBe(f)
  })
})
