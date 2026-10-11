import { describe, expect, it } from 'vitest'
import { NbtString } from 'deepslate/nbt'
import { readLitematic } from '../../../src/core/litematic/read'
import { diffSchematics } from '../../../src/core/litematic/save'
import { deserializeSchematic, serializeSchematic } from '../../../src/core/litematic/serialize'
import { writeNbt } from '../../../src/core/nbt'
import { litematicNbt, tileEntity } from '../../helpers/litematicNbt'

const spec = {
  previewImage: [1, 2],
  rootExtra: { Custom: new NbtString('root') },
  regions: [{
    position: [5, 0, 10] as [number, number, number],
    size: [-2, 1, -1] as [number, number, number],
    palette: ['minecraft:air', 'minecraft:chest[facing=east]'],
    blocks: [0, 1],
    tileEntities: [tileEntity('minecraft:chest', 1, 0, 0), tileEntity('minecraft:sign', 9, 9, 9)],
    extra: { Mod: new NbtString('region') },
  }],
}

describe('serializeSchematic / deserializeSchematic', () => {
  it('survives structured clone with transfer', () => {
    const original = readLitematic(writeNbt(litematicNbt(spec)))
    const reference = readLitematic(writeNbt(litematicNbt(spec)))
    const { data, transfer } = serializeSchematic(original)
    const cloned = structuredClone(data, { transfer })
    expect(diffSchematics(reference, deserializeSchematic(cloned))).toEqual([])
  })

  it('transfers every region block buffer', () => {
    const s = readLitematic(writeNbt(litematicNbt(spec)))
    const { transfer } = serializeSchematic(s)
    expect(transfer).toEqual([s.regions[0]!.blocks.buffer])
  })
})
