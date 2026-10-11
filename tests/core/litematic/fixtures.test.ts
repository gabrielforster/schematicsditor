// Real .litematic files exported from the game. Drop them into
// tests/fixtures/ — every file there must survive read → save → read.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readLitematic } from '../../../src/core/litematic/read'
import { diffSchematics, saveLitematic } from '../../../src/core/litematic/save'
import { blockStateKey } from '../../../src/core/model'

const dir = join(import.meta.dirname, '../../fixtures')
const files = readdirSync(dir).filter((f) => f.endsWith('.litematic'))

describe.skipIf(files.length === 0)('real fixtures', () => {
  it.each(files)('%s round-trips through save', (file) => {
    const original = readLitematic(readFileSync(join(dir, file)))
    const { bytes, saved } = saveLitematic(original, original.metadata.timeModified)
    expect(diffSchematics(saved, readLitematic(bytes))).toEqual([])
  })

  it.each(files)('%s keeps every block state after save', (file) => {
    const original = readLitematic(readFileSync(join(dir, file)))
    const { saved } = saveLitematic(original, original.metadata.timeModified)
    original.regions.forEach((r, i) => {
      const s = saved.regions[i]!
      for (let b = 0; b < r.blocks.length; b++) {
        if (blockStateKey(r.palette[r.blocks[b]!]!) !== blockStateKey(s.palette[s.blocks[b]!]!)) {
          throw new Error(`${file}: region ${r.name} block ${b} changed`)
        }
      }
    })
  })
})
