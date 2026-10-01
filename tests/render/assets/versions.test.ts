import { describe, expect, it } from 'vitest'
import { selectAssetVersion, type McVersion } from '../../../src/render/assets/versions'

const v = (id: string, data_version: number, type = 'release'): McVersion => ({ id, type, stable: type === 'release', data_version })
// Newest first, like mcmeta's list.
const VERSIONS = [
  v('26.4-snapshot-2', 5120, 'snapshot'),
  v('26.3', 5023),
  v('26.3-rc1', 5019, 'snapshot'),
  v('1.21.4', 4189),
  v('1.20.1', 3465),
  v('1.14', 1952),
]

describe('selectAssetVersion', () => {
  it('picks the version with the same data version', () => {
    expect(selectAssetVersion(VERSIONS, 3465)).toEqual({ version: VERSIONS[4], exact: true, newerThanKnown: false })
  })

  it('matches snapshots exactly too', () => {
    expect(selectAssetVersion(VERSIONS, 5120).version.id).toBe('26.4-snapshot-2')
  })

  it('prefers a release when several versions share a data version', () => {
    const list = [v('1.21.4-rc3', 4189, 'snapshot'), ...VERSIONS]
    expect(selectAssetVersion(list, 4189).version.id).toBe('1.21.4')
  })

  it('falls back to the newest release and warns for files newer than anything known', () => {
    expect(selectAssetVersion(VERSIONS, 6000)).toEqual({ version: VERSIONS[1], exact: false, newerThanKnown: true })
  })

  it('uses the oldest release at or after an unknown data version', () => {
    expect(selectAssetVersion(VERSIONS, 3500)).toEqual({ version: VERSIONS[3], exact: false, newerThanKnown: false })
  })

  it('gives 1.13 files (data versions 1519 to 1631) the oldest known assets', () => {
    expect(selectAssetVersion(VERSIONS, 1631).version.id).toBe('1.14')
  })

  it('falls back to the newest release for a snapshot newer than every release', () => {
    expect(selectAssetVersion(VERSIONS, 5100)).toEqual({ version: VERSIONS[1], exact: false, newerThanKnown: false })
  })

  it('throws when no release is listed', () => {
    expect(() => selectAssetVersion([v('x', 1, 'snapshot')], 1)).toThrow('no releases')
  })
})
