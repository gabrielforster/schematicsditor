// Unknown tags (here a long array, which deepslate JSON must carry as longs,
// not doubles) must survive saving, re-reading and the worker transport.
import { describe, expect, it } from 'vitest'
import { NbtCompound, NbtList, NbtLong, NbtLongArray } from 'deepslate/nbt'
import { readLitematic } from '../../../src/core/litematic/read'
import { saveLitematic, saveLitematicAsync } from '../../../src/core/litematic/save'
import { deserializeSchematic, serializeSchematic } from '../../../src/core/litematic/serialize'
import type { Schematic } from '../../../src/core/model'
import { makeSchematic } from '../../helpers/model'

const NOW = 1800000000000
const LONGS = [1n, -1n, 0x123456789abcdefn, -0x7fffffffffffffffn]
const longArray = () => new NbtLongArray(LONGS)

function withUnknownLongArrays(): Schematic {
  const s = makeSchematic([{ size: [2, 2, 2], palette: ['minecraft:air', 'minecraft:stone'], blocks: [0, 1, 0, 1, 1, 1, 0, 0] }])
  s.extra.set('Mod', new NbtCompound().set('LA', longArray()))
  s.regions[0]!.extra.set('Entities', new NbtList([new NbtCompound().set('UUIDL', longArray()).set('L', new NbtLong(5n))]))
  s.metadata.extra.set('MetaLA', longArray())
  return s
}

function expectUnknownLongArrays(s: Schematic): void {
  const root = s.extra.getCompound('Mod').get('LA')
  const entity = s.regions[0]!.extra.getList('Entities').get(0) as NbtCompound
  const meta = s.metadata.extra.get('MetaLA')
  for (const tag of [root, entity.get('UUIDL'), meta]) {
    expect(tag).toBeInstanceOf(NbtLongArray)
    expect(tag!.equals(longArray())).toBe(true)
  }
  expect(entity.get('L')?.equals(new NbtLong(5n))).toBe(true)
}

describe('unknown long arrays', () => {
  it('survive saveLitematic and re-reading', () => {
    const { bytes } = saveLitematic(withUnknownLongArrays(), NOW)
    expectUnknownLongArrays(readLitematic(bytes))
  })

  it('survive saveLitematicAsync, decoding to the same tags as saveLitematic', async () => {
    const { bytes } = await saveLitematicAsync(withUnknownLongArrays(), NOW)
    const reread = readLitematic(bytes)
    expectUnknownLongArrays(reread)
    // Compare the decoded content (gzip output may differ between implementations).
    const sync = readLitematic(saveLitematic(withUnknownLongArrays(), NOW).bytes)
    expect(reread.extra.equals(sync.extra)).toBe(true)
    expect(reread.metadata.extra.equals(sync.metadata.extra)).toBe(true)
    expect(reread.regions[0]!.extra.equals(sync.regions[0]!.extra)).toBe(true)
  })

  it('survive serialize, structured clone and deserialize (the worker transport) both ways', async () => {
    const original = withUnknownLongArrays()
    const sent = deserializeSchematic(structuredClone(serializeSchematic(original).data))
    expectUnknownLongArrays(sent)
    expect(sent.extra.equals(original.extra)).toBe(true)
    expect(sent.metadata.extra.equals(original.metadata.extra)).toBe(true)
    expect(sent.regions[0]!.extra.equals(original.regions[0]!.extra)).toBe(true)
    // Save what the worker received, re-read it, and send it back.
    const { bytes } = await saveLitematicAsync(sent, NOW)
    const { data, transfer } = serializeSchematic(readLitematic(bytes))
    const back = deserializeSchematic(structuredClone(data, { transfer }))
    expectUnknownLongArrays(back)
    expect(Array.from(back.regions[0]!.blocks)).toEqual(Array.from(original.regions[0]!.blocks))
  })
})
