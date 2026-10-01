import { describe, expect, it } from 'vitest'
import { NbtCompound, NbtString } from 'deepslate/nbt'
import { editBytes } from '../../../src/core/edit/edits'
import { EditError } from '../../../src/core/edit/errors'
import { parseMatcher } from '../../../src/core/edit/matchers'
import { applyReplace, countMatching, deleteRule, previewReplace, type ReplaceRule } from '../../../src/core/edit/replace'
import { bundledRegistry } from '../../../src/core/registry'
import { blockKeys, makeSchematic } from '../../helpers/model'

const registry = bundledRegistry()
const m = (input: string) => parseMatcher(input, registry)
const rule = (from: string, to: string, properties?: Record<string, string>): ReplaceRule =>
  ({ from: [m(from)], to: { name: to, ...(properties ? { properties } : {}) } })

function te(id: string): NbtCompound {
  return new NbtCompound().set('id', new NbtString(id))
}

// 4×1×1 row: stone, oak stairs (top), stone, dirt.
function row() {
  return makeSchematic([{
    size: [4, 1, 1],
    palette: ['minecraft:stone', 'minecraft:oak_stairs[facing=east,half=top,shape=straight,waterlogged=false]', 'minecraft:dirt'],
    blocks: [0, 1, 0, 2],
  }])
}

describe('previewReplace', () => {
  it('counts the blocks that will change without changing them', () => {
    const s = row()
    expect(previewReplace(s, [rule('stone', 'minecraft:andesite')], [], registry).count).toBe(2)
    expect(blockKeys(s.regions[0]!)).toEqual(['minecraft:stone', expect.any(String), 'minecraft:stone', 'minecraft:dirt'])
  })

  it('does not count blocks that already are the target state', () => {
    expect(previewReplace(row(), [rule('stone', 'minecraft:stone')], [], registry).count).toBe(0)
  })

  it('counts only inside the scope', () => {
    const scopes = [{ kind: 'box', box: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 0, z: 0 } } }] as const
    expect(previewReplace(row(), [rule('stone', 'minecraft:andesite')], scopes, registry).count).toBe(1)
  })

  it('rejects an unknown target before scanning', () => {
    expect(() => previewReplace(row(), [rule('stone', 'minecraft:nope')], [], registry)).toThrow(EditError)
  })
})

describe('applyReplace, whole region (palette edit)', () => {
  it('rewrites palette slots with property carry-over and reports a palette change', () => {
    const s = row()
    const result = applyReplace(s, [rule('oak_stairs', 'minecraft:spruce_stairs')], [], registry)
    expect(result.count).toBe(1)
    expect(blockKeys(s.regions[0]!)[1]).toBe('minecraft:spruce_stairs[facing=east,half=top,shape=straight,waterlogged=false]')
    expect(result.edits).toHaveLength(1)
    expect(result.edits[0]!.kind).toBe('palette')
    expect(result.changes).toEqual([{ regionId: 0, paletteChange: { slots: [1] } }])
  })

  it('keeps the blocks array untouched', () => {
    const s = row()
    const before = s.regions[0]!.blocks
    applyReplace(s, [rule('stone', 'minecraft:andesite')], [], registry)
    expect(s.regions[0]!.blocks).toBe(before)
    expect(Array.from(before)).toEqual([0, 1, 0, 2])
  })
})

describe('applyReplace, partial scope (blocks edit)', () => {
  const firstTwo = [{ kind: 'box', box: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 0, z: 0 } } }] as const

  it('rewrites only the blocks in scope, appending the target to the palette', () => {
    const s = row()
    const result = applyReplace(s, [rule('stone', 'minecraft:andesite')], firstTwo, registry)
    expect(blockKeys(s.regions[0]!)).toEqual([
      'minecraft:andesite',
      'minecraft:oak_stairs[facing=east,half=top,shape=straight,waterlogged=false]',
      'minecraft:stone',
      'minecraft:dirt',
    ])
    const edit = result.edits[0]!
    expect(edit.kind).toBe('blocks')
    if (edit.kind !== 'blocks') return
    expect(Array.from(edit.indices)).toEqual([0])
    expect(Array.from(edit.values)).toEqual([0])
    expect(edit.paletteLength).toBe(3)
    expect(edit.paletteAdded.map((st) => st.name)).toEqual(['minecraft:andesite'])
    expect(result.changes).toEqual([{ regionId: 0, dirtyChunks: [{ cx: 0, cy: 0, cz: 0 }] }])
  })

  it('reuses an existing palette entry for the target', () => {
    const s = row()
    applyReplace(s, [rule('stone', 'minecraft:dirt')], firstTwo, registry)
    expect(s.regions[0]!.palette).toHaveLength(3)
    expect(Array.from(s.regions[0]!.blocks)).toEqual([2, 1, 0, 2])
  })

  it('widens the block array when the palette outgrows 16 bits', () => {
    const palette = Array.from({ length: 65536 }, (_, i) => (i === 0 ? 'minecraft:stone' : `othermod:b${i}`))
    const s = makeSchematic([{ size: [2, 1, 1], palette, blocks: [0, 0] }])
    applyReplace(s, [rule('stone', 'minecraft:andesite')], [{ kind: 'box', box: { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } } }], registry)
    const region = s.regions[0]!
    expect(region.palette).toHaveLength(65537)
    expect(region.blocks).toBeInstanceOf(Uint32Array)
    expect(Array.from(region.blocks)).toEqual([65536, 0])
  })
})

