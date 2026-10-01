import { afterEach, describe, expect, it, vi } from 'vitest'
import { cachedFetcher, type CacheLike } from '../../../src/render/assets/cache'
import { assetUrls, AssetLoadError, loadTexturedAssets, VERSIONS_URL } from '../../../src/render/assets/loader'
import { testAtlas } from '../../helpers/assets'

class MemoryCache implements CacheLike {
  readonly entries = new Map<string, Response>()
  async match(url: string) {
    return this.entries.get(url)?.clone()
  }
  async put(url: string, response: Response) {
    this.entries.set(url, response)
  }
}

const VERSIONS = [
  { id: '26.3', type: 'release', stable: true, data_version: 5023 },
  { id: '1.20.1', type: 'release', stable: true, data_version: 3465 },
]

function fakeNetwork(files: Record<string, string | Blob>) {
  const calls: string[] = []
  const fetchFn = async (url: string) => {
    calls.push(url)
    const body = files[url]
    return body === undefined ? new Response('missing', { status: 404, statusText: 'Not Found' }) : new Response(body)
  }
  return { calls, fetchFn }
}

function filesFor(id: string): Record<string, string | Blob> {
  const urls = assetUrls(id)
  const atlas = testAtlas()
  return {
    [VERSIONS_URL]: JSON.stringify(VERSIONS),
    [urls.blockDefinitions]: '{"stone":{"variants":{"":{"model":"block/stone"}}}}',
    [urls.models]: '{"block/stone":{}}',
    [urls.atlasRects]: JSON.stringify(atlas.rects),
    [urls.atlasImage]: new Blob(['png']),
  }
}

const decode = async () => {
  const a = testAtlas()
  return { width: a.width, height: a.height, data: a.data }
}

describe('cachedFetcher', () => {
  it('serves immutable URLs from the cache after the first fetch', async () => {
    const net = fakeNetwork({ 'u': 'hello' })
    const f = cachedFetcher(new MemoryCache(), net.fetchFn)
    expect(await (await f.get('u', true)).text()).toBe('hello')
    expect(await (await f.get('u', true)).text()).toBe('hello')
    expect(net.calls).toEqual(['u'])
  })

  it('refreshes mutable URLs and falls back to the cache when offline', async () => {
    const cache = new MemoryCache()
    const online = fakeNetwork({ 'v': 'list' })
    await cachedFetcher(cache, online.fetchFn).get('v', false)
    const offline = cachedFetcher(cache, async () => { throw new TypeError('Failed to fetch') })
    expect(await (await offline.get('v', false)).text()).toBe('list')
  })

  it('throws on HTTP errors and works without a cache', async () => {
    const f = cachedFetcher(null, fakeNetwork({}).fetchFn)
    await expect(f.get('nope', true)).rejects.toThrow('404')
  })

  it('warns when the cache refuses a response and still returns it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const full: CacheLike = { match: async () => undefined, put: async () => { throw new Error('QuotaExceededError') } }
    const res = await cachedFetcher(full, fakeNetwork({ a: 'body' }).fetchFn).get('a', true)
    expect(await res.text()).toBe('body')
    expect(warn).toHaveBeenCalledOnce()
    expect(String(warn.mock.calls[0]![0])).toContain('a')
  })
})

afterEach(() => vi.restoreAllMocks())

describe('loadTexturedAssets', () => {
  it('loads the version matching the data version', async () => {
    const net = fakeNetwork(filesFor('1.20.1'))
    const loaded = await loadTexturedAssets(3465, cachedFetcher(null, net.fetchFn), decode)
    expect(loaded.choice).toMatchObject({ exact: true, newerThanKnown: false })
    expect(loaded.assets.version).toBe('1.20.1')
    expect(loaded.assets.blockDefinitionsJson).toContain('stone')
    expect(loaded.assets.textures['block/stone']).toBeDefined()
    expect(loaded.atlas.height).toBe(testAtlas().height + 16)
    expect(net.calls).toContain(assetUrls('1.20.1').atlasImage)
  })

  it('loads the newest release and flags files newer than every known version', async () => {
    const loaded = await loadTexturedAssets(9999, cachedFetcher(null, fakeNetwork(filesFor('26.3')).fetchFn), decode)
    expect(loaded.choice).toMatchObject({ newerThanKnown: true })
    expect(loaded.assets.version).toBe('26.3')
  })

  it('wraps any failure in AssetLoadError', async () => {
    const files = filesFor('26.3')
    delete files[assetUrls('26.3').models]
    const p = loadTexturedAssets(5023, cachedFetcher(null, fakeNetwork(files).fetchFn), decode)
    await expect(p).rejects.toThrow(AssetLoadError)
    await expect(p).rejects.toThrow('Could not load block textures')
  })

  it('fails when offline with nothing cached', async () => {
    const offline = cachedFetcher(new MemoryCache(), async () => { throw new TypeError('Failed to fetch') })
    await expect(loadTexturedAssets(5023, offline, decode)).rejects.toThrow(AssetLoadError)
  })
})
