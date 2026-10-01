import { describe, expect, it } from 'vitest'
import { Editor } from '../../../src/core/edit/editor'
import { readLitematic } from '../../../src/core/litematic/read'
import { saveLitematic } from '../../../src/core/litematic/save'
import type { RegionChange } from '../../../src/core/edit/events'
import { parseMatcher } from '../../../src/core/edit/matchers'
import type { ReplaceRule } from '../../../src/core/edit/replace'
import { bundledRegistry } from '../../../src/core/registry'
import { blockKeys, makeSchematic } from '../../helpers/model'

const registry = bundledRegistry()
const rule = (from: string, to: string): ReplaceRule => ({ from: [parseMatcher(from, registry)], to: { name: to } })

function setup(options?: { historyCapBytes?: number }) {
  const schematic = makeSchematic([{ size: [2, 1, 1], palette: ['minecraft:stone', 'minecraft:dirt'], blocks: [0, 1] }])
  const editor = new Editor(schematic, registry, options)
  const events: RegionChange[][] = []
  editor.subscribe((c) => events.push(c))
  return { schematic, editor, events, keys: () => blockKeys(schematic.regions[0]!) }
}

describe('Editor', () => {
  it('previews without changing anything or notifying', () => {
    const { editor, events, keys } = setup()
    expect(editor.previewReplace([rule('stone', 'minecraft:andesite')], []).count).toBe(1)
    expect(keys()).toEqual(['minecraft:stone', 'minecraft:dirt'])
    expect(events).toEqual([])
  })

  it('applies a replace, records it and notifies once', () => {
    const { editor, events, keys } = setup()
    const result = editor.replace([rule('stone', 'minecraft:andesite')], [])
    expect(result).toMatchObject({ count: 1, undoable: true })
    expect(keys()).toEqual(['minecraft:andesite', 'minecraft:dirt'])
    expect(events).toEqual([[{ regionId: 0, paletteChange: { slots: [0] } }]])
    expect(editor.canUndo).toBe(true)
    expect(editor.history.undoLabel).toBe('Replace')
  })

  it('undoes and redoes with change events', () => {
    const { editor, events, keys } = setup()
    editor.replace([rule('stone', 'minecraft:andesite')], [{ kind: 'yRange', minY: 0, maxY: 0 }, { kind: 'box', box: { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } } }])
    expect(editor.undo()).toBe(true)
    expect(keys()).toEqual(['minecraft:stone', 'minecraft:dirt'])
    expect(editor.redo()).toBe(true)
    expect(keys()).toEqual(['minecraft:andesite', 'minecraft:dirt'])
    expect(events).toHaveLength(3)
    expect(events[1]).toEqual([{ regionId: 0, dirtyChunks: [{ cx: 0, cy: 0, cz: 0 }] }])
  })

  it('returns false from undo and redo when there is nothing to do', () => {
    const { editor, events } = setup()
    expect(editor.undo()).toBe(false)
    expect(editor.redo()).toBe(false)
    expect(events).toEqual([])
  })

  it('records nothing and stays silent when nothing changes', () => {
    const { editor, events } = setup()
    expect(editor.replace([rule('gold_block', 'minecraft:andesite')], []).count).toBe(0)
    expect(editor.canUndo).toBe(false)
    expect(events).toEqual([])
  })

  it('deletes by replacing with air under a Delete label', () => {
    const { editor, keys } = setup()
    editor.delete([parseMatcher('dirt', registry)], [])
    expect(keys()).toEqual(['minecraft:stone', 'minecraft:air'])
    expect(editor.history.undoLabel).toBe('Delete')
  })

  it('applies but reports not undoable when the edit exceeds the history cap', () => {
    const { editor, keys } = setup({ historyCapBytes: 10 })
    expect(editor.replace([rule('stone', 'minecraft:andesite')], []).undoable).toBe(false)
    expect(keys()[0]).toBe('minecraft:andesite')
    expect(editor.canUndo).toBe(false)
  })

  it('stops notifying after unsubscribe', () => {
    const { editor } = setup()
    const seen: RegionChange[][] = []
    const off = editor.subscribe((c) => seen.push(c))
    off()
    editor.replace([rule('stone', 'minecraft:andesite')], [])
    expect(seen).toEqual([])
  })

  it('saves an edited schematic that reads back with the edit applied', () => {
    const { schematic, editor } = setup()
    editor.replace([rule('stone', 'minecraft:andesite')], [{ kind: 'box', box: { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } } }])
    const back = readLitematic(saveLitematic(schematic, 1).bytes)
    expect(blockKeys(back.regions[0]!)).toEqual(['minecraft:andesite', 'minecraft:dirt'])
  })

  it('saves after a palette edit that left two slots with the same state', () => {
    const { schematic, editor } = setup()
    editor.replace([rule('stone', 'minecraft:dirt')], [])
    const back = readLitematic(saveLitematic(schematic, 1).bytes)
    expect(blockKeys(back.regions[0]!)).toEqual(['minecraft:dirt', 'minecraft:dirt'])
    expect(back.regions[0]!.palette.map((p) => p.name)).toEqual(['minecraft:air', 'minecraft:dirt'])
  })

  it('keeps history valid across a save', () => {
    const { schematic, editor, keys } = setup()
    editor.replace([rule('stone', 'minecraft:andesite')], [{ kind: 'box', box: { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } } }])
    saveLitematic(schematic, 1)
    expect(editor.undo()).toBe(true)
    expect(keys()).toEqual(['minecraft:stone', 'minecraft:dirt'])
  })
})

describe('Editor.setMetadata', () => {
  it('changes name, author and description in place and reports a change', () => {
    const { editor, schematic } = setup()
    const metadata = schematic.metadata
    expect(editor.setMetadata({ name: 'Castle', author: 'Steve' })).toBe(true)
    expect(schematic.metadata).toBe(metadata)
    expect(metadata).toMatchObject({ name: 'Castle', author: 'Steve', description: '' })
  })

  it('reports false when every value is unchanged', () => {
    const { editor } = setup()
    expect(editor.setMetadata({ name: 'test' })).toBe(false)
    expect(editor.setMetadata({})).toBe(false)
  })

  it('is not undoable and does not notify change listeners', () => {
    const { editor, events } = setup()
    editor.setMetadata({ name: 'Castle' })
    expect(editor.canUndo).toBe(false)
    expect(events).toEqual([])
  })

  it('rejects a value too long for an NBT string and changes nothing', () => {
    const { editor, schematic } = setup()
    // 'é' is two bytes of UTF-8: 32,768 of them exceed 65,535 bytes.
    expect(() => editor.setMetadata({ name: 'ok', author: 'é'.repeat(32768) })).toThrow(RangeError)
    expect(schematic.metadata).toMatchObject({ name: 'test', author: 'tester' })
  })

  it('writes the new values on save', () => {
    const { editor, schematic } = setup()
    editor.setMetadata({ name: 'Castle', author: 'Steve', description: 'A keep' })
    expect(readLitematic(saveLitematic(schematic).bytes).metadata).toMatchObject({ name: 'Castle', author: 'Steve', description: 'A keep' })
  })
})
