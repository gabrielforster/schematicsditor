/** One entry of mcmeta's `summary/versions/data.json` (fields this app uses). */
export interface McVersion {
  id: string
  type: string
  stable: boolean
  data_version: number
}

export interface VersionChoice {
  version: McVersion
  /** The file's data version is exactly this version's. */
  exact: boolean
  /** The file is newer than every version mcmeta knows (spec §5: load with latest assets and warn). */
  newerThanKnown: boolean
}

/**
 * Picks the asset version for a file's `MinecraftDataVersion` (spec §5,
 * §8.2): the version with exactly that data version (a release when
 * several share it); for files newer than anything known, the newest
 * release with `newerThanKnown`; otherwise the oldest release at or after
 * the file's data version (mcmeta starts at 1.14, so 1.13 files get 1.14
 * assets), and the newest release when even that does not exist.
 */
export function selectAssetVersion(versions: readonly McVersion[], dataVersion: number): VersionChoice {
  const releases = versions.filter((v) => v.type === 'release').sort((a, b) => a.data_version - b.data_version)
  const newest = releases.at(-1)
  if (!newest) throw new Error('mcmeta lists no releases')
  const exact = versions.filter((v) => v.data_version === dataVersion)
  if (exact.length > 0) {
    return { version: exact.find((v) => v.type === 'release') ?? exact[0]!, exact: true, newerThanKnown: false }
  }
  const maxKnown = Math.max(...versions.map((v) => v.data_version))
  if (dataVersion > maxKnown) return { version: newest, exact: false, newerThanKnown: true }
  const next = releases.find((v) => v.data_version >= dataVersion)
  return { version: next ?? newest, exact: false, newerThanKnown: false }
}
