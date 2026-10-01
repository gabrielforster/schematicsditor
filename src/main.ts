// Temporary dev harness: open → 3D view → inspect/replace → save. Replaced by the React UI in Plan 4.
import { Editor } from './core/edit/editor'
import { parseMatcher } from './core/edit/matchers'
import { saveLitematic } from './core/litematic/save'
import type { Schematic } from './core/model'
import { bundledRegistry, normalizeBlockName } from './core/registry'
import { SchematicRenderer, type RenderMode, type RenderStatus } from './render'
import { parseLitematicInWorker, ParseFailure } from './workers/parseClient'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const input = $<HTMLInputElement>('file')
const saveButton = $<HTMLButtonElement>('save')
const out = $<HTMLPreElement>('out')
const hover = $<HTMLDivElement>('hover')
const num = (id: string) => Number($<HTMLInputElement>(id).value)

const renderer = new SchematicRenderer($('viewport'))
let current: Schematic | undefined
let editor: Editor | undefined
let summary = ''

function showStatus(s: RenderStatus): void {
  $<HTMLSelectElement>('mode').value = s.mode
  $<HTMLButtonElement>('retry').hidden = s.assets.state !== 'failed'
  const lines = [
    summary,
    `mode: ${s.mode} (drawing ${s.effectiveMode}), assets: ${s.assets.state}` +
      (s.assets.state === 'ready' ? ` ${s.assets.version}${s.assets.exact ? '' : ' (closest)'}` : '') +
      (s.assets.state === 'failed' ? ` — ${s.assets.message}` : ''),
    `chunks: ${s.chunks.total} total, ${s.chunks.queued} queued, ${s.chunks.meshing} meshing, ${s.chunks.failed} failed`,
  ]
  if (s.assets.state === 'ready' && s.assets.newerThanKnown) lines.push('Warning: this file is newer than every known Minecraft version; using the latest textures.')
  if (s.suggestColored) lines.push('Large region: colored mode will be faster.')
  out.textContent = lines.join('\n')
}
renderer.on('status', showStatus)
renderer.on('hover', (hit) => {
  hover.textContent = hit ? `${hit.state} @ ${hit.world.x} ${hit.world.y} ${hit.world.z} (${hit.regionName})` : ''
})
renderer.on('selection', (box) => {
  const values = box ? [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z] : ['', '', '', '', '', '']
  ;['bx0', 'by0', 'bz0', 'bx1', 'by1', 'bz1'].forEach((id, i) => { $<HTMLInputElement>(id).value = String(values[i]) })
})
renderer.on('click', ({ hit, event }) => {
  if (hit && event.altKey) $<HTMLInputElement>('from').value = hit.state // eyedropper
})

input.addEventListener('change', async () => {
  const file = input.files?.[0]
  if (!file) return
  out.textContent = 'Reading…'
  try {
    current = await parseLitematicInWorker(await file.arrayBuffer())
    editor = new Editor(current, bundledRegistry())
    editor.subscribe(() => { $<HTMLButtonElement>('undo').disabled = !editor?.canUndo })
    saveButton.disabled = false
    $<HTMLButtonElement>('replace').disabled = false
    summary = `${current.metadata.name} by ${current.metadata.author}, data version ${current.dataVersion}`
    renderer.load(current, editor)
    $('regions').replaceChildren(...current.regions.map((r, i) => {
      const label = document.createElement('label')
      const box = Object.assign(document.createElement('input'), { type: 'checkbox', checked: true })
      box.addEventListener('change', () => renderer.setRegionVisible(i, box.checked))
      label.append(box, ` ${r.name} (${r.size.x}×${r.size.y}×${r.size.z})`, document.createElement('br'))
      return label
    }))
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

$<HTMLSelectElement>('mode').addEventListener('change', (e) => renderer.setMode((e.target as HTMLSelectElement).value as RenderMode))
$('retry').addEventListener('click', () => renderer.retryAssets())
$('fit').addEventListener('click', () => renderer.fitToView())
$<HTMLInputElement>('fly').addEventListener('change', (e) => renderer.setFlyMode((e.target as HTMLInputElement).checked))

function showLayers(): void {
  const r = renderer.layerRange
  $<HTMLInputElement>('minY').value = r ? String(r.minY) : ''
  $<HTMLInputElement>('maxY').value = r ? String(r.maxY) : ''
  $<HTMLInputElement>('single').checked = r !== null && r.minY === r.maxY
}
$('applyLayers').addEventListener('click', () => {
  const minY = num('minY')
  renderer.setLayerRange({ minY, maxY: $<HTMLInputElement>('single').checked ? minY : num('maxY') })
  showLayers()
})
$('allLayers').addEventListener('click', () => {
  renderer.setLayerRange(null)
  showLayers()
})
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
  renderer.stepLayer(e.key === 'ArrowUp' ? 1 : -1)
  showLayers()
  e.preventDefault()
})

$('applyHighlight').addEventListener('click', () => {
  const names = $<HTMLInputElement>('highlight').value.split(',').map((s) => s.trim()).filter(Boolean).map(normalizeBlockName)
  renderer.setHighlight(names.length > 0 ? names : null)
})
$('clearHighlight').addEventListener('click', () => renderer.setHighlight(null))

$('pickBox').addEventListener('click', () => renderer.startBoxSelection())
$('clearBox').addEventListener('click', () => renderer.setSelection(null))
$('applyBox').addEventListener('click', () => renderer.setSelection({
  min: { x: num('bx0'), y: num('by0'), z: num('bz0') },
  max: { x: num('bx1'), y: num('by1'), z: num('bz1') },
}))

$('replace').addEventListener('click', () => {
  if (!editor) return
  try {
    const from = parseMatcher($<HTMLInputElement>('from').value, editor.registry)
    const result = editor.replace([{ from: [from], to: { name: normalizeBlockName($<HTMLInputElement>('to').value.trim()) } }], [])
    out.textContent = `Replaced ${result.count} blocks.`
  } catch (e) {
    out.textContent = String(e)
  }
})
$('undo').addEventListener('click', () => editor?.undo())
