import { describe, expect, it } from 'vitest'
import { bundledFamilies } from '../../../src/core/families/bundled'
import { FamilyDataError, findFamily, loadFamilies } from '../../../src/core/families/families'
import { BlockRegistry, bundledRegistry } from '../../../src/core/registry'

const groups = bundledFamilies()
const family = (id: string) => {
  const f = findFamily(groups, id)
  if (!f) throw new Error(`no family ${id}`)
  return f
}

describe('bundled families', () => {
  it('load against the bundled registry without unknown block names', () => {
    // loadFamilies is strict by default: any unknown name throws FamilyDataError here.
    expect(groups.map((g) => g.id)).toEqual(['wood', 'stone', 'color'])
  })

  it('cover every wood of the spec', () => {
    const ids = groups.find((g) => g.id === 'wood')!.families.map((f) => f.id)
    for (const id of ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'mangrove', 'cherry', 'bamboo', 'crimson', 'warped', 'pale_oak']) {
      expect(ids).toContain(id)
    }
  })

  it('cover the 16 dye colors with the same shapes', () => {
    const colors = groups.find((g) => g.id === 'color')!.families.filter((f) => f.id !== 'uncolored')
    expect(colors).toHaveLength(16)
    const shapes = Object.keys(colors[0]!.blocks).sort()
    expect(shapes).toEqual(expect.arrayContaining(['wool', 'concrete', 'concrete_powder', 'terracotta', 'glazed_terracotta', 'stained_glass', 'stained_glass_pane', 'carpet', 'bed', 'banner', 'candle', 'shulker_box']))
    for (const c of colors) expect(Object.keys(c.blocks).sort()).toEqual(shapes)
  })

  it('cover the stone-likes named in the spec', () => {
    for (const id of ['stone', 'cobblestone', 'stone_bricks', 'cobbled_deepslate', 'polished_deepslate', 'deepslate_bricks', 'deepslate_tiles', 'sandstone', 'blackstone']) {
      expect(findFamily(groups, id)?.group).toBe('stone')
    }
  })

  it('follow the real names of irregular woods', () => {
    expect(family('bamboo').blocks).toMatchObject({
      planks: 'minecraft:bamboo_planks',
      log: 'minecraft:bamboo_block',
      stripped_log: 'minecraft:stripped_bamboo_block',
      mosaic: 'minecraft:bamboo_mosaic',
    })
    expect(family('bamboo').blocks.wood).toBeUndefined()
    expect(family('crimson').blocks).toMatchObject({
      log: 'minecraft:crimson_stem',
      stripped_log: 'minecraft:stripped_crimson_stem',
      wood: 'minecraft:crimson_hyphae',
      stripped_wood: 'minecraft:stripped_crimson_hyphae',
    })
    expect(family('warped').blocks.wood).toBe('minecraft:warped_hyphae')
  })

  it('give wood families the shapes the spec lists', () => {
    expect(Object.keys(family('oak').blocks)).toEqual(expect.arrayContaining([
      'planks', 'log', 'stripped_log', 'wood', 'stripped_wood', 'stairs', 'slab', 'fence', 'fence_gate', 'door',
      'trapdoor', 'button', 'pressure_plate', 'sign', 'wall_sign', 'hanging_sign', 'wall_hanging_sign',
    ]))
  })

  it('use every block at most once across all families', () => {
    const owners = new Map<string, string>()
    for (const g of groups) for (const f of g.families) for (const name of Object.values(f.blocks)) {
      expect(owners.get(name), `${name} in ${f.id} and ${owners.get(name)}`).toBeUndefined()
      owners.set(name, f.id)
    }
  })
})

describe('loadFamilies', () => {
  const registry = new BlockRegistry({ oak_planks: [{}, {}], spruce_planks: [{}, {}] })
  const data = (blocks: Record<string, string>) => ({
    groups: [{ id: 'wood', label: 'Wood', families: [{ id: 'oak', label: 'Oak', blocks }] }],
  })

  it('normalizes names to the minecraft namespace', () => {
    expect(loadFamilies(data({ planks: 'oak_planks' }), registry)[0]!.families[0]).toEqual({
      id: 'oak', label: 'Oak', group: 'wood', blocks: { planks: 'minecraft:oak_planks' },
    })
  })

  it('fails on unknown block names, naming each one', () => {
    try {
      loadFamilies(data({ planks: 'oak_planks', log: 'oak_lgo', door: 'oak_dor' }), registry)
      throw new Error('expected FamilyDataError')
    } catch (e) {
      expect(e).toBeInstanceOf(FamilyDataError)
      expect((e as FamilyDataError).problems).toEqual([
        'family "oak": unknown block minecraft:oak_lgo (shape "log")',
        'family "oak": unknown block minecraft:oak_dor (shape "door")',
      ])
    }
  })

  it('drops unknown blocks and empty families when not strict', () => {
    const groupsOut = loadFamilies({
      groups: [{ id: 'wood', label: 'Wood', families: [
        { id: 'oak', label: 'Oak', blocks: { planks: 'oak_planks', log: 'oak_log' } },
        { id: 'pale_oak', label: 'Pale Oak', blocks: { planks: 'pale_oak_planks' } },
      ] }],
    }, registry, { strict: false })
    expect(groupsOut[0]!.families.map((f) => [f.id, Object.keys(f.blocks)])).toEqual([['oak', ['planks']]])
  })

  it('rejects duplicate family ids and blocks used twice', () => {
    expect(() => loadFamilies({
      groups: [{ id: 'wood', label: 'Wood', families: [
        { id: 'oak', label: 'Oak', blocks: { planks: 'oak_planks', slab: 'oak_planks' } },
        { id: 'oak', label: 'Oak again', blocks: { planks: 'spruce_planks' } },
      ] }],
    }, registry)).toThrow(FamilyDataError)
  })

  it.each([
    ['a non-object', 42],
    ['missing groups', {}],
    ['a family without blocks', { groups: [{ id: 'wood', label: 'Wood', families: [{ id: 'oak', label: 'Oak' }] }] }],
  ])('rejects %s', (_label, input) => {
    expect(() => loadFamilies(input, bundledRegistry())).toThrow(FamilyDataError)
  })
})
