// Temporary dev harness for Plan 1: open → summary → save. Replaced by the React UI.
import { saveLitematic } from './core/litematic/save'
import type { Schematic } from './core/model'
import { parseLitematicInWorker, ParseFailure } from './workers/parseClient'

const input = document.querySelector<HTMLInputElement>('#file')!
const saveButton = document.querySelector<HTMLButtonElement>('#save')!
const out = document.querySelector<HTMLPreElement>('#out')!
let current: Schematic | undefined

input.addEventListener('change', async () => {
  const file = input.files?.[0]
  if (!file) return
  out.textContent = 'Reading…'
  try {
    current = await parseLitematicInWorker(await file.arrayBuffer())
    saveButton.disabled = false
    out.textContent = JSON.stringify({
      name: current.metadata.name,
      author: current.metadata.author,
      dataVersion: current.dataVersion,
      regions: current.regions.map((r) => ({ name: r.name, position: r.position, size: r.size, palette: r.palette.length })),
    }, null, 2)
  } catch (e) {
    out.textContent = e instanceof ParseFailure ? `${e.message}\n\n${e.details}` : String(e)
  }
})

saveButton.addEventListener('click', () => {
  if (!current) return
  try {
    const { bytes } = saveLitematic(current)
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/octet-stream' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: `${current.metadata.name || 'schematic'}.litematic` })
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  } catch (e) {
    out.textContent = String(e)
  }
})
