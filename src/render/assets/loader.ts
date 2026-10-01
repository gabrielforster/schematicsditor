import { prepareAtlas, type AtlasImage, type AtlasRects } from './atlas'
import type { AssetFetcher } from './cache'
import type { TexturedAssets } from './resources'
import { selectAssetVersion, type McVersion, type VersionChoice } from './versions'

export const MCMETA_RAW = 'https://raw.githubusercontent.com/misode/mcmeta'
export const VERSIONS_URL = `${MCMETA_RAW}/summary/versions/data.json`

/** mcmeta URLs for one version: every version has `<id>-summary` and `<id>-atlas` tags. */
export function assetUrls(versionId: string) {
  const id = encodeURIComponent(versionId)
  return {
    blockDefinitions: `${MCMETA_RAW}/${id}-summary/assets/block_definition/data.min.json`,
    models: `${MCMETA_RAW}/${id}-summary/assets/model/data.min.json`,
    atlasImage: `${MCMETA_RAW}/${id}-atlas/all/atlas.png`,
    atlasRects: `${MCMETA_RAW}/${id}-atlas/all/data.min.json`,
  }
}

/** Decodes a PNG blob to RGBA (browser: createImageBitmap + canvas). */
export type DecodeImage = (blob: Blob) => Promise<AtlasImage>

export interface LoadedAssets {
  choice: VersionChoice
  /** For the mesh workers. */
  assets: TexturedAssets
  /** The atlas with the white strip, for the GPU texture. */
  atlas: AtlasImage
}

export class AssetLoadError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'AssetLoadError'
  }
}

/**
 * Loads textured-mode assets for a file's data version (spec §8.2): picks
 * the version, then fetches block definitions, models and the texture atlas
 * through the cache. Any failure becomes an AssetLoadError.
 */
export async function loadTexturedAssets(dataVersion: number, fetcher: AssetFetcher, decode: DecodeImage): Promise<LoadedAssets> {
  try {
    const versions = (await (await fetcher.get(VERSIONS_URL, false)).json()) as McVersion[]
    const choice = selectAssetVersion(versions, dataVersion)
    const urls = assetUrls(choice.version.id)
    const [blockDefinitionsJson, modelsJson, rects, image] = await Promise.all([
      fetcher.get(urls.blockDefinitions, true).then((r) => r.text()),
      fetcher.get(urls.models, true).then((r) => r.text()),
      fetcher.get(urls.atlasRects, true).then((r) => r.json() as Promise<AtlasRects>),
      fetcher.get(urls.atlasImage, true).then((r) => r.blob()).then(decode),
    ])
    const prepared = prepareAtlas(image, rects)
    return {
      choice,
      assets: { version: choice.version.id, blockDefinitionsJson, modelsJson, textures: prepared.textures, white: prepared.white },
      atlas: prepared.image,
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    throw new AssetLoadError(`Could not load block textures: ${message}`, { cause: e })
  }
}