describe('applyReplace rules', () => {
  it('applies the first matching rule once per block, without chaining', () => {
    const s = row()
    applyReplace(s, [rule('stone', 'minecraft:dirt'), rule('dirt', 'minecraft:granite')], [], registry)
    expect(blockKeys(s.regions[0]!).filter((k) => !k.includes('stairs'))).toEqual(['minecraft:dirt', 'minecraft:dirt', 'minecraft:granite'])
  })

  it('applies explicitly chosen target properties', () => {
    const s = row()
    applyReplace(s, [rule('oak_stairs', 'minecraft:oak_stairs', { facing: 'west' })], [], registry)
    expect(blockKeys(s.regions[0]!)[1]).toBe('minecraft:oak_stairs[facing=west,half=top,shape=straight,waterlogged=false]')
  })

  it('deletes by replacing with air', () => {
    const s = row()
    applyReplace(s, [deleteRule([m('dirt')])], [], registry)
    expect(blockKeys(s.regions[0]!)[3]).toBe('minecraft:air')
  })

  it('does nothing and returns no edits when nothing matches', () => {
    const s = row()
    const result = applyReplace(s, [rule('gold_block', 'minecraft:dirt')], [], registry)
    expect(result).toMatchObject({ count: 0, edits: [], changes: [] })
  })

  it('reports the same undo size as the edits it produced', () => {
    const s = row()
    const preview = previewReplace(s, [rule('stone', 'minecraft:andesite')], [{ kind: 'yRange', minY: 0, maxY: 0 }], registry)
    const result = applyReplace(s, [rule('stone', 'minecraft:andesite')], [{ kind: 'yRange', minY: 0, maxY: 0 }], registry)
    expect(result.undoBytes).toBe(preview.undoBytes)
    expect(result.undoBytes).toBe(result.edits.reduce((n, e) => n + editBytes(e), 0))
  })

  it('reports the same undo size as the edits it produced, scoped (blocks path)', () => {
    const s = row()
    const box = [{ kind: 'box', box: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 0, z: 0 } } }] as const
    const preview = previewReplace(s, [rule('stone', 'minecraft:andesite')], box, registry)
    const result = applyReplace(s, [rule('stone', 'minecraft:andesite')], box, registry)
    expect(preview.undoBytes).toBeGreaterThan(0)
    expect(result.undoBytes).toBe(preview.undoBytes)
    expect(result.undoBytes).toBe(result.edits.reduce((n, e) => n + editBytes(e), 0))
  })
})

