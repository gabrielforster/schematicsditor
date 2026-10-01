import { describe, expect, it } from 'vitest'
import { formatBreakdown, materialsToCsv, materialsToText } from '../../../src/core/materials/export'
import { computeMaterials, filterMaterials, shulkerBoxesFor, sortMaterials, stacksFor } from '../../../src/core/materials/materials'
import { bundledRegistry } from '../../../src/core/registry'
import { makeSchematic } from '../../helpers/model'

const registry = bundledRegistry()

// 3 layers of 2×1: y=0 stone, stone; y=1 a double oak slab, an oak door (lower);
// y=2 air, the door's upper half. Region 1 (at y=10) holds an unknown block and fire.
function house() {
  return makeSchematic([
    {
      size: [2, 3, 1],
      palette: [
        'minecraft:stone',
        'minecraft:oak_slab[type=double,waterlogged=false]',
        'minecraft:oak_door[facing=north,half=lower,hinge=left,open=false,powered=false]',
        'minecraft:oak_door[facing=north,half=upper,hinge=left,open=false,powered=false]',
        'minecraft:air',
      ],
      blocks: [0, 0, 1, 2, 4, 3],
    },
    {
      position: [5, 10, 0],
      size: [2, 1, 1],
      palette: ['othermod:lamp[lit=true]', 'minecraft:fire[age=0,east=false,north=false,south=false,up=false,west=false]'],
      blocks: [0, 1],
    },
  ])
}

describe('computeMaterials', () => {
  it('groups by item with stacks and shulker boxes', () => {
    const list = computeMaterials(house(), [], registry)
    expect(list.rows.map((r) => [r.item, r.count, r.unknown])).toEqual([
      ['minecraft:oak_slab', 2, false],
      ['minecraft:stone', 2, false],
      ['minecraft:oak_door', 1, false],
      ['othermod:lamp', 1, true],
    ])
    expect(list.rows[0]).toMatchObject({ stackSize: 64, stacks: 1, shulkerBoxes: 1, blocks: ['minecraft:oak_slab'] })
    expect(list.itemless).toEqual([{ block: 'minecraft:fire', count: 1 }])
  })

  it('merges block states and blocks that share an item', () => {
    const s = makeSchematic([{
      size: [3, 1, 1],
      palette: ['minecraft:torch', 'minecraft:wall_torch[facing=north]', 'minecraft:wall_torch[facing=east]'],
      blocks: [0, 1, 2],
    }])
    expect(computeMaterials(s, [], registry).rows).toEqual([{
      item: 'minecraft:torch', count: 3, stackSize: 64, stacks: 1, shulkerBoxes: 1,
      blocks: ['minecraft:torch', 'minecraft:wall_torch'], unknown: false,
    }])
  })

  it('follows the scope: visible layers and box selection', () => {
    expect(computeMaterials(house(), [{ kind: 'yRange', minY: 0, maxY: 0 }], registry).rows.map((r) => r.item)).toEqual(['minecraft:stone'])
    const box = { min: { x: 1, y: 1, z: 0 }, max: { x: 1, y: 2, z: 0 } }
    expect(computeMaterials(house(), [{ kind: 'box', box }], registry).rows.map((r) => [r.item, r.count])).toEqual([['minecraft:oak_door', 1]])
  })

  it('treats blocks unknown to this version as unknown, even in the minecraft namespace', () => {
    const s = makeSchematic([{ size: [1, 1, 1], palette: ['minecraft:removed_block'] }])
    expect(computeMaterials(s, [], registry).rows).toMatchObject([{ item: 'minecraft:removed_block', unknown: true }])
  })

  it('returns empty lists for an all-air schematic', () => {
    expect(computeMaterials(makeSchematic([{ size: [2, 2, 2], palette: ['minecraft:air'] }]), [], registry)).toEqual({ rows: [], itemless: [] })
  })
})

describe('stack math', () => {
  it.each([
    [1, 64, 1, 1],
    [64, 64, 1, 1],
    [65, 64, 2, 1],
    [1728, 64, 27, 1],
    [1729, 64, 28, 2],
    [17, 16, 2, 1],
    [28, 1, 28, 2],
  ])('%i items at stack %i need %i stacks and %i shulker boxes', (count, size, stacks, boxes) => {
    expect(stacksFor(count, size)).toBe(stacks)
    expect(shulkerBoxesFor(count, size)).toBe(boxes)
  })
})

describe('sortMaterials / filterMaterials', () => {
  const rows = computeMaterials(house(), [], registry).rows

  it('sorts by item or by a number, either direction', () => {
    expect(sortMaterials(rows, 'item', 'asc').map((r) => r.item)).toEqual([
      'minecraft:oak_door', 'minecraft:oak_slab', 'minecraft:stone', 'othermod:lamp',
    ])
    expect(sortMaterials(rows, 'count', 'asc').map((r) => r.count)).toEqual([1, 1, 2, 2])
  })

  it('filters by item or block name, matching spaces to underscores', () => {
    expect(filterMaterials(rows, 'Oak Slab').map((r) => r.item)).toEqual(['minecraft:oak_slab'])
    expect(filterMaterials(rows, '  ')).toHaveLength(4)
  })
})

describe('export', () => {
  const list = computeMaterials(house(), [], registry)

  it('writes CSV with a header, notes and CRLF line endings', () => {
    expect(materialsToCsv(list)).toBe([
      'Item,Count,Stacks,Shulker boxes,Note',
      'minecraft:oak_slab,2,1,1,',
      'minecraft:stone,2,1,1,',
      'minecraft:oak_door,1,1,1,',
      'othermod:lamp,1,1,1,unknown',
      'minecraft:fire,1,,,itemless',
      '',
    ].join('\r\n'))
  })

  it('quotes CSV fields that need it', () => {
    const csv = materialsToCsv({ rows: [{ item: 'mod:a,"b"', count: 1, stackSize: 64, stacks: 1, shulkerBoxes: 1, blocks: [], unknown: true }], itemless: [] })
    expect(csv.split('\r\n')[1]).toBe('"mod:a,""b""",1,1,1,unknown')
  })

  it('writes text with stack breakdowns and an itemless section', () => {
    const text = materialsToText({
      rows: [
        { item: 'minecraft:stone', count: 2000, stackSize: 64, stacks: 32, shulkerBoxes: 2, blocks: ['minecraft:stone'], unknown: false },
        { item: 'othermod:lamp', count: 1, stackSize: 64, stacks: 1, shulkerBoxes: 1, blocks: ['othermod:lamp'], unknown: true },
      ],
      itemless: [{ block: 'minecraft:fire', count: 3 }],
    })
    expect(text).toBe([
      '2000 × minecraft:stone (1 shulker box + 4 stacks + 16)',
      '1 × othermod:lamp [unknown]',
      '',
      'Itemless:',
      '3 × minecraft:fire',
      '',
    ].join('\n'))
  })

  it.each([
    [10, 64, ''],
    [64, 64, '1 stack'],
    [130, 64, '2 stacks + 2'],
    [3456, 64, '2 shulker boxes'],
    [20, 16, '1 stack + 4'],
    [5, 1, ''],
  ])('breaks %i items at stack %i into "%s"', (count, size, text) => {
    expect(formatBreakdown(count, size)).toBe(text)
  })
})
