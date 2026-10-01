import { describe, expect, it } from 'vitest'
import { baseName, downloadName } from '../../src/ui/app/fileName'

describe('downloadName', () => {
  it('uses the metadata name', () => {
    expect(downloadName('My Castle', 'x.litematic')).toBe('My Castle.litematic')
  })

  it('replaces characters no OS allows and trims dots and spaces', () => {
    expect(downloadName(' a/b:c*?"<>| . ', 'x.litematic')).toBe('a_b_c______.litematic')
  })

  it('falls back to the opened file name, then to "schematic"', () => {
    expect(downloadName('   ', 'tower.litematic')).toBe('tower.litematic')
    expect(downloadName('///', 'tower.LITEMATIC')).toBe('tower.litematic')
    expect(downloadName('', '')).toBe('schematic.litematic')
  })

  it('caps very long names', () => {
    expect(downloadName('x'.repeat(500), 'a.litematic')).toBe('x'.repeat(120) + '.litematic')
  })

  it('takes another extension for exports', () => {
    expect(downloadName('Castle', 'a.litematic', '-materials.csv')).toBe('Castle-materials.csv')
  })
})

describe('baseName', () => {
  it('drops the .litematic extension only', () => {
    expect(baseName('castle.litematic')).toBe('castle')
    expect(baseName('castle.nbt')).toBe('castle.nbt')
  })
})
