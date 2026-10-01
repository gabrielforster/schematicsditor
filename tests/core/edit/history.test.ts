import { describe, expect, it } from 'vitest'
import { NbtCompound, NbtString } from 'deepslate/nbt'
import { History, makeEntry } from '../../../src/core/edit/history'
import { parseMatcher } from '../../../src/core/edit/matchers'
import { applyReplace, type ReplaceRule } from '../../../src/core/edit/replace'
import type { Scope } from '../../../src/core/edit/scopes'
import { redoEdit, undoEdit } from '../../../src/core/edit/undo'
import type { Schematic } from '../../../src/core/model'
import { bundledRegistry } from '../../../src/core/registry'
import { blockKeys, makeSchematic } from '../../helpers/model'

const registry = bundledRegistry()
const rule = (from: string, to: string): ReplaceRule => ({ from: [parseMatcher(from, registry)], to: { name: to } })
const firstTwo: Scope[] = [{ kind: 'box', box: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 0, z: 0 } } }]

function chestRow(): Schematic {
  const s = makeSchematic([{
    size: [3, 1, 1],
    palette: ['minecraft:stone', 'minecraft:chest[facing=north,type=single,waterlogged=false]'],
    blocks: [0, 1, 0],
  }])
  s.regions[0]!.tileEntities.set(1, new NbtCompound().set('id', new NbtString('minecraft:chest')))
  return s
}

function snapshot(s: Schematic) {
  return s.regions.map((r) => ({ keys: blockKeys(r), palette: r.palette.length, tes: [...r.tileEntities.keys()] }))
}

describe('undoEdit / redoEdit', () => {
  it('reverts and re-applies a palette edit, including dropped block entities', () => {
    const s = chestRow()
    const before = snapshot(s)
    const { edits, changes } = applyReplace(s, [rule('chest', 'minecraft:barrel')], [], registry)
    const after = snapshot(s)
    expect(undoEdit(s, edits[0]!)).toEqual(changes[0])
    expect(snapshot(s)).toEqual(before)
    expect(redoEdit(s, edits[0]!)).toEqual(changes[0])
    expect(snapshot(s)).toEqual(after)
  })

  it('reverts and re-applies a blocks edit, removing appended palette entries on undo', () => {
    const s = chestRow()
    const before = snapshot(s)
    const { edits, changes } = applyReplace(s, [rule('stone', 'minecraft:andesite'), rule('chest', 'minecraft:barrel')], firstTwo, registry)
    const after = snapshot(s)
    expect(after[0]!.palette).toBe(4)
    expect(undoEdit(s, edits[0]!)).toEqual(changes[0])
    expect(snapshot(s)).toEqual(before)
    expect(redoEdit(s, edits[0]!)).toEqual(changes[0])
    expect(snapshot(s)).toEqual(after)
  })

  it('restores blocks after an edit that widened the array', () => {
    const palette = Array.from({ length: 65536 }, (_, i) => (i === 0 ? 'minecraft:stone' : `othermod:b${i}`))
    const s = makeSchematic([{ size: [2, 1, 1], palette, blocks: [0, 5] }])
    const { edits } = applyReplace(s, [rule('stone', 'minecraft:andesite')], [{ kind: 'box', box: { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } } }], registry)
    undoEdit(s, edits[0]!)
    expect(s.regions[0]!.palette).toHaveLength(65536)
    expect(Array.from(s.regions[0]!.blocks)).toEqual([0, 5])
    redoEdit(s, edits[0]!)
    expect(Array.from(s.regions[0]!.blocks)).toEqual([65536, 5])
  })

  it('refuses to undo when the palette no longer matches the edit', () => {
    const s = chestRow()
    const { edits } = applyReplace(s, [rule('stone', 'minecraft:andesite')], firstTwo, registry)
    s.regions[0]!.palette.push({ name: 'minecraft:dirt', properties: {} })
    expect(() => undoEdit(s, edits[0]!)).toThrow(/out of sync/)
  })

  function chestOnlyRow(): Schematic {
    const s = makeSchematic([{
      size: [1, 1, 1],
      palette: ['minecraft:chest[facing=north,type=single,waterlogged=false]'],
      blocks: [0],
    }])
    s.regions[0]!.tileEntities.set(0, new NbtCompound().set('id', new NbtString('minecraft:chest')))
    return s
  }

  it('undo restores the original block entity id, redo re-applies the rewritten one (whole region)', () => {
    const s = chestOnlyRow()
    const { edits, changes } = applyReplace(s, [rule('chest', 'minecraft:trapped_chest')], [], registry)
    expect(s.regions[0]!.tileEntities.get(0)!.getString('id')).toBe('minecraft:trapped_chest')
    expect(undoEdit(s, edits[0]!)).toEqual(changes[0])
    expect(s.regions[0]!.tileEntities.get(0)!.getString('id')).toBe('minecraft:chest')
    expect(redoEdit(s, edits[0]!)).toEqual(changes[0])
    expect(s.regions[0]!.tileEntities.get(0)!.getString('id')).toBe('minecraft:trapped_chest')
  })

  it('undo restores the original block entity id, redo re-applies the rewritten one (scoped blocks path)', () => {
    const s = makeSchematic([{
      size: [2, 1, 1],
      palette: ['minecraft:chest[facing=north,type=single,waterlogged=false]', 'minecraft:stone'],
      blocks: [0, 1],
    }])
    s.regions[0]!.tileEntities.set(0, new NbtCompound().set('id', new NbtString('minecraft:chest')))
    const scope: Scope[] = [{ kind: 'box', box: { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } } }]
    const { edits, changes } = applyReplace(s, [rule('chest', 'minecraft:trapped_chest')], scope, registry)
    expect(edits[0]!.kind).toBe('blocks')
    expect(s.regions[0]!.tileEntities.get(0)!.getString('id')).toBe('minecraft:trapped_chest')
    expect(undoEdit(s, edits[0]!)).toEqual(changes[0])
    expect(s.regions[0]!.tileEntities.get(0)!.getString('id')).toBe('minecraft:chest')
    expect(redoEdit(s, edits[0]!)).toEqual(changes[0])
    expect(s.regions[0]!.tileEntities.get(0)!.getString('id')).toBe('minecraft:trapped_chest')
  })
})

