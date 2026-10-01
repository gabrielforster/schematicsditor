import { describe, expect, it } from 'vitest'
import { readLitematic } from '../../src/core/litematic/read'
import { serializeSchematic } from '../../src/core/litematic/serialize'
import { blockKeys, makeSchematic } from '../helpers/model'
import { handleSaveRequest } from '../../src/workers/saveProtocol'

const NOW = 1800000000000

describe('handleSaveRequest', () => {
  it('returns gzip bytes of the schematic and transfers them', async () => {
    const s = makeSchematic([{ size: [2, 1, 1], palette: ['minecraft:air', 'minecraft:stone'], blocks: [1, 0] }])
    const { response, transfer } = await handleSaveRequest({ schematic: serializeSchematic(s).data, now: NOW })
    if (!response.ok) throw new Error(response.details)
    const back = readLitematic(response.bytes)
    expect(blockKeys(back.regions[0]!)).toEqual(['minecraft:stone', 'minecraft:air'])
    expect(back.metadata.timeModified).toBe(NOW)
    expect(transfer).toEqual([response.bytes.buffer])
  })

  it('reports a round-trip mismatch with every difference in the details', async () => {
    // Two regions with one name collapse into one NBT key: the file would lose a region.
    const s = makeSchematic([
      { name: 'same', size: [1, 1, 1], palette: ['minecraft:stone'] },
      { name: 'same', size: [1, 1, 1], palette: ['minecraft:dirt'] },
    ])
    const { response } = await handleSaveRequest({ schematic: serializeSchematic(s).data, now: NOW })
    expect(response).toMatchObject({ ok: false, code: 'round-trip' })
    if (response.ok) return
    expect(response.message).toBe('The saved file would not load back as this schematic, so it was not downloaded.')
    expect(response.details).toContain('region count: 2 ≠ 1')
  })
})
