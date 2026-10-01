import { useEffect, useMemo, useState } from 'react'
import { useApp, useController } from '../hooks'
import { buildFamilySwap, type FamilyForm } from '../logic/familyForm'
import { emptyScopeForm } from '../logic/scopeForm'
import { ScopeEditor } from './ScopeEditor'

const emptyForm: FamilyForm = { sourceId: '', targetId: '', scope: emptyScopeForm }
const n = (count: number, word: string) => `${count.toLocaleString('en-US')} ${word}${count === 1 ? '' : 's'}`

/** Spec §9.2: swap every shape of one family for another as one edit; unmatched shapes are listed. */
export function FamilySwapTab({ active }: { active: boolean }) {
  const controller = useController()
  const { families } = controller.services
  const doc = useApp((s) => s.doc)
  const selection = useApp((s) => s.selection)
  const layerRange = useApp((s) => s.layerRange)
  const [form, setForm] = useState<FamilyForm>(emptyForm)
  const schematic = doc?.schematic ?? null
  useEffect(() => setForm(emptyForm), [schematic])

  const built = useMemo(() => buildFamilySwap(form, families, selection), [form, families, selection])
  const preview = useMemo(
    () => (active && doc && built.ok ? doc.editor.previewFamilySwap(built.source, built.target, built.scopes) : null),
    [active, doc, built],
  )
  if (!doc) return <p className="hint">Open a schematic to swap block families.</p>

  const select = (label: string, value: string, onChange: (id: string) => void) => (
    <label className="row">
      <span>{label}</span>
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose…</option>
        {families.map((g) => (
          <optgroup key={g.id} label={g.label}>
            {g.families.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </optgroup>
        ))}
      </select>
    </label>
  )

  return (
    <div className="family-tab">
      <section>
        <h2>Family swap</h2>
        {select('From family', form.sourceId, (sourceId) => setForm((f) => ({ ...f, sourceId })))}
        {select('To family', form.targetId, (targetId) => setForm((f) => ({ ...f, targetId })))}
        <p className="hint">Every shape both families have (planks, stairs, slab, door, …) is swapped, keeping facing and other properties.</p>
      </section>
      <section>
        <ScopeEditor
          form={form.scope}
          onChange={(scope) => setForm((f) => ({ ...f, scope }))}
          regionNames={doc.schematic.regions.map((r) => r.name)}
          selection={selection}
          layerRange={layerRange}
        />
      </section>
      <section>
        {!built.ok && built.error && <p className="field-error">{built.error}</p>}
        {preview && (
          <div className="preview" role="status" aria-label="Preview">
            <p>{n(preview.count, 'block')} will change.</p>
            {preview.blockEntitiesDropped > 0 && (
              <p className="warning">{n(preview.blockEntitiesDropped, 'block entity')} will be dropped.</p>
            )}
            {preview.undoBytes > doc.editor.history.capBytes && <p className="warning">This edit is too large to undo.</p>}
            {preview.unmapped.length > 0 && (
              <>
                <p>Left unchanged (no counterpart in the target family):</p>
                <table className="materials">
                  <tbody>
                    {preview.unmapped.map((u) => (
                      <tr key={u.shape}>
                        <td>{u.shape}</td>
                        <td><code>{u.block.replace(/^minecraft:/, '')}</code></td>
                        <td className="num">{u.count.toLocaleString('en-US')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        )}
        <button
          type="button"
          className="primary"
          disabled={!built.ok || !preview || preview.count === 0}
          onClick={() => built.ok && controller.familySwap(built.source, built.target, built.scopes)}
        >
          Swap
        </button>
      </section>
    </div>
  )
}
