import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReplacePreview } from '../../core/edit/replace'
import { useApp, useController } from '../hooks'
import { pickerNames } from '../logic/blockSearch'
import { addFrom, buildReplace, emptyReplaceForm, targetOf, type ReplaceForm } from '../logic/replaceForm'
import { BlockPicker } from './BlockPicker'
import { ScopeEditor } from './ScopeEditor'

const n = (count: number, word: string) => `${count.toLocaleString('en-US')} ${word}${count === 1 ? '' : 's'}`

/**
 * Spec §9.1: several "from" matchers, a target with property overrides,
 * combined scopes, a live preview with the block entity warning, apply and
 * delete. Alt+click in the view adds the clicked state to "from".
 */
export function ReplaceTab({ active }: { active: boolean }) {
  const controller = useController()
  const { registry } = controller.services
  const doc = useApp((s) => s.doc)
  const selection = useApp((s) => s.selection)
  const layerRange = useApp((s) => s.layerRange)
  const picked = useApp((s) => s.picked)
  const [form, setForm] = useState<ReplaceForm>(emptyReplaceForm)
  const [fromInput, setFromInput] = useState('')
  const [toInput, setToInput] = useState('')

  const schematic = doc?.schematic ?? null
  useEffect(() => {
    setForm(emptyReplaceForm)
    setFromInput('')
    setToInput('')
  }, [schematic])

  // Eyedropper: each new pick (seq) adds the clicked state once.
  const lastPick = useRef(0)
  useEffect(() => {
    if (picked && picked.seq !== lastPick.current) {
      lastPick.current = picked.seq
      setForm((f) => addFrom(f, picked.state))
    }
  }, [picked])

  const fromNames = useMemo(() => pickerNames(registry.names(), schematic), [registry, schematic])
  const built = useMemo(() => buildReplace(form, registry, selection), [form, registry, selection])
  const previews = useMemo(() => {
    if (!active || !doc || !built.ok) return null
    const replace = built.replaceRule ? doc.editor.previewReplace([built.replaceRule], built.scopes) : null
    const del = doc.editor.previewReplace([built.deleteRule], built.scopes)
    return { replace, delete: del }
  }, [active, doc, built])

  if (!doc) return <p className="hint">Open a schematic to replace blocks.</p>

  let target = null
  try {
    target = targetOf(form)
  } catch {
    target = null
  }
  const def = target && registry.get(target.name)
  const capBytes = doc.editor.history.capBytes

  return (
    <div className="replace-tab">
      <section>
        <h2>Replace</h2>
        <BlockPicker
          label="Block to replace"
          names={fromNames}
          value={fromInput}
          placeholder="oak_stairs, oak_stairs[half=top], …"
          onChange={setFromInput}
          onPick={(v) => {
            setForm((f) => addFrom(f, v))
            setFromInput('')
          }}
        />
        <div className="chips">
          {form.from.map((text) => (
            <span key={text} className="chip">
              {text}
              <button type="button" aria-label={`Remove ${text}`} onClick={() => setForm((f) => ({ ...f, from: f.from.filter((x) => x !== text) }))}>×</button>
            </span>
          ))}
        </div>
        <p className="hint">A name matches every state; add <code>[property=value]</code> to narrow it. Alt+click a block in the view to add its exact state.</p>
        {!built.ok && built.field === 'from' && form.from.length > 0 && <p className="field-error">{built.error}</p>}
      </section>
      <section>
        <h2>With</h2>
        <BlockPicker
          label="Replacement block"
          names={registry.names()}
          value={toInput}
          placeholder="andesite, air, …"
          onChange={setToInput}
          onPick={(v) => {
            setForm((f) => ({ ...f, to: v, toProperties: {} }))
            setToInput('')
          }}
        />
        {form.to && <p>Target: <code>{form.to}</code></p>}
        {def && Object.keys(def.properties).length > 0 && (
          <div className="props">
            {Object.entries(def.properties).map(([prop, values]) => (
              <label key={prop} style={{ display: 'contents' }}>
                <span>{prop}</span>
                <select
                  aria-label={prop}
                  value={form.toProperties[prop] ?? ''}
                  onChange={(e) => setForm((f) => {
                    const toProperties = { ...f.toProperties }
                    if (e.target.value === '') delete toProperties[prop]
                    else toProperties[prop] = e.target.value
                    return { ...f, toProperties }
                  })}
                >
                  <option value="">carry over (default {def.defaults[prop]})</option>
                  {values.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </label>
            ))}
          </div>
        )}
        {!built.ok && built.field === 'to' && <p className="field-error">{built.error}</p>}
      </section>
      <section>
        <ScopeEditor
          form={form.scope}
          onChange={(scope) => setForm((f) => ({ ...f, scope }))}
          regionNames={doc.schematic.regions.map((r) => r.name)}
          selection={selection}
          layerRange={layerRange}
        />
        {!built.ok && built.field === 'scope' && <p className="field-error">{built.error}</p>}
      </section>
      <section>
        {previews && <PreviewText replace={previews.replace} remove={previews.delete} capBytes={capBytes} />}
        <div className="row">
          <button
            type="button"
            className="primary"
            disabled={!built.ok || !built.replaceRule || !previews?.replace || previews.replace.count === 0}
            onClick={() => built.ok && built.replaceRule && controller.replace([built.replaceRule], built.scopes)}
          >
            Replace
          </button>
          <button
            type="button"
            disabled={!built.ok || !previews || previews.delete.count === 0}
            onClick={() => built.ok && controller.delete(built.from, built.scopes)}
          >
            Delete
          </button>
        </div>
      </section>
    </div>
  )
}

function PreviewText({ replace, remove, capBytes }: { replace: ReplacePreview | null; remove: ReplacePreview; capBytes: number }) {
  return (
    <div className="preview" role="status" aria-label="Preview">
      <p>{n(remove.count, 'block')} match.{replace && ` ${n(replace.count, 'block')} will change.`}</p>
      {replace && replace.blockEntitiesDropped > 0 && (
        <p className="warning">{n(replace.blockEntitiesDropped, 'block entity')} (container contents, sign text, …) will be dropped.</p>
      )}
      {replace && replace.blockEntitiesKept > 0 && (
        <p className="hint">{n(replace.blockEntitiesKept, 'block entity')} of the same type will be kept.</p>
      )}
      {!replace && remove.blockEntitiesDropped > 0 && (
        <p className="warning">Delete drops {n(remove.blockEntitiesDropped, 'block entity')}.</p>
      )}
      {(replace ?? remove).undoBytes > capBytes && <p className="warning">This edit is too large to undo.</p>}
    </div>
  )
}