describe('History', () => {
  function edit(s: Schematic, from: string, to: string, scopes: Scope[] = []) {
    return makeEntry(`${from} → ${to}`, applyReplace(s, [rule(from, to)], scopes, registry).edits)
  }

  it('undoes and redoes entries in order', () => {
    const s = chestRow()
    const h = new History()
    const v0 = snapshot(s)
    h.push(edit(s, 'stone', 'minecraft:andesite', firstTwo))
    const v1 = snapshot(s)
    h.push(edit(s, 'andesite', 'minecraft:granite'))
    expect(h.undoLabel).toBe('andesite → minecraft:granite')
    h.undo(s)
    expect(snapshot(s)).toEqual(v1)
    h.undo(s)
    expect(snapshot(s)).toEqual(v0)
    expect(h.undo(s)).toBeNull()
    h.redo(s)
    expect(snapshot(s)).toEqual(v1)
    expect(h.canRedo).toBe(true)
  })

  it('reverts every edit of a compound entry at once', () => {
    const s = makeSchematic([
      { size: [1, 1, 1], palette: ['minecraft:stone'] },
      { size: [1, 1, 1], palette: ['minecraft:stone'] },
    ])
    const h = new History()
    h.push(edit(s, 'stone', 'minecraft:andesite'))
    const changes = h.undo(s)!
    expect(changes.map((c) => c.regionId)).toEqual([1, 0])
    expect(s.regions.map((r) => blockKeys(r)[0])).toEqual(['minecraft:stone', 'minecraft:stone'])
  })

  it('drops the redo stack on a new entry', () => {
    const s = chestRow()
    const h = new History()
    h.push(edit(s, 'stone', 'minecraft:andesite'))
    h.undo(s)
    h.push(edit(s, 'stone', 'minecraft:granite'))
    expect(h.canRedo).toBe(false)
  })

  it('evicts the oldest entries when over the cap', () => {
    const h = new History(1000)
    h.push({ label: 'a', edits: [], bytes: 400 })
    h.push({ label: 'b', edits: [], bytes: 400 })
    h.push({ label: 'c', edits: [], bytes: 400 })
    expect(h.size).toEqual({ undo: 2, redo: 0 })
    expect(h.bytes).toBe(800)
    expect(h.undoLabel).toBe('c')
  })

  it('clears itself and reports false for an entry larger than the cap', () => {
    const h = new History(1000)
    h.push({ label: 'a', edits: [], bytes: 400 })
    expect(h.push({ label: 'huge', edits: [], bytes: 1001 })).toBe(false)
    expect(h.canUndo).toBe(false)
    expect(h.bytes).toBe(0)
  })

  it('defaults to a 256 MB cap', () => {
    expect(new History().capBytes).toBe(256 * 1024 * 1024)
  })

  it('clears the whole history when undo throws partway through a compound entry', () => {
    const s = makeSchematic([
      { size: [1, 1, 1], palette: ['minecraft:stone'] },
      { size: [1, 1, 1], palette: ['minecraft:stone'] },
    ])
    const h = new History()
    h.push(edit(s, 'stone', 'minecraft:andesite'))
    s.regions.pop()
    expect(() => h.undo(s)).toThrow(/out of sync/)
    expect(h.canUndo).toBe(false)
    expect(h.canRedo).toBe(false)
    expect(h.bytes).toBe(0)
  })

  it('clears the whole history when redo throws partway through a compound entry', () => {
    const s = makeSchematic([
      { size: [1, 1, 1], palette: ['minecraft:stone'] },
      { size: [1, 1, 1], palette: ['minecraft:stone'] },
    ])
    const h = new History()
    h.push(edit(s, 'stone', 'minecraft:andesite'))
    h.undo(s)
    s.regions.pop()
    expect(() => h.redo(s)).toThrow(/out of sync/)
    expect(h.canUndo).toBe(false)
    expect(h.canRedo).toBe(false)
    expect(h.bytes).toBe(0)
  })
})
