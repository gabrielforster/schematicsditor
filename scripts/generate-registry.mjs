// Snapshots Minecraft block and item data from misode/mcmeta into
// src/core/registry/{blocks,items}.json. Run by hand when a new Minecraft
// release ships, then commit the regenerated JSON.
//
//   node scripts/generate-registry.mjs            newest stable release
//   node scripts/generate-registry.mjs 1.21.4     a specific version id
import { writeFile } from 'node:fs/promises'

const RAW = 'https://raw.githubusercontent.com/misode/mcmeta'
const OUT = new URL('../src/core/registry/', import.meta.url)

async function getJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`GET ${url}: ${res.status} ${res.statusText}`)
  return res.json()
}

async function pickVersion(requested) {
  const versions = await getJson(`${RAW}/summary/versions/data.json`)
  const found = requested
    ? versions.find((v) => v.id === requested)
    : versions.find((v) => v.type === 'release' && v.stable)
  if (!found) throw new Error(requested ? `unknown Minecraft version: ${requested}` : 'no stable release found')
  return found
}

const version = await pickVersion(process.argv[2])
// Every version has a `<id>-summary` tag; the `summary` branch head is often a snapshot.
const ref = `${version.id}-summary`
const blocks = await getJson(`${RAW}/${ref}/blocks/data.json`)
const registries = await getJson(`${RAW}/${ref}/registries/data.json`)
const meta = JSON.stringify({ id: version.id, dataVersion: version.data_version })

const blockLines = Object.keys(blocks).sort().map((name) => `    ${JSON.stringify(name)}: ${JSON.stringify(blocks[name])}`)
await writeFile(new URL('blocks.json', OUT), `{\n  "version": ${meta},\n  "blocks": {\n${blockLines.join(',\n')}\n  }\n}\n`)

const items = [...registries.item].sort()
const itemLines = items.map((name) => `    ${JSON.stringify(name)}`)
await writeFile(new URL('items.json', OUT), `{\n  "version": ${meta},\n  "items": [\n${itemLines.join(',\n')}\n  ]\n}\n`)

console.log(`Wrote ${blockLines.length} blocks and ${items.length} items from Minecraft ${version.id} (data version ${version.data_version}).`)
