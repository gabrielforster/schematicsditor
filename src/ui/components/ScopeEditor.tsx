import { useEffect, useState } from 'react'
import type { Box } from '../../core/edit/scopes'
import type { LayerRange } from '../../render'
import type { ScopeForm } from '../logic/scopeForm'

interface Props {
  form: ScopeForm
  onChange: (form: ScopeForm) => void
  regionNames: readonly string[]
  selection: Box | null
  layerRange: LayerRange | null
}

const boxText = (b: Box) => `${b.min.x}..${b.max.x}, ${b.min.y}..${b.max.y}, ${b.min.z}..${b.max.z}`

/** Scope checkboxes (spec §9.1): selected regions, Y range, box selection; checked scopes intersect. */
export function ScopeEditor({ form, onChange, regionNames, selection, layerRange }: Props) {
  const set = (patch: Partial<ScopeForm>) => onChange({ ...form, ...patch })
  return (
    <fieldset className="scope-editor">
      <legend>Scope</legend>
      <p className="hint">Only blocks inside every checked scope change. Nothing checked means the whole schematic.</p>
      <label className="row">
        <input type="checkbox" checked={form.regions.on} onChange={(e) => set({ regions: { ...form.regions, on: e.target.checked } })} />
        Selected regions
      </label>
      {form.regions.on && (
        <div className="row" role="group" aria-label="Regions in scope">
          {regionNames.map((name, id) => (
            <label key={id}>
              <input
                type="checkbox"
                checked={form.regions.ids.includes(id)}
                onChange={(e) => set({
                  regions: {
                    on: true,
                    ids: e.target.checked ? [...form.regions.ids, id].sort((a, b) => a - b) : form.regions.ids.filter((x) => x !== id),
                  },
                })}
              />
              {' '}{name}
            </label>
          ))}
        </div>
      )}
      <label className="row">
        <input type="checkbox" checked={form.yRange.on} onChange={(e) => set({ yRange: { ...form.yRange, on: e.target.checked } })} />
        Y range
      </label>
      {form.yRange.on && (
        <div className="row">
          <CommitNumber label="Scope min Y" value={form.yRange.minY} onCommit={(minY) => set({ yRange: { ...form.yRange, minY } })} />
          to
          <CommitNumber label="Scope max Y" value={form.yRange.maxY} onCommit={(maxY) => set({ yRange: { ...form.yRange, maxY } })} />
        </div>
      )}
      <div className="row">
        <button
          type="button"
          disabled={!layerRange}
          title="Copy the Y range of the layer view"
          onClick={() => layerRange && set({ yRange: { on: true, minY: String(layerRange.minY), maxY: String(layerRange.maxY) } })}
        >
          Use layer range
        </button>
      </div>
      <label className="row">
        <input type="checkbox" checked={form.box.on} onChange={(e) => set({ box: { on: e.target.checked } })} />
        Box selection
        <span className="hint">{selection ? boxText(selection) : '(none selected)'}</span>
      </label>
    </fieldset>
  )
}

/**
 * A number input that commits on blur or Enter, so the (full-scan) preview
 * runs once per value instead of on every keystroke.
 */
function CommitNumber({ label, value, onCommit }: { label: string; value: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const commit = () => {
    if (draft !== value) onCommit(draft)
  }
  return (
    <input
      type="number"
      step={1}
      aria-label={label}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
      }}
    />
  )
}
