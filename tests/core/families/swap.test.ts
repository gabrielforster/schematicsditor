import { describe, expect, it } from 'vitest'
import { NbtCompound, NbtString } from 'deepslate/nbt'
import { Editor } from '../../../src/core/edit/editor'
import { bundledFamilies } from '../../../src/core/families/bundled'
import { findFamily, type Family } from '../../../src/core/families/families'
import { familySwapRules, previewFamilySwap } from '../../../src/core/families/swap'
import { bundledRegistry } from '../../../src/core/registry'
import { blockKeys, makeSchematic } from '../../helpers/model'

const registry = bundledRegistry()
const groups = bundledFamilies()
const family = (id: string): Family => findFamily(groups, id)!

// One oak build: planks, a top stair, a log on its side, leaves, a sign with text.
function oakHut() {
  const s = makeSchematic([{
    size: [5, 1, 1],
    palette: [
      'minecraft:oak_planks',
      'minecraft:oak_stairs[facing=east,half=top,shape=straight,waterlogged=false]',
      'minecraft:oak_log[axis=x]',
      'minecraft:oak_leaves[distance=7,persistent=true,waterlogged=false]',
      'minecraft:oak_sign[rotation=4,waterlogged=false]',
    ],
    blocks: [0, 1, 2, 3, 4],
  }])
  s.regions[0]!.tileEntities.set(4, new NbtCompound().set('id', new NbtString('minecraft:sign')))
  return s
}

describe('familySwapRules', () => {
  it('maps every shared shape key, skipping shapes the target lacks', () => {
    const rules = familySwapRules(family('oak'), family('crimson'))
    const pairs = rules.map((r) => [r.from[0], r.to.name])
    expect(pairs).toContainEqual([{ kind: 'block', name: 'minecraft:oak_log' }, 'minecraft:crimson_stem'])
    expect(pairs.some(([from]) => (from as { name: string }).name === 'minecraft:oak_leaves')).toBe(false)
  })
})

describe('previewFamilySwap', () => {
  it('counts changes and lists unmapped shapes present in scope', () => {
    const preview = previewFamilySwap(oakHut(), family('oak'), family('crimson'), [], registry)
    expect(preview.count).toBe(4)
    expect(preview.unmapped).toEqual([{ shape: 'leaves', block: 'minecraft:oak_leaves', count: 1 }])
    expect(preview.blockEntitiesKept).toBe(1)
  })

  it('lists nothing as unmapped when every present shape has a counterpart', () => {
    expect(previewFamilySwap(oakHut(), family('oak'), family('spruce'), [], registry).unmapped).toEqual([])
  })
})

describe('Editor.familySwap', () => {
  it('swaps every shape with property carry-over and keeps sign data', () => {
    const s = oakHut()
    const editor = new Editor(s, registry)
    const result = editor.familySwap(family('oak'), family('spruce'), [])
    expect(result.count).toBe(5)
    expect(blockKeys(s.regions[0]!)).toEqual([
      'minecraft:spruce_planks',
      'minecraft:spruce_stairs[facing=east,half=top,shape=straight,waterlogged=false]',
      'minecraft:spruce_log[axis=x]',
      'minecraft:spruce_leaves[distance=7,persistent=true,waterlogged=false]',
      'minecraft:spruce_sign[rotation=4,waterlogged=false]',
    ])
    expect(s.regions[0]!.tileEntities.has(4)).toBe(true)
  })

  it('maps irregular names: oak log to bamboo block, unmapped wood left alone', () => {
    const s = makeSchematic([{ size: [2, 1, 1], palette: ['minecraft:oak_log[axis=z]', 'minecraft:oak_wood[axis=y]'], blocks: [0, 1] }])
    const editor = new Editor(s, registry)
    expect(editor.previewFamilySwap(family('oak'), family('bamboo'), []).unmapped.map((u) => u.shape)).toEqual(['wood'])
    editor.familySwap(family('oak'), family('bamboo'), [])
    expect(blockKeys(s.regions[0]!)).toEqual(['minecraft:bamboo_block[axis=z]', 'minecraft:oak_wood[axis=y]'])
  })

  it('records the whole swap as one history entry', () => {
    const s = oakHut()
    const before = blockKeys(s.regions[0]!)
    const editor = new Editor(s, registry)
    editor.familySwap(family('oak'), family('cherry'), [{ kind: 'box', box: { min: { x: 0, y: 0, z: 0 }, max: { x: 2, y: 0, z: 0 } } }])
    expect(editor.history.size.undo).toBe(1)
    expect(editor.history.undoLabel).toBe('Oak → Cherry')
    editor.undo()
    expect(blockKeys(s.regions[0]!)).toEqual(before)
  })

  it('swaps colors across every colored shape', () => {
    const s = makeSchematic([{
      size: [3, 1, 1],
      palette: ['minecraft:white_wool', 'minecraft:white_bed[facing=north,occupied=false,part=head]', 'minecraft:white_stained_glass_pane[east=true,north=false,south=false,waterlogged=false,west=true]'],
      blocks: [0, 1, 2],
    }])
    new Editor(s, registry).familySwap(family('white'), family('red'), [])
    expect(blockKeys(s.regions[0]!)).toEqual([
      'minecraft:red_wool',
      'minecraft:red_bed[facing=north,occupied=false,part=head]',
      'minecraft:red_stained_glass_pane[east=true,north=false,south=false,waterlogged=false,west=true]',
    ])
  })
})
