import { useEffect, useState } from 'react'
import type { Box } from '../../core/edit/scopes'
import { volumeOf } from '../../core/model'
import { schematicYBounds } from '../../render/chunks/layers'
import { useApp, useController } from '../hooks'

/** Spec §11 left panel: regions, box selection, Y range. */
export function LeftPanel() {
  const doc = useApp((s) => s.doc)
  return (
    <aside className="panel left" aria-label="Schematic">
      {doc ? (
        <>
          <RegionsSection />
          <SelectionSection />
          <LayersSection />
        </>
      ) : (
        <section><p className="hint">No schematic open.</p></section>
      )}
    </aside>
  )
}

function RegionsSection() {
  const controller = useController()
  const doc = useApp((s) => s.doc)!
  const hidden = useApp((s) => s.hiddenRegions)
  const stats = controller.regionStats()
  return (
    <section>
      <h2>Regions</h2>
      {doc.schematic.regions.map((region, id) => (
        <label key={id} className="region">
          <input type="checkbox" checked={!hidden.includes(id)} onChange={(e) => controller.setRegionVisible(id, e.target.checked)} />
          <span>{region.name}</span>
          <span className="hint">{region.size.x}×{region.size.y}×{region.size.z}</span>
          <span className="count">{(stats[id]?.blocks ?? 0).toLocaleString('en-US')} blocks</span>
        </label>
      ))}
    </section>
  )
}

const AXES = ['x', 'y', 'z'] as const
type Draft = Record<'min' | 'max', Record<'x' | 'y' | 'z', string>>

const draftFor = (box: Box | null): Draft => ({
  min: { x: box ? String(box.min.x) : '', y: box ? String(box.min.y) : '', z: box ? String(box.min.z) : '' },
  max: { x: box ? String(box.max.x) : '', y: box ? String(box.max.y) : '', z: box ? String(box.max.z) : '' },
})

/** The box a draft describes, or null when any field is not a whole number. */
export function boxFromDraft(draft: Draft): Box | null {
  const n = (s: string) => (/^-?\d+$/.test(s.trim()) ? Number(s) : NaN)
  const min = { x: n(draft.min.x), y: n(draft.min.y), z: n(draft.min.z) }
  const max = { x: n(draft.max.x), y: n(draft.max.y), z: n(draft.max.z) }
  return [...Object.values(min), ...Object.values(max)].some(Number.isNaN) ? null : { min, max }
}

function SelectionSection() {
  const controller = useController()
  const selection = useApp((s) => s.selection)
  const selecting = useApp((s) => s.selecting)
  const [draft, setDraft] = useState(() => draftFor(selection))
  useEffect(() => setDraft(draftFor(selection)), [selection])
  const box = boxFromDraft(draft)
  const size = selection && {
    x: selection.max.x - selection.min.x + 1, y: selection.max.y - selection.min.y + 1, z: selection.max.z - selection.min.z + 1,
  }
  return (
    <section>
      <h2>Selection</h2>
      <div className="row">
        {selecting
          ? <button type="button" onClick={() => controller.cancelBoxSelection()}>Cancel picking</button>
          : <button type="button" onClick={() => controller.startBoxSelection()}>Pick corners</button>}
        <button type="button" disabled={!selection} onClick={() => controller.setSelection(null)}>Clear</button>
      </div>
      <form
        className="coords"
        onSubmit={(e) => {
          e.preventDefault()
          if (box) controller.setSelection(box)
        }}
      >
        <span />
        {AXES.map((a) => <span key={a} className="hint">{a.toUpperCase()}</span>)}
        {(['min', 'max'] as const).map((corner) => (
          <CornerRow key={corner} corner={corner} draft={draft} setDraft={setDraft} />
        ))}
        <span />
        <button type="submit" disabled={!box} style={{ gridColumn: 'span 3' }}>Apply</button>
      </form>
      {size && <p className="hint">{size.x}×{size.y}×{size.z} = {volumeOf(size).toLocaleString('en-US')} blocks</p>}
    </section>
  )
}

function CornerRow({ corner, draft, setDraft }: { corner: 'min' | 'max'; draft: Draft; setDraft: (d: Draft) => void }) {
  return (
    <>
      <span>{corner}</span>
      {AXES.map((a) => (
        <input
          key={a}
          type="number"
          step={1}
          aria-label={`${corner} ${a}`}
          value={draft[corner][a]}
          onChange={(e) => setDraft({ ...draft, [corner]: { ...draft[corner], [a]: e.target.value } })}
        />
      ))}
    </>
  )
}

function LayersSection() {
  const controller = useController()
  const doc = useApp((s) => s.doc)!
  const layerRange = useApp((s) => s.layerRange)
  const bounds = schematicYBounds(doc.schematic)
  if (!bounds) return null
  const range = layerRange ?? bounds
  const single = layerRange !== null && layerRange.minY === layerRange.maxY
  const slider = (label: string, value: number, onChange: (v: number) => void) => (
    <label className="row">
      <span>{label}</span>
      <input type="range" min={bounds.minY} max={bounds.maxY} step={1} value={value} aria-label={label} onChange={(e) => onChange(Number(e.target.value))} />
      <span>{value}</span>
    </label>
  )
  return (
    <section>
      <h2>Layers</h2>
      {single
        ? slider('Layer Y', range.minY, (v) => controller.setLayerRange({ minY: v, maxY: v }))
        : (
          <>
            {slider('From Y', range.minY, (v) => controller.setLayerRange({ minY: v, maxY: Math.max(v, range.maxY) }))}
            {slider('To Y', range.maxY, (v) => controller.setLayerRange({ minY: Math.min(v, range.minY), maxY: v }))}
          </>
        )}
      <div className="row">
        <label>
          <input
            type="checkbox"
            checked={single}
            onChange={(e) => controller.setLayerRange(e.target.checked ? { minY: range.maxY, maxY: range.maxY } : null)}
          />
          {' '}Single layer
        </label>
        <button type="button" title="Layer up (↑)" aria-label="Layer up" onClick={() => controller.stepLayer(1)}>↑</button>
        <button type="button" title="Layer down (↓)" aria-label="Layer down" onClick={() => controller.stepLayer(-1)}>↓</button>
        <button type="button" disabled={layerRange === null} onClick={() => controller.setLayerRange(null)}>All layers</button>
      </div>
    </section>
  )
}