describe('applyReplace block entities', () => {
  function chests() {
    const s = makeSchematic([{
      size: [3, 1, 1],
      palette: ['minecraft:chest[facing=north,type=single,waterlogged=false]', 'minecraft:stone'],
      blocks: [0, 0, 1],
    }])
    s.regions[0]!.tileEntities.set(0, te('minecraft:chest'))
    s.regions[0]!.tileEntities.set(1, te('minecraft:chest'))
    return s
  }

  it('warns in the preview when block entity data will be dropped', () => {
    expect(previewReplace(chests(), [rule('chest', 'minecraft:barrel')], [], registry)).toMatchObject({
      count: 2, blockEntitiesDropped: 2, blockEntitiesKept: 0,
    })
  })

  it('drops the data on apply and keeps it in the edit for undo', () => {
    const s = chests()
    const result = applyReplace(s, [rule('chest', 'minecraft:barrel')], [], registry)
    expect(s.regions[0]!.tileEntities.size).toBe(0)
    expect([...result.edits[0]!.removedTileEntities.keys()]).toEqual([0, 1])
  })

  it('keeps the data when the target has the same block entity type', () => {
    const s = chests()
    const result = applyReplace(s, [rule('chest', 'minecraft:trapped_chest')], [], registry)
    expect(result).toMatchObject({ blockEntitiesDropped: 0, blockEntitiesKept: 2 })
    expect(s.regions[0]!.tileEntities.size).toBe(2)
  })

  it('only touches block entities inside the scope', () => {
    const s = chests()
    applyReplace(s, [rule('chest', 'minecraft:barrel')], [{ kind: 'box', box: { min: { x: 1, y: 0, z: 0 }, max: { x: 2, y: 0, z: 0 } } }], registry)
    expect([...s.regions[0]!.tileEntities.keys()]).toEqual([0])
  })

  it('rewrites the kept block entity id when chest becomes trapped chest, preserving other NBT', () => {
    const s = makeSchematic([{
      size: [1, 1, 1],
      palette: ['minecraft:chest[facing=north,type=single,waterlogged=false]'],
      blocks: [0],
    }])
    s.regions[0]!.tileEntities.set(0, new NbtCompound().set('id', new NbtString('minecraft:chest')).set('CustomName', new NbtString('"Loot"')))
    const result = applyReplace(s, [rule('chest', 'minecraft:trapped_chest')], [], registry)
    expect(result).toMatchObject({ blockEntitiesDropped: 0, blockEntitiesKept: 1 })
    const te = s.regions[0]!.tileEntities.get(0)!
    expect(te.getString('id')).toBe('minecraft:trapped_chest')
    expect(te.getString('CustomName')).toBe('"Loot"')
    const edit = result.edits[0]!
    expect([...edit.addedTileEntities.keys()]).toEqual([0])
    expect([...edit.removedTileEntities.keys()]).toEqual([0])
    expect(edit.removedTileEntities.get(0)!.getString('id')).toBe('minecraft:chest')
  })

  it('rewrites the kept block entity id, scoped (blocks path)', () => {
    const s = makeSchematic([{
      size: [2, 1, 1],
      palette: ['minecraft:chest[facing=north,type=single,waterlogged=false]', 'minecraft:stone'],
      blocks: [0, 1],
    }])
    s.regions[0]!.tileEntities.set(0, new NbtCompound().set('id', new NbtString('minecraft:chest')))
    const scope = [{ kind: 'box', box: { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } } }] as const
    const result = applyReplace(s, [rule('chest', 'minecraft:trapped_chest')], scope, registry)
    expect(result.edits[0]!.kind).toBe('blocks')
    expect(s.regions[0]!.tileEntities.get(0)!.getString('id')).toBe('minecraft:trapped_chest')
  })

  it('accounts for the rewritten copy in undoBytes', () => {
    const chestEntity = () => new NbtCompound().set('id', new NbtString('minecraft:chest'))
    const make = () => {
      const s = makeSchematic([{
        size: [1, 1, 1],
        palette: ['minecraft:chest[facing=north,type=single,waterlogged=false]'],
        blocks: [0],
      }])
      s.regions[0]!.tileEntities.set(0, chestEntity())
      return s
    }
    const preview = previewReplace(make(), [rule('chest', 'minecraft:trapped_chest')], [], registry)
    const s = make()
    const result = applyReplace(s, [rule('chest', 'minecraft:trapped_chest')], [], registry)
    expect(result.undoBytes).toBe(preview.undoBytes)
    expect(result.undoBytes).toBe(result.edits.reduce((n, e) => n + editBytes(e), 0))
  })
})

describe('applyReplace across regions', () => {
  it('produces one edit and one change per touched region', () => {
    const s = makeSchematic([
      { size: [1, 1, 1], palette: ['minecraft:stone'] },
      { size: [1, 1, 1], palette: ['minecraft:dirt'] },
      { size: [1, 1, 1], palette: ['minecraft:stone'] },
    ])
    const result = applyReplace(s, [rule('stone', 'minecraft:andesite')], [], registry)
    expect(result.edits.map((e) => e.regionId)).toEqual([0, 2])
    expect(result.changes.map((c) => c.regionId)).toEqual([0, 2])
  })

  it('restricts to the selected regions', () => {
    const s = makeSchematic([
      { size: [1, 1, 1], palette: ['minecraft:stone'] },
      { size: [1, 1, 1], palette: ['minecraft:stone'] },
    ])
    applyReplace(s, [rule('stone', 'minecraft:andesite')], [{ kind: 'regions', regionIds: [1] }], registry)
    expect(s.regions.map((r) => blockKeys(r)[0])).toEqual(['minecraft:stone', 'minecraft:andesite'])
  })
})

describe('countMatching', () => {
  it('counts blocks in scope matching any matcher', () => {
    expect(countMatching(row(), [m('stone'), m('dirt')], [])).toBe(3)
    expect(countMatching(row(), [m('stone')], [{ kind: 'box', box: { min: { x: 1, y: 0, z: 0 }, max: { x: 3, y: 0, z: 0 } } }])).toBe(1)
  })
})
