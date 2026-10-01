import { NbtCompound, NbtString } from 'deepslate/nbt'
import { describe, expect, it } from 'vitest'
import { blockStateKey } from '../../src/core/model'
import { bundledRegistry } from '../../src/core/registry'
import { RegionBuilder, resolveState } from '../../scripts/samples/regionBuilder'

const registry = bundledRegistry()

describe('resolveState', () => {
  it('completes a vanilla state with its default properties', () => {
    expect(blockStateKey(resolveState('oak_stairs[facing=east]', registry)))
      .toBe('minecraft:oak_stairs[facing=east,half=bottom,shape=straight,waterlogged=false]')
  })

  it('rejects unknown vanilla blocks and bad property values', () => {
    expect(() => resolveState('minecraft:not_a_block', registry)).toThrow(/Unknown block/)
    expect(() => resolveState('oak_stairs[facing=up]', registry)).toThrow(/cannot be "up"/)
  })

  it('passes mod blocks through unchanged', () => {
    expect(resolveState('examplemod:mystery_block[charge=3]', registry))
      .toEqual({ name: 'examplemod:mystery_block', properties: { charge: '3' } })
  })
})

describe('RegionBuilder', () => {
  it('builds palette indices in Litematica order with air at index 0', () => {
    const r = new RegionBuilder('r', { x: 0, y: 0, z: 0 }, { x: 2, y: 2, z: 1 }, registry)
      .set(1, 0, 0, 'stone').set(0, 1, 0, 'dirt').build()
    expect(r.palette.map(blockStateKey)).toEqual(['minecraft:air', 'minecraft:stone', 'minecraft:dirt'])
    expect([...r.blocks]).toEqual([0, 1, 2, 0])
  })

  it('refuses blocks outside the region', () => {
    const b = new RegionBuilder('r', { x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }, registry)
    expect(() => b.set(1, 0, 0, 'stone')).toThrow(RangeError)
  })

  it('stamps local coordinates on tile entities and keys them by block index', () => {
    const r = new RegionBuilder('r', { x: 0, y: 0, z: 0 }, { x: 2, y: 1, z: 2 }, registry)
      .set(1, 0, 1, 'chest')
      .tileEntity(1, 0, 1, new NbtCompound().set('id', new NbtString('minecraft:chest')))
      .build()
    const te = r.tileEntities.get(3)!
    expect([te.getNumber('x'), te.getNumber('y'), te.getNumber('z')]).toEqual([1, 0, 1])
  })
})
