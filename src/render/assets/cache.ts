/** The part of the Cache API the loader uses; tests pass an in-memory fake. */
export interface CacheLike {
  match(url: string): Promise<Response | undefined>
  put(url: string, response: Response): Promise<void>
}

export interface AssetFetcher {
  /**
   * Fetches `url`. Immutable URLs (versioned mcmeta tags) are served from the
   * cache when present. Mutable ones (the versions list) go to the network
   * first and fall back to the cache when offline.
   */
  get(url: string, immutable: boolean): Promise<Response>
}

export const ASSET_CACHE_NAME = 'mcmeta-assets-v1'

/** The browser's asset cache, or null where the Cache API is missing (insecure origins, Node). */
export async function openAssetCache(): Promise<CacheLike | null> {
  try {
    return typeof caches === 'undefined' ? null : await caches.open(ASSET_CACHE_NAME)
  } catch {
    return null
  }
}

export function cachedFetcher(cache: CacheLike | null, fetchFn: (url: string) => Promise<Response> = (u) => fetch(u)): AssetFetcher {
  const network = async (url: string): Promise<Response> => {
    const res = await fetchFn(url)
    if (!res.ok) throw new Error(`GET ${url}: ${res.status} ${res.statusText}`)
    await cache?.put(url, res.clone()).catch(() => undefined)
    return res
  }
  return {
    async get(url, immutable) {
      if (immutable) {
        const hit = await cache?.match(url)
        return hit ?? network(url)
      }
      try {
        return await network(url)
      } catch (e) {
        const hit = await cache?.match(url)
        if (hit) return hit
        throw e
      }
    },
  }
}
