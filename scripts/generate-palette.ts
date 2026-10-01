// Generates src/render/palette/colors.json: average RGB and colored-mode
// flags per block, from misode/mcmeta textures and models (spec §8.3).
// Colored mode uses it offline. Run by hand after regenerating the block
// registry, then commit the JSON.
//
//   npm run generate:palette            the bundled registry's version
//   npm run generate:palette -- 1.21.4  a specific version id
import { writeFile } from 'node:fs/promises'
import { PNG } from 'pngjs'
import { BUNDLED_VERSION } from '../src/core/registry'
import { prepareAtlas, type AtlasRects } from '../src/render/assets/atlas'
import { TexturedResources } from '../src/render/assets/resources'
import { buildPalette, type BlocksData } from '../src/render/palette/build'

const RAW = 'https://raw.githubusercontent.com/misode/mcmeta'

async function get(url: string): Promise<Response> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`GET ${url}: ${res.status} ${res.statusText}`)
  return res
}

const id = process.argv[2] ?? BUNDLED_VERSION.id
const versions = (await (await get(`${RAW}/summary/versions/data.json`)).json()) as { id: string; data_version: number }[]
const version = versions.find((v) => v.id === id)
if (!version) throw new Error(`unknown Minecraft version: ${id}`)

const png = PNG.sync.read(Buffer.from(await (await get(`${RAW}/${id}-atlas/all/atlas.png`)).arrayBuffer()))
const rects = (await (await get(`${RAW}/${id}-atlas/all/data.min.json`)).json()) as AtlasRects
const atlas = prepareAtlas({ width: png.width, height: png.height, data: png.data }, rects)
const resources = new TexturedResources({
  version: id,
  blockDefinitionsJson: await (await get(`${RAW}/${id}-summary/assets/block_definition/data.min.json`)).text(),
  modelsJson: await (await get(`${RAW}/${id}-summary/assets/model/data.min.json`)).text(),
  textures: atlas.textures,
  white: atlas.white,
})
const blocks = (await (await get(`${RAW}/${id}-summary/blocks/data.json`)).json()) as BlocksData
const palette = buildPalette(resources, blocks)

const meta = JSON.stringify({ id, dataVersion: version.data_version })
const lines = Object.entries(palette).map(([name, entry]) => `    ${JSON.stringify(name)}: ${JSON.stringify(entry)}`)
await writeFile(
  new URL('../src/render/palette/colors.json', import.meta.url),
  `{\n  "version": ${meta},\n  "blocks": {\n${lines.join(',\n')}\n  }\n}\n`,
)
const hashed = Object.values(palette).filter(([color]) => color === null).length
console.log(`Wrote ${lines.length} block colors (${hashed} hash-colored) from Minecraft ${id}.`)
