import { describe, expect, it } from 'vitest'
import { deserializeSchematic } from '../../src/core/litematic/serialize'
import { writeNbt } from '../../src/core/nbt'
import { handleParseRequest } from '../../src/workers/parseProtocol'
import { litematicNbt } from '../helpers/litematicNbt'

const toBuffer = (bytes: Uint8Array) => bytes.slice().buffer

describe('handleParseRequest', () => {
  it('returns a serialized schematic and its transferables', async () => {
    const bytes = writeNbt(litematicNbt({ regions: [{ size: [2, 1, 1], palette: ['minecraft:air', 'minecraft:stone'], blocks: [1, 0] }] }))
    const { response, transfer } = await handleParseRequest(toBuffer(bytes))
    if (!response.ok) throw new Error(response.message)
    expect(transfer).toHaveLength(1)
    expect(Array.from(deserializeSchematic(response.schematic).regions[0]!.blocks)).toEqual([1, 0])
  })

  it('reports the LitematicError code and a friendly message', async () => {
    const { response } = await handleParseRequest(toBuffer(new TextEncoder().encode('nope')))
    expect(response).toMatchObject({ ok: false, code: 'not-nbt', message: 'This file is not a valid NBT file.' })
  })

  it('includes the underlying cause in the technical details', async () => {
    const { response } = await handleParseRequest(toBuffer(new TextEncoder().encode('nope')))
    if (response.ok) throw new Error('expected failure')
    expect(response.details).toContain('Caused by:')
  })
})
